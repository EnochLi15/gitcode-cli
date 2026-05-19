"""GitCode repository URL helpers."""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse


@dataclass(frozen=True)
class RepositoryRef:
    url: str
    host: str
    owner: str
    name: str

    @property
    def slug(self) -> str:
        return f"{self.owner}/{self.name}"

    @property
    def git_url(self) -> str:
        return f"https://{self.host}/{self.owner}/{self.name}.git"

    @property
    def web_url(self) -> str:
        return f"https://{self.host}/{self.owner}/{self.name}"


def parse_repository_url(url: str) -> RepositoryRef:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("GitCode URL must start with http:// or https://")
    if not parsed.netloc:
        raise ValueError("GitCode URL must include a host")
    parts = [p for p in parsed.path.strip("/").split("/") if p]
    if len(parts) < 2:
        raise ValueError("GitCode URL must include owner and repository name")
    owner, name = parts[0], parts[1]
    if name.endswith(".git"):
        name = name[:-4]
    return RepositoryRef(url=url, host=parsed.netloc, owner=owner, name=name)
