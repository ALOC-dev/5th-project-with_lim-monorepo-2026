import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CLIENT_DIR = process.cwd();
const SOURCE_PATH = path.join(CLIENT_DIR, "tokens", "source.json");
const OUTPUT_DIR = path.join(CLIENT_DIR, "src", "design-system");

const GENERATED_HEADER = "// This file is generated. Do not edit manually.\n\n";

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const writeGenerated = async (fileName, content) => {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(path.join(OUTPUT_DIR, fileName), `${GENERATED_HEADER}${content}`);
};

const isObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isAlias = (value) =>
  typeof value === "string" && /^\{[a-zA-Z0-9_.-]+\}$/.test(value);

const getDeep = (target, pathSegments) => {
  let current = target;
  for (const segment of pathSegments) {
    if (!isObject(current) || !Object.hasOwn(current, segment)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
};

const resolveAliases = (root, value, stack = []) => {
  if (isAlias(value)) {
    const pathLabel = value.slice(1, -1);
    if (stack.includes(pathLabel)) {
      throw new Error(`Circular token alias: ${[...stack, pathLabel].join(" -> ")}`);
    }

    const target = getDeep(root, pathLabel.split("."));
    if (target === undefined) {
      throw new Error(`Missing token alias target: ${pathLabel}`);
    }

    return resolveAliases(root, target, [...stack, pathLabel]);
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveAliases(root, item, stack));
  }

  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        resolveAliases(root, child, stack),
      ]),
    );
  }

  return value;
};

const assertHexTree = (node, pathSegments = []) => {
  if (typeof node === "string") {
    if (!/^#[0-9A-F]{6}$/.test(node)) {
      throw new Error(`Invalid color token at ${pathSegments.join(".")}: ${node}`);
    }
    return;
  }

  for (const [key, child] of Object.entries(node)) {
    assertHexTree(child, [...pathSegments, key]);
  }
};

const assertTypographyTree = (node, pathSegments = []) => {
  const requiredKeys = [
    "fontFamily",
    "fontSize",
    "lineHeight",
    "fontWeight",
    "letterSpacing",
  ];

  if (requiredKeys.every((key) => Object.hasOwn(node, key))) {
    for (const key of requiredKeys) {
      if (node[key] === "" || node[key] === null || node[key] === undefined) {
        throw new Error(`Invalid typography token at ${pathSegments.join(".")}.${key}`);
      }
    }
    return;
  }

  for (const [key, child] of Object.entries(node)) {
    if (!isObject(child)) {
      throw new Error(`Invalid typography branch at ${[...pathSegments, key].join(".")}`);
    }
    assertTypographyTree(child, [...pathSegments, key]);
  }
};

const createTypographyCss = (node) => {
  if (
    isObject(node) &&
    ["fontFamily", "fontSize", "lineHeight", "fontWeight", "letterSpacing"].every(
      (key) => Object.hasOwn(node, key),
    )
  ) {
    return [
      `font-family: "${node.fontFamily}", system-ui, sans-serif;`,
      `font-size: ${node.fontSize};`,
      `line-height: ${node.lineHeight};`,
      `font-weight: ${node.fontWeight};`,
      `letter-spacing: ${node.letterSpacing};`,
    ].join("\n");
  }

  return Object.fromEntries(
    Object.entries(node).map(([key, child]) => [key, createTypographyCss(child)]),
  );
};

const toTs = (value) => JSON.stringify(value, null, 2);

const main = async () => {
  const source = await readJson(SOURCE_PATH);
  const tokens = resolveAliases(source, source);

  assertHexTree(tokens.color, ["color"]);
  assertTypographyTree(tokens.typography, ["typography"]);

  await writeGenerated(
    "tokens.generated.ts",
    `export const tokens = ${toTs(tokens)} as const;\n`,
  );

  await writeGenerated(
    "typography.generated.ts",
    `export const typography = ${toTs(createTypographyCss(tokens.typography))} as const;\n`,
  );

  await writeGenerated(
    "theme.generated.ts",
    `import { tokens } from "./tokens.generated";\n\nexport const theme = { tokens } as const;\n`,
  );

  console.log(`Generated ${path.relative(CLIENT_DIR, OUTPUT_DIR)}`);
};

await main();
