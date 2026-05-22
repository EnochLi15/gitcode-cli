"""GitCode OAuth configuration and token storage."""

from __future__ import annotations

import json
import os
from pathlib import Path

TOKEN_KEYS = {"access_token", "refresh_token", "expires_in", "created_at", "token_type", "scope", "token_source"}


def config_path() -> Path:
    override = os.environ.get("GITCODE_AUTH_FILE")
    if override:
        return Path(override).expanduser()
    return Path.home() / ".config" / "cli-anything-gitcode" / "auth.json"


def load_auth() -> dict:
    path = config_path()
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid GitCode auth file: {path}") from exc


def save_auth(data: dict) -> dict:
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(path.parent, 0o700)
    except OSError:
        pass
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    try:
        os.chmod(tmp, 0o600)
    except OSError:
        pass
    tmp.replace(path)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return data


def clear_auth(all_config: bool = False) -> dict:
    data = load_auth()
    if all_config:
        path = config_path()
        if path.exists():
            path.unlink()
        return {}
    for key in list(TOKEN_KEYS):
        data.pop(key, None)
    if data:
        save_auth(data)
    else:
        path = config_path()
        if path.exists():
            path.unlink()
    return data


def save_personal_access_token(token: str) -> dict:
    token = token.strip()
    if not token:
        raise RuntimeError("Personal Access Token cannot be empty.")
    data = load_auth()
    for key in list(TOKEN_KEYS):
        data.pop(key, None)
    data.update({
        "access_token": token,
        "token_source": "personal_access_token",
    })
    return save_auth(data)


def get_saved_token() -> str | None:
    token = load_auth().get("access_token")
    return token if isinstance(token, str) and token else None


def is_configured() -> bool:
    data = load_auth()
    return bool(data.get("client_id") and data.get("client_secret"))


def redact_token(token: str | None) -> str | None:
    if not token:
        return None
    if len(token) <= 8:
        return "*" * len(token)
    return f"{token[:4]}{'*' * max(4, len(token) - 8)}{token[-4:]}"


def redirect_uri(data: dict, port: int | None = None) -> str:
    host = data.get("redirect_host") or "127.0.0.1"
    resolved_port = port or data.get("redirect_port") or 8765
    return f"http://{host}:{int(resolved_port)}/callback"


def status() -> dict:
    data = load_auth()
    return {
        "auth_file": str(config_path()),
        "configured": bool(data.get("client_id") and data.get("client_secret")),
        "authenticated": bool(data.get("access_token")),
        "token_source": data.get("token_source") or ("oauth" if data.get("access_token") else None),
        "client_id": data.get("client_id"),
        "has_client_secret": bool(data.get("client_secret")),
        "access_token": redact_token(data.get("access_token")),
        "refresh_token": redact_token(data.get("refresh_token")),
        "redirect_uri": redirect_uri(data) if data else "http://127.0.0.1:8765/callback",
        "scopes": data.get("scopes") or [],
    }
