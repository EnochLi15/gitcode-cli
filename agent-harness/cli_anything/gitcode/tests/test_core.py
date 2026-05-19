from __future__ import annotations

import json
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from cli_anything.gitcode.core.export import export_report
from cli_anything.gitcode.core import issues as issues_mod
from cli_anything.gitcode.core import pulls as pulls_mod
from cli_anything.gitcode.core import reviews as reviews_mod
from cli_anything.gitcode.core.project import create_project, inspect_local, load_project, save_project
from cli_anything.gitcode.core.repository import parse_repository_url
from cli_anything.gitcode.core.session import Session
from cli_anything.gitcode.utils.gitcode_api import GitCodeAPIError, GitCodeClient


def _make_git_repo(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init"], cwd=repo, check=True, capture_output=True, text=True)
    subprocess.run(["git", "config", "user.email", "agent@example.com"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.name", "Agent"], cwd=repo, check=True)
    readme = repo / "README.md"
    readme.write_text("# Repo\n", encoding="utf-8")
    subprocess.run(["git", "add", "README.md"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-m", "initial"], cwd=repo, check=True, capture_output=True, text=True)
    return repo


@pytest.fixture
def mock_api():
    records = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            pass

        def _send(self, status, data):
            body = json.dumps(data).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _record(self):
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length) if length else b""
            payload = json.loads(raw.decode("utf-8")) if raw else None
            record = {
                "method": self.command,
                "path": self.path,
                "authorization": self.headers.get("Authorization"),
                "private_token": self.headers.get("PRIVATE-TOKEN"),
                "payload": payload,
            }
            records.append(record)
            return record

        def do_GET(self):
            self._record()
            if self.path.startswith("/api/v5/repos/gcw_CSGJYRfL/test/issues/7"):
                self._send(200, {"number": 7, "title": "Issue seven"})
            elif self.path.startswith("/api/v5/repos/gcw_CSGJYRfL/test/issues"):
                self._send(200, [{"number": 1, "title": "First issue"}])
            elif self.path.startswith("/api/v5/repos/gcw_CSGJYRfL/test/pulls/3/comments"):
                self._send(200, [{"id": 4, "body": "reviewed"}])
            elif self.path.startswith("/api/v5/repos/gcw_CSGJYRfL/test/pulls/3"):
                self._send(200, {"number": 3, "title": "Pull three"})
            elif self.path.startswith("/api/v5/repos/gcw_CSGJYRfL/test/pulls"):
                self._send(200, [{"number": 2, "title": "First pull"}])
            elif self.path.startswith("/api/v5/fail"):
                self._send(500, {"message": "boom"})
            else:
                self._send(404, {"message": self.path})

        def do_POST(self):
            record = self._record()
            if self.path == "/api/v5/repos/gcw_CSGJYRfL/test/issues":
                self._send(201, {"number": 8, "title": record["payload"].get("title")})
            elif self.path == "/api/v5/repos/gcw_CSGJYRfL/test/issues/8/comments":
                self._send(201, {"id": 10, "body": record["payload"].get("body")})
            elif self.path == "/api/v5/repos/gcw_CSGJYRfL/test/pulls":
                self._send(201, {"number": 9, "title": record["payload"].get("title")})
            elif self.path == "/api/v5/repos/gcw_CSGJYRfL/test/pulls/3/comments":
                self._send(201, {"id": 11, "body": record["payload"].get("body")})
            else:
                self._send(404, {"message": self.path})

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/api/v5", records
    finally:
        server.shutdown()
        thread.join(timeout=5)


def test_parse_repository_url():
    ref = parse_repository_url("https://gitcode.com/gcw_CSGJYRfL/test")
    assert ref.host == "gitcode.com"
    assert ref.owner == "gcw_CSGJYRfL"
    assert ref.name == "test"
    assert ref.git_url == "https://gitcode.com/gcw_CSGJYRfL/test.git"


def test_parse_repository_url_strips_git_suffix():
    ref = parse_repository_url("https://gitcode.com/gcw_CSGJYRfL/test.git")
    assert ref.name == "test"
    assert ref.web_url == "https://gitcode.com/gcw_CSGJYRfL/test"


@pytest.mark.parametrize("url", ["gitcode.com/a/b", "https://gitcode.com/only-owner", "file:///tmp/repo"])
def test_parse_repository_url_rejects_invalid(url):
    with pytest.raises(ValueError):
        parse_repository_url(url)


def test_create_project_from_url():
    project = create_project("https://gitcode.com/gcw_CSGJYRfL/test", name="GitCode Test")
    assert project.name == "GitCode Test"
    assert project.slug == "gcw_CSGJYRfL/test"
    assert project.git_url.endswith("/test.git")


def test_save_and_load_project_round_trip(tmp_path):
    path = tmp_path / "project.json"
    project = create_project("https://gitcode.com/gcw_CSGJYRfL/test", local_path=str(tmp_path))
    save_project(project, path)
    loaded = load_project(path)
    assert loaded.slug == project.slug
    assert loaded.local_path == str(tmp_path)


def test_inspect_local_uses_real_git(tmp_path):
    repo = _make_git_repo(tmp_path)
    project = create_project("https://gitcode.com/gcw_CSGJYRfL/test", local_path=str(repo))
    result = inspect_local(project)
    assert result["has_local_clone"] is True
    assert result["repository"]["commit_count"] == 1
    assert "README.md" in result["repository"]["tracked_files"]


def test_session_save_load_and_status(tmp_path):
    path = tmp_path / "project.json"
    session = Session()
    session.set_project(create_project("https://gitcode.com/gcw_CSGJYRfL/test"), str(path), modified=True)
    session.save_session()
    assert session.status()["modified"] is False
    second = Session()
    second.load(path)
    assert second.require_project().slug == "gcw_CSGJYRfL/test"


def test_session_undo_redo(tmp_path):
    session = Session()
    session.set_project(create_project("https://gitcode.com/gcw_CSGJYRfL/test"), str(tmp_path / "p.json"))
    session.snapshot()
    session.require_project().notes.append("first")
    session.mark_modified()
    assert session.undo()["notes"] == []
    assert session.redo()["notes"] == ["first"]


def test_export_report_json_and_overwrite_guard(tmp_path):
    repo = _make_git_repo(tmp_path)
    project = create_project("https://gitcode.com/gcw_CSGJYRfL/test", local_path=str(repo))
    out = tmp_path / "report.json"
    result = export_report(project, out)
    assert result["bytes"] > 0
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["repository"]["tracked_files"] == ["README.md"]
    with pytest.raises(RuntimeError):
        export_report(project, out)


def test_api_client_requires_token_for_writes():
    client = GitCodeClient("http://127.0.0.1/api/v5")
    with pytest.raises(GitCodeAPIError):
        client.require_token()


def test_api_client_get_and_error(mock_api):
    base, records = mock_api
    client = GitCodeClient(base, token="secret")
    result = client.get("/repos/gcw_CSGJYRfL/test/issues", params={"state": "open"})
    assert result["data"][0]["number"] == 1
    assert records[-1]["authorization"] == "Bearer secret"
    assert "access_token=secret" in records[-1]["path"]
    with pytest.raises(GitCodeAPIError) as exc:
        client.get("/fail")
    assert exc.value.status == 500
    assert exc.value.body == {"message": "boom"}


def test_issue_pull_review_core_functions(mock_api):
    base, records = mock_api
    project = create_project("https://gitcode.com/gcw_CSGJYRfL/test")
    client = GitCodeClient(base, token="secret")
    assert issues_mod.list_issues(project, client)["data"][0]["number"] == 1
    assert issues_mod.get_issue(project, client, 7)["data"]["title"] == "Issue seven"
    assert issues_mod.create_issue(project, client, "Bug", body="Details", labels=("bug",), assignee="enoch")["data"]["number"] == 8
    assert pulls_mod.list_pulls(project, client)["data"][0]["number"] == 2
    assert pulls_mod.get_pull(project, client, 3)["data"]["title"] == "Pull three"
    assert pulls_mod.create_pull(project, client, "PR", head="feature", base="main", body="Body")["data"]["number"] == 9
    assert reviews_mod.list_review_comments(project, client, 3)["data"][0]["id"] == 4
    assert reviews_mod.submit_review_comment(project, client, 3, "Looks good", path="README.md", line=1, commit_id="abc")["data"]["id"] == 11
    assert records[-1]["payload"]["path"] == "README.md"
    assert records[-1]["payload"]["line"] == 1
