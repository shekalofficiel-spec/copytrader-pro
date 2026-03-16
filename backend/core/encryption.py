import base64
import json
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from config import settings


def _get_fernet() -> Fernet:
    key = settings.ENCRYPTION_KEY.encode()
    # Pad/hash to exactly 32 bytes for Fernet key derivation
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"copytrader_salt_v1",
        iterations=100_000,
    )
    derived = base64.urlsafe_b64encode(kdf.derive(key))
    return Fernet(derived)


def encrypt_credentials(credentials: dict) -> str:
    f = _get_fernet()
    plaintext = json.dumps(credentials).encode()
    return f.encrypt(plaintext).decode()


def decrypt_credentials(encrypted: str) -> dict:
    f = _get_fernet()
    plaintext = f.decrypt(encrypted.encode())
    return json.loads(plaintext)
