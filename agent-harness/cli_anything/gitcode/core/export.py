"""Export and report helpers for GitCode projects."""

from __future__ import annotations

import json
from pathlib import Path

from cli_anything.gitcode.core.project import GitCodeProject, inspect_local


def export_report(project: GitCodeProject, output_path: str | Path, fmt: str = "json", overwrite: bool = False) -> dict:
    output_path = Path(output_path)
    if output_path.exists() and not overwrite:
        raise RuntimeError(f"Output already exists: {output_path}")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    data = inspect_local(project)
    if fmt == "json":
        output_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    elif fmt == "markdown":
        repo = data.get("repository", {})
        lines = [
            f"# GitCode Repository Report: {project.slug}",
            "",
            f"- Web URL: {project.web_url}",
            f"- Git URL: {project.git_url}",
            f"- Local path: {project.local_path or 'not cloned'}",
            f"- Has local clone: {data.get('has_local_clone')}",
            f"- Branch: {repo.get('branch', '')}",
            f"- Commit count: {repo.get('commit_count', 0)}",
            f"- Tracked files: {len(repo.get('tracked_files', []))}",
            "",
        ]
        output_path.write_text("\n".join(lines), encoding="utf-8")
    else:
        raise ValueError("fmt must be json or markdown")
    return {"output": str(output_path), "format": fmt, "bytes": output_path.stat().st_size}
