import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CLIENT_DIR = process.cwd();
const TOKEN_STUDIO_DIR = path.join(CLIENT_DIR, "tokens", "token-studio");
const SOURCE_PATH = path.join(CLIENT_DIR, "tokens", "source.json");

const TOKEN_SET_FILES = ["color.json", "typography.json"];

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const writeJson = async (filePath, value) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const isToken = (value) =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  (typeof value.$type === "string" || typeof value.type === "string") &&
  Object.hasOwn(value, "$value");

const normalizePathSegment = (segment) => {
  if (/^\d+$/.test(segment)) {
    return String(Number(segment));
  }

  return segment.replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase());
};

const setDeep = (target, segments, value) => {
  let current = target;

  for (const segment of segments.slice(0, -1)) {
    current[segment] ??= {};
    current = current[segment];
  }

  const leaf = segments.at(-1);
  if (!leaf) {
    throw new Error("Cannot set an empty token path.");
  }

  if (Object.hasOwn(current, leaf)) {
    throw new Error(`Duplicate token path: ${segments.join(".")}`);
  }

  current[leaf] = value;
};

const fontWeightToNumber = (weight) => {
  const normalized = String(weight).toLowerCase().replace(/\s+/g, "");
  const weights = {
    thin: 100,
    extralight: 200,
    light: 300,
    regular: 400,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  };

  return weights[normalized] ?? Number(weight);
};

const assertHex = (value, pathLabel) => {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`Invalid color token at ${pathLabel}: ${value}`);
  }
};

const assertDimension = (value, pathLabel) => {
  if (!/^-?\d+(\.\d+)?(px|rem|em|%)$/.test(String(value))) {
    throw new Error(`Invalid dimension token at ${pathLabel}: ${value}`);
  }
};

const normalizeTypography = (value, pathLabel) => {
  const requiredKeys = [
    "fontFamily",
    "fontWeight",
    "fontSize",
    "lineHeight",
    "letterSpacing",
  ];

  for (const key of requiredKeys) {
    if (!Object.hasOwn(value, key)) {
      throw new Error(`Missing typography property ${pathLabel}.${key}`);
    }
  }

  const fontWeight = fontWeightToNumber(value.fontWeight);
  if (!Number.isFinite(fontWeight)) {
    throw new Error(`Invalid fontWeight at ${pathLabel}: ${value.fontWeight}`);
  }

  assertDimension(value.fontSize, `${pathLabel}.fontSize`);
  assertDimension(value.lineHeight, `${pathLabel}.lineHeight`);

  return {
    fontFamily: String(value.fontFamily),
    fontSize: String(value.fontSize),
    lineHeight: String(value.lineHeight),
    fontWeight,
    letterSpacing: String(value.letterSpacing),
  };
};

const collectTokens = (node, segments, output) => {
  if (isToken(node)) {
    const type = node.$type ?? node.type;
    const value = node.$value;
    const normalizedSegments = segments.map(normalizePathSegment);
    const pathLabel = normalizedSegments.join(".");

    if (type === "color") {
      assertHex(value, pathLabel);
      setDeep(output.color, normalizedSegments.slice(1), value.toUpperCase());
      return;
    }

    if (type === "typography") {
      setDeep(
        output.typography,
        normalizedSegments.slice(1),
        normalizeTypography(value, pathLabel),
      );
      return;
    }

    throw new Error(`Unsupported token type at ${pathLabel}: ${type}`);
  }

  for (const [key, child] of Object.entries(node)) {
    collectTokens(child, [...segments, key], output);
  }
};

const main = async () => {
  const source = {
    color: {},
    typography: {},
  };

  for (const fileName of TOKEN_SET_FILES) {
    const tokenSet = await readJson(path.join(TOKEN_STUDIO_DIR, fileName));
    collectTokens(tokenSet, [], source);
  }

  await writeJson(SOURCE_PATH, source);
  console.log(`Generated ${path.relative(CLIENT_DIR, SOURCE_PATH)}`);
};

await main();
