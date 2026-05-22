#!/usr/bin/env python3
"""GitCode CLI — CLI harness for GitCode repositories using real git."""

from __future__ import annotations

import json
import secrets
import shlex
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse

import click

from cli_anything.gitcode.core import export as export_mod
from cli_anything.gitcode.core import issues as issues_mod
from cli_anything.gitcode.core import project as project_mod
from cli_anything.gitcode.core import pulls as pulls_mod
from cli_anything.gitcode.core import reviews as reviews_mod
from cli_anything.gitcode.core.session import Session
from cli_anything.gitcode.utils import gitcode_auth
from cli_anything.gitcode.utils import gitcode_backend as backend
from cli_anything.gitcode.utils.gitcode_api import GitCodeAPIError, GitCodeClient, exchange_oauth_code

_session: Session | None = None
_json_output = False
_repl_mode = False
_api_base: str | None = None
_token: str | None = None


def get_session() -> Session:
    global _session
    if _session is None:
        _session = Session()
    return _session


def get_api_client(require_token: bool = False) -> GitCodeClient:
    project = get_session().require_project()
    client = GitCodeClient.from_env(host=project.host, api_base=_api_base, token=_token)
    if require_token:
        client.require_token()
    return client


def output(data, message: str = "") -> None:
    if _json_output:
        click.echo(json.dumps(data, indent=2, ensure_ascii=False, default=str))
        return
    if message:
        click.echo(message)
    if isinstance(data, dict):
        _print_dict(data)
    elif isinstance(data, list):
        for item in data:
            click.echo(f"- {item}")
    elif data is not None:
        click.echo(str(data))


def _print_dict(data: dict, indent: int = 0) -> None:
    prefix = "  " * indent
    for key, value in data.items():
        if isinstance(value, dict):
            click.echo(f"{prefix}{key}:")
            _print_dict(value, indent + 1)
        elif isinstance(value, list):
            click.echo(f"{prefix}{key}:")
            for item in value:
                if isinstance(item, dict):
                    _print_dict(item, indent + 1)
                else:
                    click.echo(f"{prefix}  - {item}")
        else:
            click.echo(f"{prefix}{key}: {value}")


def handle_error(func):
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except (RuntimeError, ValueError, backend.GitBackendError, GitCodeAPIError) as exc:
            error = {"error": str(exc), "type": type(exc).__name__}
            if isinstance(exc, GitCodeAPIError):
                error["status"] = exc.status
                error["body"] = exc.body
            if _json_output:
                click.echo(json.dumps(error, ensure_ascii=False, default=str))
            else:
                click.echo(f"Error: {exc}", err=True)
            if not _repl_mode:
                sys.exit(1)
    wrapper.__name__ = func.__name__
    wrapper.__doc__ = func.__doc__
    return wrapper


@click.group(invoke_without_command=True)
@click.option("--json", "use_json", is_flag=True, help="Output machine-readable JSON")
@click.option("--project", "project_path", type=click.Path(dir_okay=False), default=None, help="Path to GitCode project JSON")
@click.option("--dry-run", "dry_run", is_flag=True, default=False, help="Run without auto-saving project mutations")
@click.option("--api-base", default=None, help="Override GitCode API base URL")
@click.option("--token", default=None, help="GitCode API token for write commands")
@click.pass_context
def cli(ctx, use_json, project_path, dry_run, api_base, token):
    """GitCode CLI — operate GitCode repository metadata and local clones.

    Run without a subcommand to enter the interactive REPL.
    """
    global _json_output, _api_base, _token
    _json_output = use_json
    _api_base = api_base
    _token = token
    ctx.ensure_object(dict)
    ctx.obj["dry_run"] = dry_run
    ctx.obj["api_base"] = api_base
    ctx.obj["token"] = token
    if project_path:
        get_session().load(project_path)
    if ctx.invoked_subcommand is None:
        ctx.invoke(repl)


@cli.result_callback()
def auto_save_on_exit(result, use_json, project_path, dry_run, api_base, token, **kwargs):
    if _repl_mode or dry_run:
        return
    sess = get_session()
    if sess.has_project() and sess._modified and sess.project_path:
        try:
            sess.save_session()
        except Exception as exc:
            click.echo(f"Warning: Auto-save failed: {exc}", err=True)


@cli.group()
def auth():
    """GitCode OAuth authentication commands."""
    pass


@auth.command("setup")
@click.option("--client-id", required=True, help="GitCode OAuth app client ID")
@click.option("--client-secret", required=True, help="GitCode OAuth app client secret")
@click.option("--redirect-host", default="127.0.0.1", show_default=True, help="OAuth callback host")
@click.option("--redirect-port", type=int, default=8765, show_default=True, help="OAuth callback port")
@click.option("--scope", "scopes", multiple=True, help="OAuth scope; may be repeated")
@handle_error
def auth_setup(client_id, client_secret, redirect_host, redirect_port, scopes):
    """Save OAuth app configuration."""
    existing = gitcode_auth.load_auth()
    existing.update({
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_host": redirect_host,
        "redirect_port": redirect_port,
        "scopes": list(scopes),
    })
    gitcode_auth.save_auth(existing)
    output({
        "auth_file": str(gitcode_auth.config_path()),
        "configured": True,
        "authenticated": bool(existing.get("access_token")),
        "client_id": client_id,
        "has_client_secret": True,
        "redirect_uri": gitcode_auth.redirect_uri(existing),
        "scopes": list(scopes),
    }, "GitCode OAuth app configuration saved")


@auth.command("status")
@handle_error
def auth_status():
    """Show saved GitCode auth status."""
    output(gitcode_auth.status())


@auth.command("logout")
@click.option("--all", "all_config", is_flag=True, help="Remove OAuth app config as well as saved tokens")
@handle_error
def auth_logout(all_config):
    """Remove saved GitCode OAuth tokens."""
    remaining = gitcode_auth.clear_auth(all_config=all_config)
    output({
        "auth_file": str(gitcode_auth.config_path()),
        "configured": bool(remaining.get("client_id") and remaining.get("client_secret")),
        "authenticated": False,
        "removed_all": all_config,
    }, "GitCode auth cleared")


@auth.command("login")
@click.option("--host", default="gitcode.com", show_default=True, help="GitCode host or OAuth base URL")
@click.option("--redirect-port", type=int, default=None, help="Override callback port for this login")
@click.option("--no-browser", is_flag=True, help="Print URL without opening a browser")
@click.option("--print-url", is_flag=True, help="Print authorization URL before waiting for callback")
@click.option("--timeout", "timeout_seconds", type=int, default=180, show_default=True, help="Seconds to wait for OAuth callback")
@click.option("--token", "pat_token", default=None, help="Save a GitCode Personal Access Token instead of using OAuth")
@handle_error
def auth_login(host, redirect_port, no_browser, print_url, timeout_seconds, pat_token):
    """Login with a GitCode Personal Access Token or OAuth authorization-code flow."""
    if pat_token is not None:
        saved = gitcode_auth.save_personal_access_token(pat_token)
        output({
            "auth_file": str(gitcode_auth.config_path()),
            "authenticated": True,
            "configured": bool(saved.get("client_id") and saved.get("client_secret")),
            "token_source": "personal_access_token",
            "access_token": gitcode_auth.redact_token(saved.get("access_token")),
        }, "GitCode Personal Access Token saved")
        return
    config = gitcode_auth.load_auth()
    client_id = config.get("client_id")
    client_secret = config.get("client_secret")
    if not client_id or not client_secret:
        raise RuntimeError("Run auth setup with a GitCode OAuth client_id and client_secret before auth login.")
    result = _run_oauth_login(config, host, redirect_port, no_browser, print_url, timeout_seconds)
    output(result, "GitCode OAuth login completed")


def _run_oauth_login(config: dict, host: str, redirect_port: int | None, no_browser: bool, print_url: bool, timeout_seconds: int) -> dict:
    resolved_port = redirect_port if redirect_port is not None else int(config.get("redirect_port") or 8765)
    callback = _OAuthCallbackServer(config.get("redirect_host") or "127.0.0.1", resolved_port)
    callback.start()
    try:
        redirect_uri = f"http://{callback.host}:{callback.port}/callback"
        state = secrets.token_urlsafe(24)
        query = {
            "client_id": config["client_id"],
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "state": state,
        }
        scopes = config.get("scopes") or []
        if scopes:
            query["scope"] = " ".join(scopes)
        authorize_base = f"https://{host}/oauth/authorize" if not host.startswith("http://") and not host.startswith("https://") else host.rstrip("/") + "/oauth/authorize"
        authorize_url = f"{authorize_base}?{urlencode(query)}"
        if print_url or no_browser:
            click.echo(authorize_url)
        if not no_browser:
            webbrowser.open(authorize_url)
        callback_result = callback.wait(timeout_seconds)
        if callback_result.get("error"):
            raise RuntimeError(f"OAuth callback failed: {callback_result['error']}")
        if callback_result.get("state") != state:
            raise RuntimeError("OAuth callback state did not match")
        code = callback_result.get("code")
        if not code:
            raise RuntimeError("OAuth callback did not include a code")
        token_payload = exchange_oauth_code(host, config["client_id"], config["client_secret"], code, redirect_uri)
        updated = {**config, **(token_payload or {})}
        updated["redirect_host"] = callback.host
        updated["redirect_port"] = callback.port
        updated["token_source"] = "oauth"
        gitcode_auth.save_auth(updated)
        return {
            "auth_file": str(gitcode_auth.config_path()),
            "authenticated": bool(updated.get("access_token")),
            "configured": True,
            "token_source": "oauth",
            "access_token": gitcode_auth.redact_token(updated.get("access_token")),
            "refresh_token": gitcode_auth.redact_token(updated.get("refresh_token")),
            "token_type": updated.get("token_type"),
            "redirect_uri": redirect_uri,
        }
    finally:
        callback.stop()


class _OAuthCallbackServer:
    def __init__(self, host: str, port: int):
        self.host = host
        self.port = port
        self._event = threading.Event()
        self._result: dict = {}
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, format, *args):
                pass

            def do_GET(self):
                parsed = urlparse(self.path)
                params = parse_qs(parsed.query)
                outer._result = {
                    "code": (params.get("code") or [None])[0],
                    "state": (params.get("state") or [None])[0],
                    "error": (params.get("error") or [None])[0],
                }
                body = b"GitCode CLI authentication complete. You can close this window."
                self.send_response(200)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                outer._event.set()

        self._server = ThreadingHTTPServer((self.host, self.port), Handler)
        self.port = self._server.server_port
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)

    def start(self) -> None:
        self._thread.start()

    def wait(self, timeout_seconds: int) -> dict:
        if not self._event.wait(timeout_seconds):
            raise RuntimeError("Timed out waiting for GitCode OAuth callback")
        return self._result

    def stop(self) -> None:
        self._server.shutdown()
        self._thread.join(timeout=5)
        self._server.server_close()


@cli.group()
def project():
    """Project JSON commands."""
    pass


@project.command("new")
@click.argument("repo_url")
@click.option("-o", "output_path", type=click.Path(dir_okay=False), required=True, help="Project JSON output path")
@click.option("--name", default=None, help="Project display name")
@click.option("--local-path", type=click.Path(file_okay=False), default=None, help="Existing local clone path")
@handle_error
def project_new(repo_url, output_path, name, local_path):
    """Create a project file for a GitCode repository URL."""
    proj = project_mod.create_project(repo_url, name=name, local_path=local_path)
    get_session().set_project(proj, output_path, modified=True)
    result = get_session().save_session(output_path)
    output(result, f"Created project: {output_path}")


@project.command("open")
@click.argument("project_path", type=click.Path(exists=True, dir_okay=False))
@handle_error
def project_open(project_path):
    """Open and display a project file."""
    proj = get_session().load(project_path)
    output({"project_path": project_path, "project": proj.to_dict()})


@project.command("save")
@click.argument("project_path", required=False, type=click.Path(dir_okay=False))
@handle_error
def project_save(project_path):
    """Save the current project."""
    result = get_session().save_session(project_path)
    output(result, f"Saved: {result['project_path']}")


@project.command("info")
@handle_error
def project_info():
    """Show current project metadata."""
    output(get_session().require_project().to_dict())


@project.command("set-local")
@click.argument("path", type=click.Path(file_okay=False))
@handle_error
def project_set_local(path):
    """Bind the project to an existing local git clone."""
    repo = backend.ensure_repository(path)
    sess = get_session()
    sess.snapshot()
    sess.require_project().local_path = str(repo)
    sess.mark_modified()
    output({"local_path": str(repo)}, f"Local path set: {repo}")


@project.command("note")
@click.argument("text")
@handle_error
def project_note(text):
    """Add a note to the project file."""
    sess = get_session()
    sess.snapshot()
    sess.require_project().notes.append(text)
    sess.mark_modified()
    output({"note": text, "notes": sess.require_project().notes}, "Note added")


@cli.group()
def repo():
    """Repository clone and inspection commands."""
    pass


@repo.command("clone")
@click.argument("destination", type=click.Path(file_okay=False))
@click.option("--url", "repo_url", default=None, help="GitCode repository URL; defaults to current project")
@click.option("--set-local/--no-set-local", default=True, help="Save destination as project local path")
@handle_error
def repo_clone(destination, repo_url, set_local):
    """Clone the GitCode repository using real git."""
    sess = get_session()
    url = repo_url or sess.require_project().git_url
    result = backend.clone(url, destination)
    if set_local and sess.has_project():
        sess.snapshot()
        sess.require_project().local_path = str(Path(destination).expanduser().resolve())
        sess.mark_modified()
    output({"destination": str(Path(destination).expanduser().resolve()), "git": result}, f"Cloned to: {destination}")


@repo.command("status")
@click.argument("path", required=False, type=click.Path(file_okay=False))
@handle_error
def repo_status(path):
    """Inspect a local clone with real git status."""
    sess = get_session()
    target = path or sess.require_project().local_path
    if not target:
        raise RuntimeError("No local clone path. Pass PATH or run project set-local.")
    output(backend.status(target))


@repo.command("refs")
@click.argument("path", required=False, type=click.Path(file_okay=False))
@handle_error
def repo_refs(path):
    """List local branches and tags."""
    sess = get_session()
    target = path or sess.require_project().local_path
    if not target:
        raise RuntimeError("No local clone path. Pass PATH or run project set-local.")
    output(backend.list_refs(target))


@cli.group()
def issue():
    """GitCode issue commands."""
    pass


@issue.command("list")
@click.option("--state", default=None, help="Filter issues by state")
@click.option("--page", type=int, default=None, help="Page number")
@click.option("--per-page", type=int, default=None, help="Items per page")
@handle_error
def issue_list(state, page, per_page):
    """List issues from GitCode."""
    project = get_session().require_project()
    output(issues_mod.list_issues(project, get_api_client(), state=state, page=page, per_page=per_page))


@issue.command("get")
@click.argument("number", type=int)
@handle_error
def issue_get(number):
    """Get one issue from GitCode."""
    project = get_session().require_project()
    output(issues_mod.get_issue(project, get_api_client(), number))


@issue.command("create")
@click.option("--title", required=True, help="Issue title")
@click.option("--body", default=None, help="Issue body")
@click.option("--label", "labels", multiple=True, help="Issue label; may be repeated")
@click.option("--assignee", default=None, help="Issue assignee username")
@handle_error
def issue_create(title, body, labels, assignee):
    """Create a GitCode issue."""
    project = get_session().require_project()
    output(
        issues_mod.create_issue(project, get_api_client(require_token=True), title, body=body, labels=labels, assignee=assignee),
        "Issue created",
    )


@issue.command("comment")
@click.argument("number", type=int)
@click.option("--body", required=True, help="Comment body")
@handle_error
def issue_comment(number, body):
    """Comment on a GitCode issue."""
    project = get_session().require_project()
    output(issues_mod.comment_issue(project, get_api_client(require_token=True), number, body), "Issue comment submitted")


@cli.group()
def pr():
    """GitCode pull request commands."""
    pass


@pr.command("list")
@click.option("--state", default=None, help="Filter pull requests by state")
@click.option("--page", type=int, default=None, help="Page number")
@click.option("--per-page", type=int, default=None, help="Items per page")
@handle_error
def pr_list(state, page, per_page):
    """List pull requests from GitCode."""
    project = get_session().require_project()
    output(pulls_mod.list_pulls(project, get_api_client(), state=state, page=page, per_page=per_page))


@pr.command("get")
@click.argument("number", type=int)
@handle_error
def pr_get(number):
    """Get one pull request from GitCode."""
    project = get_session().require_project()
    output(pulls_mod.get_pull(project, get_api_client(), number))


@pr.command("create")
@click.option("--title", required=True, help="Pull request title")
@click.option("--head", required=True, help="Source branch")
@click.option("--base", required=True, help="Target branch")
@click.option("--body", default=None, help="Pull request body")
@handle_error
def pr_create(title, head, base, body):
    """Create a GitCode pull request."""
    project = get_session().require_project()
    output(
        pulls_mod.create_pull(project, get_api_client(require_token=True), title, head=head, base=base, body=body),
        "Pull request created",
    )


@pr.command("comment")
@click.argument("number", type=int)
@click.option("--body", required=True, help="Comment body")
@handle_error
def pr_comment(number, body):
    """Comment on a GitCode pull request."""
    project = get_session().require_project()
    output(pulls_mod.comment_pull(project, get_api_client(require_token=True), number, body), "Pull request comment submitted")


@cli.group()
def review():
    """GitCode pull request review commands."""
    pass


@review.command("list")
@click.argument("number", type=int)
@handle_error
def review_list(number):
    """List review comments for a pull request."""
    project = get_session().require_project()
    output(reviews_mod.list_review_comments(project, get_api_client(), number))


@review.command("submit")
@click.argument("number", type=int)
@click.option("--body", required=True, help="Review comment body")
@click.option("--path", "file_path", default=None, help="File path for inline review comment")
@click.option("--line", type=int, default=None, help="Line number for inline review comment")
@click.option("--commit-id", default=None, help="Commit SHA for inline review comment")
@handle_error
def review_submit(number, body, file_path, line, commit_id):
    """Submit a pull request review comment."""
    project = get_session().require_project()
    output(
        reviews_mod.submit_review_comment(
            project,
            get_api_client(require_token=True),
            number,
            body,
            path=file_path,
            line=line,
            commit_id=commit_id,
        ),
        "Review comment submitted",
    )


@cli.group()
def export():
    """Export repository reports."""
    pass


@export.command("report")
@click.argument("output_path", type=click.Path(dir_okay=False))
@click.option("--format", "fmt", type=click.Choice(["json", "markdown"]), default="json", help="Report format")
@click.option("--overwrite", is_flag=True, help="Overwrite existing output")
@handle_error
def export_report(output_path, fmt, overwrite):
    """Export current project and local git status as a report."""
    result = export_mod.export_report(get_session().require_project(), output_path, fmt=fmt, overwrite=overwrite)
    output(result, f"Exported report: {result['output']}")


@cli.group()
def session():
    """Session commands."""
    pass


@session.command("status")
@handle_error
def session_status():
    """Show current session status."""
    output(get_session().status())


@session.command("undo")
@handle_error
def session_undo():
    """Undo the last project mutation."""
    output(get_session().undo(), "Undone")


@session.command("redo")
@handle_error
def session_redo():
    """Redo the last undone project mutation."""
    output(get_session().redo(), "Redone")


@cli.command()
@handle_error
def repl():
    """Start the interactive REPL."""
    from cli_anything.gitcode.utils.repl_skin import ReplSkin

    global _repl_mode
    _repl_mode = True
    skin = ReplSkin("gitcode", version="1.0.0")
    skin.print_banner()
    pt_session = skin.create_prompt_session()
    commands = {
        "auth": "setup|login|status|logout",
        "project": "new|open|save|info|set-local|note",
        "repo": "clone|status|refs",
        "issue": "list|get|create|comment",
        "pr": "list|get|create|comment",
        "review": "list|submit",
        "export": "report",
        "session": "status|undo|redo",
        "help": "Show this help",
        "quit": "Exit REPL",
    }
    while True:
        try:
            sess = get_session()
            context = sess.project.slug if sess.project else "no-project"
            line = skin.get_input(pt_session, context=context, modified=sess._modified)
            if not line:
                continue
            if line.lower() in {"quit", "exit", "q"}:
                skin.print_goodbye()
                break
            if line.lower() == "help":
                skin.help(commands)
                continue
            try:
                args = shlex.split(line)
            except ValueError:
                args = line.split()
            if _json_output and "--json" not in args:
                args = ["--json"] + args
            try:
                cli.main(args, standalone_mode=False)
            except SystemExit:
                pass
            except click.exceptions.UsageError as exc:
                skin.warning(f"Usage error: {exc}")
            except Exception as exc:
                skin.error(str(exc))
        except (EOFError, KeyboardInterrupt):
            skin.print_goodbye()
            break
    _repl_mode = False


def main():
    cli()


if __name__ == "__main__":
    main()
