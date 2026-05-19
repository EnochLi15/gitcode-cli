"""GitCode API v5 client."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


class GitCodeAPIError(RuntimeError):
    def __init__(self, message: str, status: int | None = None, body=None):
        super().__init__(message)
        self.status = status
        self.body = body


@dataclass
class GitCodeClient:
    base_url: str
    token: str | None = None
    timeout: int = 30

    @classmethod
    def from_env(cls, host: str = "gitcode.com", api_base: str | None = None, token: str | None = None) -> "GitCodeClient":
        resolved_base = api_base or os.environ.get("GITCODE_API_BASE") or f"https://{host}/api/v5"
        resolved_token = token or os.environ.get("GITCODE_TOKEN") or os.environ.get("GITCODE_ACCESS_TOKEN")
        return cls(base_url=resolved_base.rstrip("/"), token=resolved_token)

    def require_token(self) -> None:
        if not self.token:
            raise GitCodeAPIError(
                "GitCode API token required. Set GITCODE_TOKEN or pass --token for write commands."
            )

    def get(self, path: str, params: dict | None = None):
        return self.request("GET", path, params=params)

    def post(self, path: str, data: dict | None = None, require_token: bool = True):
        if require_token:
            self.require_token()
        return self.request("POST", path, data=data)

    def patch(self, path: str, data: dict | None = None, require_token: bool = True):
        if require_token:
            self.require_token()
        return self.request("PATCH", path, data=data)

    def request(self, method: str, path: str, params: dict | None = None, data: dict | None = None):
        method = method.upper()
        url = self._url(path, params=params, include_token=method == "GET")
        headers = {
            "Accept": "application/json",
            "User-Agent": "cli-anything-gitcode/1.0.0",
        }
        body = None
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
            headers["PRIVATE-TOKEN"] = self.token
        if data is not None:
            payload = {k: v for k, v in data.items() if v is not None}
            if self.token:
                payload.setdefault("access_token", self.token)
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = Request(url, data=body, headers=headers, method=method)
        try:
            with urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read()
                parsed = self._parse_response(raw, resp.headers.get("content-type", ""))
                return {
                    "status": resp.status,
                    "data": parsed,
                }
        except HTTPError as exc:
            raw = exc.read()
            parsed = self._parse_response(raw, exc.headers.get("content-type", ""))
            raise GitCodeAPIError(
                f"GitCode API request failed with HTTP {exc.code}",
                status=exc.code,
                body=parsed,
            ) from exc
        except URLError as exc:
            raise GitCodeAPIError(f"GitCode API request failed: {exc.reason}") from exc

    def _url(self, path: str, params: dict | None = None, include_token: bool = False) -> str:
        clean_path = "/" + path.lstrip("/")
        query = {k: v for k, v in (params or {}).items() if v is not None}
        if include_token and self.token:
            query.setdefault("access_token", self.token)
        suffix = f"?{urlencode(query, doseq=True)}" if query else ""
        return f"{self.base_url}{clean_path}{suffix}"

    @staticmethod
    def _parse_response(raw: bytes, content_type: str):
        if not raw:
            return None
        text = raw.decode("utf-8", "replace")
        if "json" in content_type.lower() or text[:1] in {"{", "["}:
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                return text
        return text
