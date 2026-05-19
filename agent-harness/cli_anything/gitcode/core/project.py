"""Project file model for GitCode repositories."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from cli_anything.gitcode.core.repository import parse_repository_url
from cli_anything.gitcode.utils import gitcode_backend as backend


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


@dataclass
class GitCodeProject:
    name: str
    repo_url: str
    owner: str
    repo: str
    host: str = "gitcode.com"
    local_path: str | None = None
    created_at: str = field(default_factory=utc_now)
    updated_at: str = field(default_factory=utc_now)
    notes: list[str] = field(default_factory=list)

    @property
    def slug(self) -> str:
        return f"{self.owner}/{self.repo}"

    @property
    def web_url(self) -> str:
        return f"https://{self.host}/{self.owner}/{self.repo}"

    @property
    def git_url(self) -> str:
        return f"https://{self.host}/{self.owner}/{self.repo}.git"

    def to_dict(self) -> dict:
        data = asdict(self)
        data["slug"] = self.slug
        data["web_url"] = self.web_url
        data["git_url"] = self.git_url
        return data


def create_project(repo_url: str, name: str | None = None, local_path: str | None = None) -> GitCodeProject:
    ref = parse_repository_url(repo_url)
    return GitCodeProject(
        name=name or ref.name,
        repo_url=repo_url,
        owner=ref.owner,
        repo=ref.name,
        host=ref.host,
        local_path=local_path,
    )


def load_project(path: str | Path) -> GitCodeProject:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    keys = {"name", "repo_url", "owner", "repo", "host", "local_path", "created_at", "updated_at", "notes"}
    return GitCodeProject(**{k: data[k] for k in keys if k in data})


def save_project(project: GitCodeProject, path: str | Path) -> dict:
    project.updated_at = utc_now()
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(project.to_dict(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"project_path": str(path), "project": project.to_dict()}


def inspect_local(project: GitCodeProject) -> dict:
    if not project.local_path:
        return {"has_local_clone": False, "project": project.to_dict()}
    try:
        repo_status = backend.status(project.local_path)
    except backend.GitBackendError as exc:
        return {"has_local_clone": False, "error": str(exc), "project": project.to_dict()}
    return {"has_local_clone": True, "project": project.to_dict(), "repository": repo_status}
