"""GitCode issue API operations."""

from __future__ import annotations

from cli_anything.gitcode.core.project import GitCodeProject
from cli_anything.gitcode.utils.gitcode_api import GitCodeClient


def _repo_path(project: GitCodeProject, suffix: str) -> str:
    return f"/repos/{project.owner}/{project.repo}{suffix}"


def list_issues(project: GitCodeProject, client: GitCodeClient, state: str | None = None, page: int | None = None, per_page: int | None = None) -> dict:
    return client.get(_repo_path(project, "/issues"), params={"state": state, "page": page, "per_page": per_page})


def get_issue(project: GitCodeProject, client: GitCodeClient, number: int) -> dict:
    return client.get(_repo_path(project, f"/issues/{number}"))


def create_issue(project: GitCodeProject, client: GitCodeClient, title: str, body: str | None = None, labels: tuple[str, ...] | list[str] | None = None, assignee: str | None = None) -> dict:
    payload = {
        "title": title,
        "body": body,
        "labels": ",".join(labels) if labels else None,
        "assignee": assignee,
    }
    return client.post(_repo_path(project, "/issues"), data=payload)


def comment_issue(project: GitCodeProject, client: GitCodeClient, number: int, body: str) -> dict:
    return client.post(_repo_path(project, f"/issues/{number}/comments"), data={"body": body})
