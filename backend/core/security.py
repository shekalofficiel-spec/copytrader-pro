"""
Security utilities: password validation, TOTP, session management, device fingerprinting.
"""
from __future__ import annotations
import hashlib
import hmac
import io
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import pyotp
import qrcode
import qrcode.image.svg
from base64 import b64encode
from jose import JWTError, jwt
from passlib.context import CryptContext

from config import settings

# ── Password Validation ────────────────────────────────────────────────────────

COMMON_PASSWORDS = {
    "password","password1","password123","123456","12345678","1234567890","qwerty","abc123",
    "letmein","monkey","dragon","master","sunshine","princess","welcome","shadow","iloveyou",
    "superman","michael","football","liverpool","chelsea","arsenal","pokemon","starwars",
    "batman","admin","login","pass","test","hello","111111","000000","654321","696969",
    "123123","121212","112233","1q2w3e","qwerty123","qwertyuiop","azerty","1qaz2wsx",
    "trustno1","whatever","passw0rd","p@ssword","p@$$w0rd","changeme","secret","abc",
    "baseball","hockey","soccer","mustang","access","flower","summer","winter","spring",
    "autumn","birthday","january","february","december","freedom","nothing","asshole",
    "cheese","butter","hello123","monkey123","dragon123","hunter","harley","ranger",
    "dakota","gandalf","pepper","ginger","thomas","charlie","george","jordan","hunter2",
}

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def validate_password_strength(password: str, email: str = "") -> list[str]:
    """Returns list of error messages. Empty list = password is valid."""
    errors = []
    if len(password) < 10:
        errors.append("Minimum 10 caractères requis.")
    if not re.search(r"[A-Z]", password):
        errors.append("Au moins 1 majuscule requise.")
    if not re.search(r"[a-z]", password):
        errors.append("Au moins 1 minuscule requise.")
    if not re.search(r"[0-9]", password):
        errors.append("Au moins 1 chiffre requis.")
    if not re.search(r"[!@#$%^&*()\-_=+\[\]{};:',.<>?/\\|`~]", password):
        errors.append("Au moins 1 caractère spécial requis (!@#$%^&* etc).")
    if email and email.split("@")[0].lower() in password.lower():
        errors.append("Le mot de passe ne peut pas contenir ton email.")
    if password.lower() in COMMON_PASSWORDS:
        errors.append("Ce mot de passe est trop commun.")
    return errors


def score_password(password: str) -> int:
    """Returns 0-4 score for frontend strength bar."""
    score = 0
    if len(password) >= 10: score += 1
    if re.search(r"[A-Z]", password) and re.search(r"[a-z]", password): score += 1
    if re.search(r"[0-9]", password): score += 1
    if re.search(r"[!@#$%^&*()\-_=+\[\]{};:',.<>?/\\|`~]", password): score += 1
    return score


# ── TOTP / 2FA ─────────────────────────────────────────────────────────────────

def generate_totp_secret() -> str:
    return pyotp.random_base32()


def get_totp_uri(secret: str, email: str) -> str:
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=email, issuer_name="CopyTrader Pro")


def generate_qr_base64(uri: str) -> str:
    """Generate QR code as base64 PNG string."""
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return b64encode(buf.getvalue()).decode()


def verify_totp(secret: str, code: str) -> bool:
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)  # allow 30s drift


def generate_backup_codes() -> tuple[list[str], list[str]]:
    """Returns (plain_codes, hashed_codes). Store only hashed, show plain once."""
    plain = [secrets.token_hex(4).upper() for _ in range(8)]  # e.g. "A3F2B1C9"
    hashed = [hashlib.sha256(c.encode()).hexdigest() for c in plain]
    return plain, hashed


def verify_backup_code(code: str, hashed_codes: list[str]) -> tuple[bool, list[str]]:
    """Returns (match, updated_codes_list_with_used_code_removed)."""
    h = hashlib.sha256(code.upper().encode()).hexdigest()
    if h in hashed_codes:
        updated = [c for c in hashed_codes if c != h]
        return True, updated
    return False, hashed_codes


# ── Temp Tokens (2FA / Device pending) ────────────────────────────────────────

TEMP_TOKEN_EXPIRE_MINUTES = 5
DEVICE_TOKEN_EXPIRE_MINUTES = 10
ALGORITHM = "HS256"


def create_temp_token(user_id: int, token_type: str, expire_minutes: int) -> str:
    """token_type: '2fa' | 'device'"""
    expire = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)
    return jwt.encode(
        {"sub": str(user_id), "type": token_type, "exp": expire, "jti": str(uuid.uuid4())},
        settings.SECRET_KEY, algorithm=ALGORITHM,
    )


def decode_temp_token(token: str, expected_type: str) -> Optional[int]:
    """Returns user_id if valid, None otherwise."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != expected_type:
            return None
        user_id = payload.get("sub")
        return int(user_id) if user_id else None
    except JWTError:
        return None


# ── Device Fingerprinting ──────────────────────────────────────────────────────

def fingerprint(user_agent: str, ip: str) -> str:
    """Stable hash of (user_agent, ip) used to identify a device."""
    raw = f"{user_agent}|{ip}"
    return hmac.new(settings.SECRET_KEY.encode(), raw.encode(), hashlib.sha256).hexdigest()


def hash_otp(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def generate_otp() -> str:
    """6-digit numeric OTP."""
    return f"{secrets.randbelow(1000000):06d}"


# ── Session Utils ──────────────────────────────────────────────────────────────

def detect_device_type(user_agent: str) -> str:
    ua = user_agent.lower()
    if any(k in ua for k in ("mobile", "android", "iphone", "ipad")):
        return "mobile"
    return "desktop"


def mask_email(email: str) -> str:
    """t***@***.com"""
    parts = email.split("@")
    local = parts[0]
    domain_parts = parts[1].split(".")
    return f"{local[0]}***@{'*' * len(domain_parts[0])}.{domain_parts[-1]}"
