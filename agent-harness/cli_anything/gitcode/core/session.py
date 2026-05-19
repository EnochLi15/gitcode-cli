"""Session state for the GitCode CLI harness."""

from __future__ import annotations

import copy
import json
import os
from pathlib import Path

from cli_anything.gitcode.core.project import GitCodeProject, load_project, save_project


def _locked_save_json(path, data, **dump_kwargs) -> None:
    try:
        f = open(path, "r+", encoding="utf-8")
    except FileNotFoundError:
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        f = open(path, "w", encoding="utf-8")
    with f:
        locked = False
        try:
            import fcntl
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            locked = True
        except (ImportError, OSError):
            pass
        try:
            f.seek(0)
            f.truncate()
            json.dump(data, f, **dump_kwargs)
            f.write("\n")
            f.flush()
        finally:
            if locked:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)


class Session:
    def __init__(self):
        self.project: GitCodeProject | None = None
        self.project_path: str | None = None
        self._modified = False
        self._undo: list[dict] = []
        self._redo: list[dict] = []

    def has_project(self) -> bool:
        return self.project is not None

    def set_project(self, project: GitCodeProject, path: str | None = None, modified: bool = False) -> None:
        self.project = project
        self.project_path = path
        self._modified = modified
        self._undo.clear()
        self._redo.clear()

    def load(self, path: str | Path) -> GitCodeProject:
        project = load_project(path)
        self.set_project(project, str(path), modified=False)
        return project

    def require_project(self) -> GitCodeProject:
        if self.project is None:
            raise RuntimeError("No project is open. Use project new or --project PATH.")
        return self.project

    def snapshot(self) -> None:
        if self.project is not None:
            self._undo.append(copy.deepcopy(self.project.to_dict()))
            self._redo.clear()

    def mark_modified(self) -> None:
        self._modified = True

    def save_session(self, path: str | Path | None = None) -> dict:
        project = self.require_project()
        target = str(path or self.project_path or "")
        if not target:
            raise RuntimeError("No project path available. Use project save PATH.")
        project.updated_at = __import__("cli_anything.gitcode.core.project", fromlist=["utc_now"]).utc_now()
        _locked_save_json(target, project.to_dict(), indent=2, ensure_ascii=False)
        self.project_path = target
        self._modified = False
        return {"project_path": target, "project": project.to_dict()}

    def undo(self) -> dict:
        project = self.require_project()
        if not self._undo:
            raise RuntimeError("Nothing to undo")
        self._redo.append(copy.deepcopy(project.to_dict()))
        previous = self._undo.pop()
        self.project = GitCodeProject(**{k: previous[k] for k in GitCodeProject.__dataclass_fields__ if k in previous})
        self._modified = True
        return self.project.to_dict()

    def redo(self) -> dict:
        project = self.require_project()
        if not self._redo:
            raise RuntimeError("Nothing to redo")
        self._undo.append(copy.deepcopy(project.to_dict()))
        next_state = self._redo.pop()
        self.project = GitCodeProject(**{k: next_state[k] for k in GitCodeProject.__dataclass_fields__ if k in next_state})
        self._modified = True
        return self.project.to_dict()

    def status(self) -> dict:
        return {
            "has_project": self.has_project(),
            "project_path": self.project_path,
            "modified": self._modified,
            "undo_depth": len(self._undo),
            "redo_depth": len(self._redo),
            "project": self.project.to_dict() if self.project else None,
        }
