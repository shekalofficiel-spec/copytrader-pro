"""
Security notification emails: new device, 2FA changes, password change, suspicious logins.
"""
from __future__ import annotations
import structlog
from services.notification_service import notification_service

log = structlog.get_logger(__name__)

# ── HTML Templates ─────────────────────────────────────────────────────────────

_BASE = """
<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  .wrap{max-width:560px;margin:40px auto;background:#141414;border:1px solid #242424;border-radius:16px;overflow:hidden}
  .header{padding:28px 32px;border-bottom:1px solid #1e1e1e}
  .logo{font-size:18px;font-weight:800;color:#c8f135;letter-spacing:-0.5px}
  .body{padding:32px}
  .title{font-size:20px;font-weight:700;color:#fff;margin:0 0 8px}
  .sub{font-size:14px;color:#666;margin:0 0 24px}
  .code-box{background:#0f0f0f;border:2px solid #c8f135;border-radius:12px;padding:20px;text-align:center;margin:20px 0}
  .code{font-size:36px;font-weight:800;letter-spacing:8px;color:#c8f135;font-family:monospace}
  .code-note{font-size:12px;color:#555;margin-top:8px}
  .info-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #1e1e1e;font-size:13px}
  .info-label{color:#666}.info-val{color:#fff;font-weight:500}
  .alert{background:#f87171/10;border:1px solid rgba(248,113,113,.3);border-radius:10px;padding:14px;margin:20px 0;font-size:13px;color:#f87171}
  .footer{padding:20px 32px;border-top:1px solid #1e1e1e;font-size:12px;color:#444;text-align:center}
  .btn{display:inline-block;margin-top:20px;padding:12px 24px;background:#c8f135;color:#0f0f0f;font-weight:700;font-size:13px;border-radius:10px;text-decoration:none}
</style></head><body>
"""
_FOOTER = """
  <div class="footer">CopyTrader Pro — Ne jamais partager ces codes. Si tu n'es pas l'origine de cette action, change ton mot de passe immédiatement.</div>
</div></body></html>
"""


def _wrap(header_title: str, body: str) -> str:
    return f"""{_BASE}
<div class="wrap">
  <div class="header"><span class="logo">⚡ CopyTrader Pro</span></div>
  <div class="body">
    {body}
  </div>
  {_FOOTER}
"""


def new_device_email(otp: str, device: str, ip: str, masked_email: str) -> str:
    return _wrap("Nouvel appareil détecté", f"""
<div class="title">Connexion depuis un nouvel appareil</div>
<div class="sub">Un code de vérification a été envoyé à {masked_email}</div>
<div class="info-row"><span class="info-label">Appareil</span><span class="info-val">{device}</span></div>
<div class="info-row"><span class="info-label">Adresse IP</span><span class="info-val">{ip}</span></div>
<div class="code-box">
  <div class="code">{otp}</div>
  <div class="code-note">Code valable 10 minutes</div>
</div>
<div class="alert">⚠️ Si ce n'est pas toi, <strong>change ton mot de passe immédiatement</strong>.</div>
""")


def password_changed_email(ip: str) -> str:
    return _wrap("Mot de passe modifié", f"""
<div class="title">Ton mot de passe a été modifié</div>
<div class="sub">Si tu n'es pas à l'origine de ce changement, agis immédiatement.</div>
<div class="info-row"><span class="info-label">IP</span><span class="info-val">{ip}</span></div>
<div class="alert">🔒 Si ce n'est pas toi, contacte le support et change ton mot de passe.</div>
""")


def two_fa_changed_email(enabled: bool) -> str:
    action = "activée" if enabled else "désactivée"
    return _wrap(f"2FA {action}", f"""
<div class="title">Authentification 2FA {action}</div>
<div class="sub">L'authentification à deux facteurs a été {action} sur ton compte.</div>
<div class="alert">⚠️ Si tu n'as pas effectué cette action, sécurise ton compte immédiatement.</div>
""")


def suspicious_login_email(ip: str, attempts: int) -> str:
    return _wrap("Activité suspecte détectée", f"""
<div class="title">Tentatives de connexion suspectes</div>
<div class="sub">{attempts} tentatives de connexion échouées ont été détectées.</div>
<div class="info-row"><span class="info-label">IP source</span><span class="info-val">{ip}</span></div>
<div class="alert">🚨 Si ce n'est pas toi, change ton mot de passe et active le 2FA.</div>
""")


# ── Sender ─────────────────────────────────────────────────────────────────────

async def send_security_email(to: str, subject: str, html: str) -> None:
    try:
        await notification_service.send_email(to=to, subject=subject, html_body=html)
    except Exception as e:
        log.warning("security_email_failed", error=str(e))
