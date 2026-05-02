import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DESIGN_MD = path.join(ROOT, "DESIGN.md");
const OUT_DIR = path.join(ROOT, "tokens");
const OUT_JSON = path.join(OUT_DIR, "design-tokens.json");
const OUT_CSS = path.join(OUT_DIR, "design-tokens.css");
const OUT_CLIENT_CSS = path.join(ROOT, "client", "src", "design-tokens.generated.css");

function extractFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    throw new Error("DESIGN.md frontmatter not found.");
  }
  return match[1];
}

function stripQuotes(value) {
  return value.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
}

function parseFrontmatter(frontmatter) {
  const colors = {};
  const typography = {};

  let section = "";
  let currentTypeToken = "";

  for (const line of frontmatter.split("\n")) {
    const topLevelMatch = line.match(/^([a-zA-Z0-9-]+):\s*$/);
    if (topLevelMatch) {
      const topLevel = topLevelMatch[1];
      section = topLevel === "colors" || topLevel === "typography" ? topLevel : "";
      currentTypeToken = "";
      continue;
    }

    if (section === "colors") {
      const colorMatch = line.match(/^  ([a-z0-9-]+):\s*(.+)\s*$/i);
      if (colorMatch) {
        const [, name, rawValue] = colorMatch;
        colors[name] = stripQuotes(rawValue.trim());
      }
      continue;
    }

    if (section === "typography") {
      const tokenStart = line.match(/^  ([a-z0-9-]+):\s*$/i);
      if (tokenStart) {
        currentTypeToken = tokenStart[1];
        typography[currentTypeToken] = {};
        continue;
      }

      const propMatch = line.match(/^    ([a-zA-Z][a-zA-Z0-9]*):\s*(.+)\s*$/);
      if (propMatch && currentTypeToken) {
        const [, prop, rawValue] = propMatch;
        typography[currentTypeToken][prop] = stripQuotes(rawValue.trim());
      }
    }
  }

  return { colors, typography };
}

function toKebabCase(value) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .toLowerCase();
}

function toCss(tokens) {
  const lines = [":root {"];

  for (const [name, value] of Object.entries(tokens.colors)) {
    lines.push(`  --color-${name}: ${value};`);
  }

  for (const [tokenName, props] of Object.entries(tokens.typography)) {
    for (const [prop, value] of Object.entries(props)) {
      lines.push(`  --typography-${tokenName}-${toKebabCase(prop)}: ${value};`);
    }
  }

  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const markdown = await readFile(DESIGN_MD, "utf8");
  const frontmatter = extractFrontmatter(markdown);
  const parsed = parseFrontmatter(frontmatter);

  const payload = {
    generatedAt: new Date().toISOString(),
    source: "DESIGN.md",
    tokens: parsed,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_JSON, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  const css = toCss(parsed);
  await writeFile(OUT_CSS, css, "utf8");
  await writeFile(OUT_CLIENT_CSS, css, "utf8");

  process.stdout.write(
    `Generated ${path.relative(ROOT, OUT_JSON)}, ${path.relative(ROOT, OUT_CSS)}, and ${path.relative(ROOT, OUT_CLIENT_CSS)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
