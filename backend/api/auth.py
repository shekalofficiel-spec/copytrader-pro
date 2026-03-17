"""
Authentication API — login, register, 2FA, device verification, sessions.
"""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Depends, status, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
import httpx

from database import get_db
from models.user import User
from models.session import UserSession, DeviceOTP, TrustedDevice
from schemas.user import UserRegister, UserLogin, Token, UserOut
from core.auth import hash_password, verify_password, create_access_token, get_current_user
from core.security import (
    validate_password_strength, generate_totp_secret, get_totp_uri, generate_qr_base64,
    verify_totp, generate_backup_codes, verify_backup_code,
    create_temp_token, decode_temp_token,
    fingerprint, hash_otp, generate_otp,
    detect_device_type, mask_email,
)
import structlog

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)

# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _get_ua(request: Request) -> str:
    return request.headers.get("user-agent", "unknown")[:500]


async def _create_session(user_id: int, ua: str, ip: str, db: AsyncSession) -> UserSession:
    session = UserSession(
        user_id=user_id,
        user_agent=ua,
        ip_address=ip,
        device_type=detect_device_type(ua),
        is_active=True,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(session)
    await db.flush()
    return session


async def _is_trusted_device(user_id: int, ua: str, ip: str, db: AsyncSession) -> bool:
    fp = fingerprint(ua, ip)
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(TrustedDevice).where(
            TrustedDevice.user_id == user_id,
            TrustedDevice.device_fingerprint == fp,
            TrustedDevice.expires_at > now,
        )
    )
    return result.scalar_one_or_none() is not None


async def _trust_device(user_id: int, ua: str, ip: str, db: AsyncSession) -> None:
    fp = fingerprint(ua, ip)
    # Remove old entry if exists
    await db.execute(
        delete(TrustedDevice).where(
            TrustedDevice.user_id == user_id,
            TrustedDevice.device_fingerprint == fp,
        )
    )
    device = TrustedDevice(
        user_id=user_id,
        device_fingerprint=fp,
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.add(device)


# ── Register ───────────────────────────────────────────────────────────────────

@router.post("/register", response_model=Token)
@limiter.limit("3/hour")
async def register(request: Request, data: UserRegister, db: AsyncSession = Depends(get_db)):
    errors = validate_password_strength(data.password, data.email)
    if errors:
        raise HTTPException(status_code=400, detail=" ".join(errors))

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

    # Auto-trust first device on register
    await _trust_device(user.id, _get_ua(request), _get_ip(request), db)
    await _create_session(user.id, _get_ua(request), _get_ip(request), db)
    await db.commit()

    token = create_access_token(user.id, user.email)
    return Token(access_token=token, user=UserOut.model_validate(user))


# ── Login ──────────────────────────────────────────────────────────────────────

@router.post("/login")
@limiter.limit("5/15minutes")
async def login(request: Request, data: UserLogin, db: AsyncSession = Depends(get_db)):
    ip = _get_ip(request)
    ua = _get_ua(request)

    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    # Generic error to avoid email enumeration
    if not user or not user.hashed_password or not verify_password(data.password, user.hashed_password):
        if user:
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            user.last_failed_login = datetime.now(timezone.utc)
            await db.commit()
            # Alert after 5 failures
            if user.failed_login_attempts >= 5 and user.failed_login_attempts % 5 == 0:
                try:
                    from services.security_email import send_security_email, suspicious_login_email
                    await send_security_email(
                        user.email,
                        "🚨 Tentatives de connexion suspectes — CopyTrader Pro",
                        suspicious_login_email(ip, user.failed_login_attempts),
                    )
                except Exception:
                    pass
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email ou mot de passe incorrect.")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Compte désactivé.")

    # Reset failed attempts on success
    user.failed_login_attempts = 0
    await db.flush()

    # ── 2FA check ────────────────────────────────────────────────────────────
    if user.totp_enabled:
        temp = create_temp_token(user.id, "2fa", expire_minutes=5)
        await db.commit()
        return {"requires_2fa": True, "temp_token": temp}

    # ── New device check ─────────────────────────────────────────────────────
    trusted = await _is_trusted_device(user.id, ua, ip, db)
    if not trusted:
        otp = generate_otp()
        device_otp = DeviceOTP(
            user_id=user.id,
            code_hash=hash_otp(otp),
            device_fingerprint=fingerprint(ua, ip),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
        )
        db.add(device_otp)
        await db.commit()

        # Send email
        try:
            from services.security_email import send_security_email, new_device_email
            await send_security_email(
                user.email,
                "🔐 Connexion depuis un nouvel appareil — CopyTrader Pro",
                new_device_email(otp, detect_device_type(ua), ip, mask_email(user.email)),
            )
        except Exception as e:
            log.warning("device_otp_email_failed", error=str(e))

        temp = create_temp_token(user.id, "device", expire_minutes=10)
        return {
            "requires_device_verification": True,
            "temp_token": temp,
            "masked_email": mask_email(user.email),
        }

    # ── Normal login ─────────────────────────────────────────────────────────
    await _create_session(user.id, ua, ip, db)
    await db.commit()

    token = create_access_token(user.id, user.email)
    return Token(access_token=token, user=UserOut.model_validate(user))


# ── Current user ───────────────────────────────────────────────────────────────

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


# ── 2FA Setup ──────────────────────────────────────────────────────────────────

@router.post("/2fa/setup")
async def setup_2fa(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.totp_enabled:
        raise HTTPException(400, "Le 2FA est déjà activé.")

    secret = generate_totp_secret()
    uri = get_totp_uri(secret, current_user.email)
    qr_b64 = generate_qr_base64(uri)
    plain_codes, hashed_codes = generate_backup_codes()

    # Store secret and backup codes (NOT yet enabled — user must verify first)
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one()
    user.totp_secret = secret
    user.backup_codes = hashed_codes
    await db.commit()

    return {
        "qr_code": f"data:image/png;base64,{qr_b64}",
        "secret": secret,  # for manual entry
        "backup_codes": plain_codes,
        "message": "Scanne le QR code puis confirme avec ton code à 6 chiffres.",
    }


@router.post("/2fa/verify-setup")
async def verify_setup_2fa(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    code = str(payload.get("code", "")).strip()
    if not current_user.totp_secret:
        raise HTTPException(400, "Lance d'abord POST /2fa/setup.")

    if not verify_totp(current_user.totp_secret, code):
        raise HTTPException(400, "Code TOTP invalide. Vérifie l'heure de ton téléphone.")

    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one()
    user.totp_enabled = True
    await db.commit()

    # Security notification
    try:
        from services.security_email import send_security_email, two_fa_changed_email
        await send_security_email(
            user.email,
            "🔒 2FA activé sur ton compte — CopyTrader Pro",
            two_fa_changed_email(enabled=True),
        )
    except Exception:
        pass

    return {"success": True, "message": "2FA activé avec succès."}


@router.post("/2fa/disable")
async def disable_2fa(
    payload: dict,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    password = payload.get("password", "")
    code = str(payload.get("code", "")).strip()

    if not current_user.totp_enabled:
        raise HTTPException(400, "Le 2FA n'est pas activé.")
    if not verify_password(password, current_user.hashed_password or ""):
        raise HTTPException(400, "Mot de passe incorrect.")
    if not verify_totp(current_user.totp_secret or "", code):
        raise HTTPException(400, "Code TOTP invalide.")

    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one()
    user.totp_enabled = False
    user.totp_secret = None
    user.backup_codes = None
    await db.commit()

    try:
        from services.security_email import send_security_email, two_fa_changed_email
        await send_security_email(
            user.email,
            "⚠️ 2FA désactivé sur ton compte — CopyTrader Pro",
            two_fa_changed_email(enabled=False),
        )
    except Exception:
        pass

    return {"success": True, "message": "2FA désactivé."}


# ── 2FA Login verification ─────────────────────────────────────────────────────

@router.post("/2fa/verify", response_model=Token)
@limiter.limit("5/minute")
async def verify_2fa(request: Request, payload: dict, db: AsyncSession = Depends(get_db)):
    temp_token = payload.get("temp_token", "")
    code = str(payload.get("code", "")).strip()

    user_id = decode_temp_token(temp_token, "2fa")
    if not user_id:
        raise HTTPException(401, "Token expiré ou invalide. Reconnecte-toi.")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.totp_enabled:
        raise HTTPException(401, "Compte introuvable.")

    # Try TOTP first, then backup codes
    valid = verify_totp(user.totp_secret or "", code)
    if not valid and user.backup_codes:
        ok, updated = verify_backup_code(code, user.backup_codes)
        if ok:
            user.backup_codes = updated
            valid = True

    if not valid:
        raise HTTPException(400, "Code invalide. Vérifie ton application ou utilise un code de secours.")

    await _create_session(user.id, _get_ua(request), _get_ip(request), db)
    await db.commit()

    token = create_access_token(user.id, user.email)
    return Token(access_token=token, user=UserOut.model_validate(user))


# ── Device verification ────────────────────────────────────────────────────────

@router.post("/verify-device", response_model=Token)
@limiter.limit("5/minute")
async def verify_device(request: Request, payload: dict, db: AsyncSession = Depends(get_db)):
    temp_token = payload.get("temp_token", "")
    code = str(payload.get("code", "")).strip()
    trust_device = bool(payload.get("trust_device", True))

    user_id = decode_temp_token(temp_token, "device")
    if not user_id:
        raise HTTPException(401, "Token expiré. Reconnecte-toi.")

    ua = _get_ua(request)
    ip = _get_ip(request)
    fp = fingerprint(ua, ip)
    now = datetime.now(timezone.utc)

    # Find valid OTP
    result = await db.execute(
        select(DeviceOTP).where(
            DeviceOTP.user_id == user_id,
            DeviceOTP.device_fingerprint == fp,
            DeviceOTP.used == False,
            DeviceOTP.expires_at > now,
        ).order_by(DeviceOTP.created_at.desc())
    )
    otp_row = result.scalar_one_or_none()
    if not otp_row or otp_row.code_hash != hash_otp(code):
        raise HTTPException(400, "Code invalide ou expiré.")

    otp_row.used = True

    if trust_device:
        await _trust_device(user_id, ua, ip, db)

    result2 = await db.execute(select(User).where(User.id == user_id))
    user = result2.scalar_one()

    await _create_session(user.id, ua, ip, db)
    await db.commit()

    token = create_access_token(user.id, user.email)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.post("/verify-device/resend")
@limiter.limit("3/minute")
async def resend_device_code(request: Request, payload: dict, db: AsyncSession = Depends(get_db)):
    temp_token = payload.get("temp_token", "")
    user_id = decode_temp_token(temp_token, "device")
    if not user_id:
        raise HTTPException(401, "Token expiré. Reconnecte-toi.")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Utilisateur introuvable.")

    ua = _get_ua(request)
    ip = _get_ip(request)
    otp = generate_otp()
    device_otp = DeviceOTP(
        user_id=user_id,
        code_hash=hash_otp(otp),
        device_fingerprint=fingerprint(ua, ip),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    db.add(device_otp)
    await db.commit()

    try:
        from services.security_email import send_security_email, new_device_email
        await send_security_email(
            user.email,
            "🔐 Code de vérification — CopyTrader Pro",
            new_device_email(otp, detect_device_type(ua), ip, mask_email(user.email)),
        )
    except Exception as e:
        log.warning("resend_otp_email_failed", error=str(e))

    return {"success": True, "message": "Nouveau code envoyé."}


# ── Sessions ───────────────────────────────────────────────────────────────────

@router.get("/sessions")
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(UserSession).where(
            UserSession.user_id == current_user.id,
            UserSession.is_active == True,
            UserSession.expires_at > now,
        ).order_by(UserSession.last_active.desc())
    )
    sessions = result.scalars().all()
    return [
        {
            "id": s.id,
            "device_type": s.device_type,
            "ip_address": s.ip_address,
            "user_agent": (s.user_agent or "")[:80],
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "last_active": s.last_active.isoformat() if s.last_active else None,
        }
        for s in sessions
    ]


@router.delete("/sessions/{session_id}")
async def revoke_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserSession).where(
            UserSession.id == session_id,
            UserSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session introuvable.")
    session.is_active = False
    await db.commit()
    return {"success": True}


@router.delete("/sessions")
async def revoke_all_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        delete(UserSession).where(UserSession.user_id == current_user.id)
    )
    await db.commit()
    return {"success": True, "message": "Toutes les sessions révoquées."}


# ── Google OAuth ───────────────────────────────────────────────────────────────

@router.post("/google", response_model=Token)
async def google_auth(request: Request, payload: dict, db: AsyncSession = Depends(get_db)):
    from config import settings as cfg
    credential = payload.get("credential")
    if not credential:
        raise HTTPException(status_code=400, detail="Missing Google credential")

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={credential}")
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid Google token")

        info = resp.json()
        if cfg.GOOGLE_CLIENT_ID and info.get("aud") != cfg.GOOGLE_CLIENT_ID:
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

    result = await db.execute(
        select(User).where((User.google_id == google_id) | (User.email == email))
    )
    user = result.scalar_one_or_none()

    if user:
        if not user.google_id:
            user.google_id = google_id
        if avatar and not user.avatar_url:
            user.avatar_url = avatar
    else:
        user = User(
            email=email, hashed_password=None, full_name=name,
            google_id=google_id, avatar_url=avatar,
        )
        db.add(user)
        await db.flush()

    await _trust_device(user.id, _get_ua(request), _get_ip(request), db)
    await _create_session(user.id, _get_ua(request), _get_ip(request), db)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id, user.email)
    return Token(access_token=token, user=UserOut.model_validate(user))
