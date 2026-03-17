import re
from fastapi import APIRouter, HTTPException, Depends, status, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx

from database import get_db
from models.user import User
from schemas.user import UserRegister, UserLogin, Token, UserOut
from core.auth import hash_password, verify_password, create_access_token, get_current_user
import structlog

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)

PASSWORD_MIN_LENGTH = 8
PASSWORD_REGEX = re.compile(r"[0-9!@#$%^&*()\-_=+\[\]{};:',.<>?/\\|`~]")


def _validate_password(password: str) -> None:
    if len(password) < PASSWORD_MIN_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Le mot de passe doit contenir au moins {PASSWORD_MIN_LENGTH} caractères."
        )
    if not PASSWORD_REGEX.search(password):
        raise HTTPException(
            status_code=400,
            detail="Le mot de passe doit contenir au moins un chiffre ou caractère spécial."
        )


@router.post("/register", response_model=Token)
@limiter.limit("5/minute")
async def register(request: Request, data: UserRegister, db: AsyncSession = Depends(get_db)):
    _validate_password(data.password)
    # Check existing
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé.")

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    log.info("user_registered", user_id=user.id, email=user.email)

    token = create_access_token(user.id, user.email)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
async def login(request: Request, data: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect.",
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    token = create_access_token(user.id, user.email)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


@router.patch("/me", response_model=UserOut)
async def update_me(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    allowed = {"full_name", "onboarding_completed"}
    for field, value in payload.items():
        if field in allowed:
            setattr(current_user, field, value)
    await db.commit()
    await db.refresh(current_user)
    return UserOut.model_validate(current_user)


@router.post("/google", response_model=Token)
async def google_auth(
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    """Verify Google ID token and create/login user."""
    from config import settings

    credential = payload.get("credential")
    if not credential:
        raise HTTPException(status_code=400, detail="Missing Google credential")

    # Verify Google ID token
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://oauth2.googleapis.com/tokeninfo?id_token={credential}"
            )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid Google token")

        info = resp.json()

        # Verify audience if client ID is configured
        if settings.GOOGLE_CLIENT_ID and info.get("aud") != settings.GOOGLE_CLIENT_ID:
            raise HTTPException(status_code=401, detail="Token audience mismatch")

        google_id = info.get("sub")
        email = info.get("email")
        name = info.get("name", "")
        avatar = info.get("picture", "")

        if not google_id or not email:
            raise HTTPException(status_code=400, detail="Invalid Google token data")

    except HTTPException:
        raise
    except Exception as e:
        log.error("google_token_verify_error", error=str(e))
        raise HTTPException(status_code=401, detail="Google token verification failed")

    # Find existing user by google_id or email
    result = await db.execute(
        select(User).where(
            (User.google_id == google_id) | (User.email == email)
        )
    )
    user = result.scalar_one_or_none()

    if user:
        # Update Google info if not set
        if not user.google_id:
            user.google_id = google_id
        if avatar and not user.avatar_url:
            user.avatar_url = avatar
        await db.commit()
        await db.refresh(user)
    else:
        # Create new user
        user = User(
            email=email,
            hashed_password=None,
            full_name=name,
            google_id=google_id,
            avatar_url=avatar,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        log.info("google_user_created", user_id=user.id, email=email)

    token = create_access_token(user.id, user.email)
    return Token(access_token=token, user=UserOut.model_validate(user))
