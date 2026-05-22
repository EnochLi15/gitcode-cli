from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import pytest


def _resolve_cli(name):
    """Resolve installed CLI command; falls back to python -m for dev.

    Set env CLI_ANYTHING_FORCE_INSTALLED=1 to require the installed command.
    """
    force = os.environ.get("CLI_ANYTHING_FORCE_INSTALLED", "").strip() == "1"
    path = shutil.which(name)
    if path:
        print(f"[_resolve_cli] Using installed command: {path}")
        return [path]
    if force:
        raise RuntimeError(f"{name} not found in PATH. Install with: pip install -e .")
    module = name.replace("cli-anything-", "cli_anything.") + "." + name.split("-")[-1] + "_cli"
    print(f"[_resolve_cli] Falling back to: {sys.executable} -m {module}")
    return [sys.executable, "-m", module]


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
            content_type = self.headers.get("Content-Type", "")
            payload = json.loads(raw.decode("utf-8")) if raw and content_type == "application/json" else None
            form = parse_qs(raw.decode("utf-8")) if raw and content_type == "application/x-www-form-urlencoded" else None
            record = {
                "method": self.command,
                "path": self.path,
                "authorization": self.headers.get("Authorization"),
                "private_token": self.headers.get("PRIVATE-TOKEN"),
                "payload": payload,
                "form": form,
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
            else:
                self._send(404, {"message": self.path})

        def do_POST(self):
            record = self._record()
            if self.path == "/oauth/token":
                self._send(200, {"access_token": "oauth-token", "refresh_token": "refresh-token", "token_type": "bearer"})
            elif self.path == "/api/v5/repos/gcw_CSGJYRfL/test/issues":
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
        yield f"http://127.0.0.1:{server.server_port}", f"http://127.0.0.1:{server.server_port}/api/v5", records
    finally:
        server.shutdown()
        thread.join(timeout=5)


class TestCLISubprocess:
    CLI_BASE = _resolve_cli("cli-anything-gitcode")

    def _run(self, args, check=True, env=None):
        merged_env = os.environ.copy()
        if env:
            merged_env.update(env)
        return subprocess.run(self.CLI_BASE + args, capture_output=True, text=True, check=check, env=merged_env)

    def test_help(self):
        result = self._run(["--help"])
        assert result.returncode == 0
        assert "GitCode CLI" in result.stdout
        assert "auth" in result.stdout
        assert "issue" in result.stdout
        assert "pr" in result.stdout
        assert "review" in result.stdout

    def test_auth_setup_status_logout(self, tmp_path):
        auth_file = tmp_path / "auth.json"
        env = {"GITCODE_AUTH_FILE": str(auth_file)}
        status = self._run(["--json", "auth", "status"], env=env)
        assert json.loads(status.stdout)["configured"] is False
        setup = self._run([
            "--json", "auth", "setup", "--client-id", "cid", "--client-secret", "super-private-value", "--redirect-port", "8765", "--scope", "user_info",
        ], env=env)
        setup_data = json.loads(setup.stdout)
        assert setup_data["configured"] is True
        assert setup_data["has_client_secret"] is True
        assert "super-private-value" not in setup.stdout
        status = self._run(["--json", "auth", "status"], env=env)
        status_data = json.loads(status.stdout)
        assert status_data["configured"] is True
        assert status_data["authenticated"] is False
        logout = self._run(["--json", "auth", "logout"], env=env)
        assert json.loads(logout.stdout)["configured"] is True
        logout_all = self._run(["--json", "auth", "logout", "--all"], env=env)
        assert json.loads(logout_all.stdout)["configured"] is False
        assert not auth_file.exists()

    def test_auth_login_with_personal_access_token(self, tmp_path, mock_api):
        _oauth_base, api_base, records = mock_api
        auth_file = tmp_path / "auth.json"
        project = tmp_path / "project.json"
        env = {
            "GITCODE_AUTH_FILE": str(auth_file),
            "GITCODE_API_BASE": api_base,
            "GITCODE_TOKEN": "",
            "GITCODE_ACCESS_TOKEN": "",
        }
        self._run(["project", "new", "https://gitcode.com/gcw_CSGJYRfL/test", "-o", str(project)])
        login = self._run(["--json", "auth", "login", "--token", "pat-token"], env=env)
        login_data = json.loads(login.stdout)
        assert login_data["authenticated"] is True
        assert login_data["token_source"] == "personal_access_token"
        assert "pat-token" not in login.stdout
        status = self._run(["--json", "auth", "status"], env=env)
        assert json.loads(status.stdout)["token_source"] == "personal_access_token"
        created = self._run([
            "--json", "--project", str(project), "issue", "create", "--title", "PAT issue",
        ], env=env)
        assert json.loads(created.stdout)["data"]["number"] == 8
        issue_post = [record for record in records if record["path"] == "/api/v5/repos/gcw_CSGJYRfL/test/issues"][-1]
        assert issue_post["authorization"] == "Bearer pat-token"

    def test_auth_login_and_saved_token_for_issue_create(self, tmp_path, mock_api):
        oauth_base, api_base, records = mock_api
        auth_file = tmp_path / "auth.json"
        project = tmp_path / "project.json"
        env = {
            "GITCODE_AUTH_FILE": str(auth_file),
            "GITCODE_API_BASE": api_base,
            "GITCODE_TOKEN": "",
            "GITCODE_ACCESS_TOKEN": "",
            "PYTHONUNBUFFERED": "1",
        }
        self._run(["project", "new", "https://gitcode.com/gcw_CSGJYRfL/test", "-o", str(project)])
        self._run(["auth", "setup", "--client-id", "cid", "--client-secret", "secret", "--redirect-port", "0"], env=env)
        proc = subprocess.Popen(
            self.CLI_BASE + ["auth", "login", "--host", oauth_base, "--redirect-port", "0", "--no-browser", "--print-url", "--timeout", "10"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env={**os.environ.copy(), **env},
        )
        try:
            authorize_url = proc.stdout.readline().strip()
            parsed = urlparse(authorize_url)
            query = parse_qs(parsed.query)
            redirect_uri = query["redirect_uri"][0]
            state = query["state"][0]
            with urllib.request.urlopen(f"{redirect_uri}?code=test-code&state={state}", timeout=5) as resp:
                assert resp.status == 200
            stdout, stderr = proc.communicate(timeout=10)
        finally:
            if proc.poll() is None:
                proc.kill()
        assert proc.returncode == 0, stderr
        saved = json.loads(auth_file.read_text(encoding="utf-8"))
        assert saved["access_token"] == "oauth-token"
        assert saved["refresh_token"] == "refresh-token"
        token_exchange = [record for record in records if record["path"] == "/oauth/token"][-1]
        assert token_exchange["form"]["code"] == ["test-code"]
        created = self._run([
            "--json", "--project", str(project), "issue", "create", "--title", "Saved token issue",
        ], env=env)
        assert json.loads(created.stdout)["data"]["number"] == 8
        issue_post = [record for record in records if record["path"] == "/api/v5/repos/gcw_CSGJYRfL/test/issues"][-1]
        assert issue_post["authorization"] == "Bearer oauth-token"
        assert issue_post["payload"]["access_token"] == "oauth-token"

    def test_project_new_json(self, tmp_path):
        out = tmp_path / "project.json"
        result = self._run(["--json", "project", "new", "https://gitcode.com/gcw_CSGJYRfL/test", "-o", str(out)])
        assert result.returncode == 0
        data = json.loads(result.stdout)
        assert data["project"]["slug"] == "gcw_CSGJYRfL/test"
        assert out.exists()

    def test_repo_status_json_with_explicit_path(self, tmp_path):
        repo = _make_git_repo(tmp_path)
        result = self._run(["--json", "repo", "status", str(repo)])
        data = json.loads(result.stdout)
        assert data["commit_count"] == 1
        assert "README.md" in data["tracked_files"]

    def test_full_project_status_report_workflow(self, tmp_path):
        repo = _make_git_repo(tmp_path)
        project = tmp_path / "project.json"
        report = tmp_path / "report.json"
        self._run([
            "--json",
            "project",
            "new",
            "https://gitcode.com/gcw_CSGJYRfL/test",
            "-o",
            str(project),
            "--local-path",
            str(repo),
        ])
        status = self._run(["--json", "--project", str(project), "repo", "status"])
        status_data = json.loads(status.stdout)
        assert status_data["tracked_files"] == ["README.md"]
        exported = self._run(["--json", "--project", str(project), "export", "report", str(report), "--format", "json", "--overwrite"])
        export_data = json.loads(exported.stdout)
        assert export_data["bytes"] > 0
        assert report.exists()
        print(f"\n  JSON report: {report} ({report.stat().st_size:,} bytes)")

    def test_markdown_report_output(self, tmp_path):
        repo = _make_git_repo(tmp_path)
        project = tmp_path / "project.json"
        report = tmp_path / "report.md"
        self._run(["project", "new", "https://gitcode.com/gcw_CSGJYRfL/test", "-o", str(project), "--local-path", str(repo)])
        self._run(["--project", str(project), "export", "report", str(report), "--format", "markdown", "--overwrite"])
        text = report.read_text(encoding="utf-8")
        assert "GitCode Repository Report" in text
        assert "Tracked files: 1" in text
        print(f"\n  Markdown report: {report} ({report.stat().st_size:,} bytes)")

    def test_issue_pr_review_commands_with_mock_api(self, tmp_path, mock_api):
        _oauth_base, base, records = mock_api
        project = tmp_path / "project.json"
        env = {"GITCODE_API_BASE": base, "GITCODE_TOKEN": "test-token"}
        self._run(["project", "new", "https://gitcode.com/gcw_CSGJYRfL/test", "-o", str(project)])

        issue_list = self._run(["--json", "--project", str(project), "issue", "list", "--state", "open"], env=env)
        assert json.loads(issue_list.stdout)["data"][0]["number"] == 1
        issue_get = self._run(["--json", "--project", str(project), "issue", "get", "7"], env=env)
        assert json.loads(issue_get.stdout)["data"]["title"] == "Issue seven"
        issue_create = self._run([
            "--json", "--project", str(project), "issue", "create", "--title", "Bug", "--body", "Details", "--label", "bug",
        ], env=env)
        assert json.loads(issue_create.stdout)["data"]["number"] == 8

        pr_list = self._run(["--json", "--project", str(project), "pr", "list"], env=env)
        assert json.loads(pr_list.stdout)["data"][0]["number"] == 2
        pr_get = self._run(["--json", "--project", str(project), "pr", "get", "3"], env=env)
        assert json.loads(pr_get.stdout)["data"]["title"] == "Pull three"
        pr_create = self._run([
            "--json", "--project", str(project), "pr", "create", "--title", "PR", "--head", "feature", "--base", "main", "--body", "Body",
        ], env=env)
        assert json.loads(pr_create.stdout)["data"]["number"] == 9

        review_list = self._run(["--json", "--project", str(project), "review", "list", "3"], env=env)
        assert json.loads(review_list.stdout)["data"][0]["id"] == 4
        review_submit = self._run([
            "--json", "--project", str(project), "review", "submit", "3", "--body", "Looks good", "--path", "README.md", "--line", "1", "--commit-id", "abc",
        ], env=env)
        assert json.loads(review_submit.stdout)["data"]["id"] == 11
        write_records = [record for record in records if record["method"] == "POST" and record["path"].startswith("/api/v5")]
        assert write_records
        assert all(record["authorization"] == "Bearer test-token" for record in write_records)
        assert write_records[0]["payload"]["title"] == "Bug"
        assert write_records[-1]["payload"]["path"] == "README.md"
        assert write_records[-1]["payload"]["line"] == 1

    def test_write_command_requires_token(self, tmp_path, mock_api):
        _oauth_base, base, _records = mock_api
        project = tmp_path / "project.json"
        env = {"GITCODE_AUTH_FILE": str(tmp_path / "auth.json"), "GITCODE_TOKEN": "", "GITCODE_ACCESS_TOKEN": ""}
        self._run(["project", "new", "https://gitcode.com/gcw_CSGJYRfL/test", "-o", str(project)])
        result = self._run([
            "--json", "--api-base", base, "--project", str(project), "issue", "create", "--title", "No token",
        ], check=False, env=env)
        assert result.returncode == 1
        data = json.loads(result.stdout)
        assert data["type"] == "GitCodeAPIError"
        assert "token required" in data["error"]


def test_module_entrypoint_help():
    result = subprocess.run([sys.executable, "-m", "cli_anything.gitcode", "--help"], capture_output=True, text=True, check=True)
    assert "GitCode CLI" in result.stdout


def test_dry_run_suppresses_auto_save(tmp_path):
    project = tmp_path / "project.json"
    subprocess.run(
        _resolve_cli("cli-anything-gitcode") + ["project", "new", "https://gitcode.com/gcw_CSGJYRfL/test", "-o", str(project)],
        capture_output=True,
        text=True,
        check=True,
    )
    subprocess.run(
        _resolve_cli("cli-anything-gitcode") + ["--project", str(project), "--dry-run", "project", "note", "not saved"],
        capture_output=True,
        text=True,
        check=True,
    )
    data = json.loads(project.read_text(encoding="utf-8"))
    assert data["notes"] == []
