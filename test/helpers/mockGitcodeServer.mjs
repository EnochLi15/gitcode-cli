import { createServer } from "node:http";
import assert from "node:assert/strict";

export async function withMockGitCodeServer(handler, fn) {
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    await new Promise((resolve) => req.on("end", resolve));
    const bodyText = Buffer.concat(chunks).toString("utf8");
    const url = new URL(req.url, "http://127.0.0.1");
    const record = {
      method: req.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      search: url.searchParams,
      headers: req.headers,
      body: parseBody(bodyText, req.headers["content-type"])
    };
    requests.push(record);
    const response = await handler(record, requests);
    res.statusCode = response?.status ?? 200;
    for (const [key, value] of Object.entries(response?.headers ?? {})) res.setHeader(key, value);
    const payload = response?.rawBody ?? (response?.body === undefined ? "" : JSON.stringify(response.body));
    if (payload && !res.hasHeader("content-type")) res.setHeader("content-type", "application/json");
    res.end(payload);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    return await fn({ base: `http://127.0.0.1:${port}/api/v5`, requests });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

export function contractHandler(cases, mismatches = []) {
  const queue = [...cases];
  return (req) => {
    const next = queue.shift();
    if (!next) return { status: 500, body: { error: `Unexpected request ${req.method} ${req.path}` } };
    try {
      assert.equal(req.method, next.method, `${next.name ?? next.path}: method`);
      assert.equal(req.path, next.path, `${next.name ?? next.path}: path`);
      for (const [key, value] of Object.entries(next.query ?? {})) {
        assert.equal(req.query[key], String(value), `${next.name ?? next.path}: query ${key}`);
      }
      for (const [key, value] of Object.entries(next.headers ?? {})) {
        assert.equal(req.headers[key.toLowerCase()], value, `${next.name ?? next.path}: header ${key}`);
      }
      if (next.body !== undefined) assert.deepEqual(req.body, next.body, `${next.name ?? next.path}: body`);
      return {
        status: next.status,
        headers: next.responseHeaders,
        body: next.response
      };
    } catch (error) {
      mismatches.push(error instanceof Error ? error.stack ?? error.message : String(error));
      return { status: 500, body: { error: mismatches.at(-1) } };
    }
  };
}

function parseBody(text, contentType = "") {
  if (!text) return undefined;
  if (contentType.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(text));
  if (contentType.includes("json") || /^[\s\n]*[{\[]/.test(text)) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}
