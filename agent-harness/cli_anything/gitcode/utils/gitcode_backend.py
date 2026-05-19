"""Backend wrapper around the real git executable."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path


class GitBackendError(RuntimeError):
    pass


def find_git() -> str:
    git = shutil.which("git")
    if git:
        return git
    raise GitBackendError(
        "git is not installed. Install it with:\n"
        "  brew install git      # macOS\n"
        "  apt install git       # Debian/Ubuntu"
    )


def run_git(args: list[str], cwd: str | os.PathLike[str] | None = None, check: bool = True) -> dict:
    git = find_git()
    proc = subprocess.run(
        [git] + args,
        cwd=str(cwd) if cwd else None,
        text=True,
        capture_output=True,
    )
    result = {
        "command": ["git"] + args,
        "cwd": str(cwd) if cwd else None,
        "returncode": proc.returncode,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
    }
    if check and proc.returncode != 0:
        msg = proc.stderr.strip() or proc.stdout.strip() or f"git exited with {proc.returncode}"
        raise GitBackendError(msg)
    return result


def clone(url: str, destination: str | os.PathLike[str]) -> dict:
    destination = Path(destination)
    return run_git(["clone", url, str(destination)], check=True)


def ensure_repository(path: str | os.PathLike[str]) -> Path:
    repo = Path(path).expanduser().resolve()
    if not repo.exists():
        raise GitBackendError(f"Repository path does not exist: {repo}")
    result = run_git(["rev-parse", "--is-inside-work-tree"], cwd=repo, check=False)
    if result["returncode"] != 0 or result["stdout"].strip() != "true":
        raise GitBackendError(f"Not a git repository: {repo}")
    return repo


def status(path: str | os.PathLike[str]) -> dict:
    repo = ensure_repository(path)
    porcelain = run_git(["status", "--porcelain=v1", "-b"], cwd=repo)
    branch = run_git(["branch", "--show-current"], cwd=repo, check=False)
    remote = run_git(["remote", "-v"], cwd=repo, check=False)
    commits = run_git(["rev-list", "--count", "HEAD"], cwd=repo, check=False)
    files = run_git(["ls-files"], cwd=repo, check=False)
    return {
        "path": str(repo),
        "branch": branch["stdout"].strip(),
        "status": porcelain["stdout"].splitlines(),
        "remotes": remote["stdout"].splitlines(),
        "commit_count": int(commits["stdout"].strip()) if commits["returncode"] == 0 and commits["stdout"].strip().isdigit() else 0,
        "tracked_files": [line for line in files["stdout"].splitlines() if line],
    }


def list_refs(path: str | os.PathLike[str]) -> dict:
    repo = ensure_repository(path)
    branches = run_git(["branch", "--format", "%(refname:short)"], cwd=repo, check=False)
    tags = run_git(["tag", "--list"], cwd=repo, check=False)
    return {
        "branches": [line.strip() for line in branches["stdout"].splitlines() if line.strip()],
        "tags": [line.strip() for line in tags["stdout"].splitlines() if line.strip()],
    }
