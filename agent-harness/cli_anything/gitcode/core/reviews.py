"""GitCode pull request review comment API operations."""

from __future__ import annotations

from cli_anything.gitcode.core.project import GitCodeProject
from cli_anything.gitcode.utils.gitcode_api import GitCodeClient


def _repo_path(project: GitCodeProject, suffix: str) -> str:
    return f"/repos/{project.owner}/{project.repo}{suffix}"


def list_review_comments(project: GitCodeProject, client: GitCodeClient, pull_number: int) -> dict:
    return client.get(_repo_path(project, f"/pulls/{pull_number}/comments"))


def submit_review_comment(
    project: GitCodeProject,
    client: GitCodeClient,
    pull_number: int,
    body: str,
    path: str | None = None,
    line: int | None = None,
    commit_id: str | None = None,
) -> dict:
    return client.post(
        _repo_path(project, f"/pulls/{pull_number}/comments"),
        data={"body": body, "path": path, "line": line, "commit_id": commit_id},
    )
