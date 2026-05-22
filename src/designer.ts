import type { WebSpec } from "./types.js";

export function renderDesign(spec: WebSpec): string {
  const lines = [
    `# ${spec.name} CLI Design`,
    "",
    "## Source",
    "",
    `- Target: \`${spec.target}\``,
    `- Type: \`${spec.targetType}\``
  ];
  if (spec.baseUrl) lines.push(`- Base URL: \`${spec.baseUrl}\``);
  if (spec.frameworks.length) lines.push(`- Framework signals: ${spec.frameworks.join(", ")}`);
  if (Object.keys(spec.packageScripts).length) {
    lines.push("", "## Package Scripts", "");
    for (const [name, command] of Object.entries(spec.packageScripts).sort()) {
      lines.push(`- \`${name}\`: \`${command}\``);
    }
  }
  lines.push(
    "",
    "## Command Groups",
    "",
    "### status",
    "",
    "Expose target metadata, framework signals, and generation notes.",
    "",
    "### routes",
    "",
    `Expose ${spec.routes.length} discovered page routes for navigation and smoke checks.`,
    "",
    "### api",
    "",
    `Expose ${spec.apiEndpoints.length} discovered endpoint hints and a generic endpoint caller.`,
    "",
    "### forms",
    "",
    `Expose ${spec.forms.length} discovered forms with field metadata.`,
    "",
    "### request",
    "",
    "Provide generic GET and POST commands for web operations not yet promoted to first-class commands."
  );
  if (spec.routes.length) {
    lines.push("", "## Routes", "");
    for (const route of spec.routes) lines.push(`- \`${route.method} ${route.path}\` from \`${route.source}\``);
  }
  if (spec.apiEndpoints.length) {
    lines.push("", "## API Endpoints", "");
    for (const endpoint of spec.apiEndpoints) lines.push(`- \`${endpoint.method} ${endpoint.path}\` from \`${endpoint.source}\``);
  }
  if (spec.forms.length) {
    lines.push("", "## Forms", "");
    for (const form of spec.forms) {
      const fields = form.fields.map((field) => field.name).join(", ") || "no named fields";
      lines.push(`- \`${form.method} ${form.action}\` from \`${form.source}\` fields: ${fields}`);
    }
  }
  if (spec.openapiFiles.length) {
    lines.push("", "## OpenAPI Files", "");
    for (const file of spec.openapiFiles) lines.push(`- \`${file}\``);
  }
  if (spec.notes.length) {
    lines.push("", "## Notes", "");
    for (const note of spec.notes) lines.push(`- ${note}`);
  }
  lines.push("");
  return lines.join("\n");
}

