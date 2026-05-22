import type { FormFieldSpec, FormSpec, RouteSpec } from "./types.js";

export interface HtmlProbeResult {
  routes: RouteSpec[];
  forms: FormSpec[];
}

export function probeHtml(html: string, source: string): HtmlProbeResult {
  return {
    routes: extractLinks(html, source),
    forms: extractForms(html, source)
  };
}

function extractLinks(html: string, source: string): RouteSpec[] {
  const routes: RouteSpec[] = [];
  const linkRe = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(linkRe)) {
    const href = match[1]?.trim();
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    routes.push({ path: href, source, kind: "page", method: "GET" });
  }
  return routes;
}

function extractForms(html: string, source: string): FormSpec[] {
  const forms: FormSpec[] = [];
  const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  for (const match of html.matchAll(formRe)) {
    const attrs = parseAttrs(match[1] ?? "");
    const body = match[2] ?? "";
    const form: FormSpec = {
      action: attrs.action || "/",
      method: (attrs.method || "GET").toUpperCase(),
      source,
      fields: extractFields(body)
    };
    const name = attrs.name || attrs.id;
    if (name) form.name = name;
    forms.push(form);
  }
  return forms;
}

function extractFields(html: string): FormFieldSpec[] {
  const fields: FormFieldSpec[] = [];
  const fieldRe = /<(input|textarea|select)\b([^>]*)>/gi;
  for (const match of html.matchAll(fieldRe)) {
    const tag = (match[1] ?? "input").toLowerCase();
    const attrs = parseAttrs(match[2] ?? "");
    const name = attrs.name || attrs.id;
    if (!name) continue;
    fields.push({
      name,
      fieldType: attrs.type || tag,
      required: Object.hasOwn(attrs, "required")
    });
  }
  return fields;
}

function parseAttrs(input: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  for (const match of input.matchAll(attrRe)) {
    const key = (match[1] ?? "").toLowerCase();
    if (!key) continue;
    attrs[key] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}
