"""GitCode pull request API operations."""

from __future__ import annotations

from cli_anything.gitcode.core.project import GitCodeProject
from cli_anything.gitcode.utils.gitcode_api import GitCodeClient


def _repo_path(project: GitCodeProject, suffix: str) -> str:
    return f"/repos/{project.owner}/{project.repo}{suffix}"


def list_pulls(project: GitCodeProject, client: GitCodeClient, state: str | None = None, page: int | None = None, per_page: int | None = None) -> dict:
    return client.get(_repo_path(project, "/pulls"), params={"state": state, "page": page, "per_page": per_page})


def get_pull(project: GitCodeProject, client: GitCodeClient, number: int) -> dict:
    return client.get(_repo_path(project, f"/pulls/{number}"))


def create_pull(project: GitCodeProject, client: GitCodeClient, title: str, head: str, base: str, body: str | None = None) -> dict:
    return client.post(
        _repo_path(project, "/pulls"),
        data={"title": title, "head": head, "base": base, "body": body},
    )


def comment_pull(project: GitCodeProject, client: GitCodeClient, number: int, body: str) -> dict:
    return client.post(_repo_path(project, f"/pulls/{number}/comments"), data={"body": body})
