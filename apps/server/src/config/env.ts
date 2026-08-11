import { z } from "zod";

const ENVIRONMENT_VARIABLE_NAMES = [
  "OPENAI_API_KEY",
  "TMAP_APP_KEY",
  "KAKAO_REST_API_KEY",
  "NAVER_SEARCH_CLIENT_ID",
  "NAVER_SEARCH_CLIENT_SECRET",
  "NAVER_CLIENT_ID",
  "NAVER_CLIENT_SECRET",
  "PORT",
] as const;

type ServerEnvironmentVariable = (typeof ENVIRONMENT_VARIABLE_NAMES)[number];

export type ServerConfig = {
  readonly port: number;
};

export type ServerSecrets = {
  readonly openAiApiKey: string;
  readonly kakaoRestApiKey: string;
  readonly tmapAppKey: string;
  readonly naverSearchClientId: string;
  readonly naverSearchClientSecret: string;
};

export type ServerEnvironment = {
  readonly config: ServerConfig;
  readonly secrets: ServerSecrets;
};

export class ServerEnvironmentError extends Error {
  readonly name = "ServerEnvironmentError";
  readonly variableNames: readonly ServerEnvironmentVariable[];

  constructor(variableNames: readonly ServerEnvironmentVariable[]) {
    const uniqueNames = [...new Set(variableNames)];
    super(`Invalid server environment: ${uniqueNames.join(", ")}`);
    this.variableNames = Object.freeze(uniqueNames);
  }
}

const RequiredCredentialSchema = z.string().trim().min(1);
const OptionalCredentialSchema = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional();
const PortSchema = z.coerce.number().int().min(1).max(65_535).default(3000);

const CoreEnvironmentSchema = z.object({
  OPENAI_API_KEY: RequiredCredentialSchema,
  TMAP_APP_KEY: RequiredCredentialSchema,
  KAKAO_REST_API_KEY: RequiredCredentialSchema,
  PORT: PortSchema,
});

const NaverEnvironmentSchema = z.object({
  NAVER_SEARCH_CLIENT_ID: OptionalCredentialSchema,
  NAVER_SEARCH_CLIENT_SECRET: OptionalCredentialSchema,
  NAVER_CLIENT_ID: OptionalCredentialSchema,
  NAVER_CLIENT_SECRET: OptionalCredentialSchema,
});

export const parseServerEnvironment = (
  source: NodeJS.ProcessEnv,
): ServerEnvironment => {
  const core = CoreEnvironmentSchema.safeParse(source);
  const naver = NaverEnvironmentSchema.safeParse(source);

  const canonicalId = naver.success
    ? naver.data.NAVER_SEARCH_CLIENT_ID
    : undefined;
  const canonicalSecret = naver.success
    ? naver.data.NAVER_SEARCH_CLIENT_SECRET
    : undefined;
  const legacyId = naver.success ? naver.data.NAVER_CLIENT_ID : undefined;
  const legacySecret = naver.success
    ? naver.data.NAVER_CLIENT_SECRET
    : undefined;

  const naverPair =
    canonicalId !== undefined && canonicalSecret !== undefined
      ? { id: canonicalId, secret: canonicalSecret }
      : legacyId !== undefined && legacySecret !== undefined
        ? { id: legacyId, secret: legacySecret }
        : undefined;

  const invalidNames = ENVIRONMENT_VARIABLE_NAMES.filter((name) =>
    (!core.success && core.error.issues.some((issue) => issue.path[0] === name)) ||
    (!naver.success &&
      naver.error.issues.some((issue) => issue.path[0] === name)),
  );
  const missingNames: ServerEnvironmentVariable[] = [];

  if (naver.success && naverPair === undefined) {
    if (canonicalId === undefined) missingNames.push("NAVER_SEARCH_CLIENT_ID");
    if (canonicalSecret === undefined) {
      missingNames.push("NAVER_SEARCH_CLIENT_SECRET");
    }
    if (legacyId === undefined) missingNames.push("NAVER_CLIENT_ID");
    if (legacySecret === undefined) missingNames.push("NAVER_CLIENT_SECRET");
  }

  if (!core.success || naverPair === undefined) {
    throw new ServerEnvironmentError([...invalidNames, ...missingNames]);
  }

  const config: ServerConfig = Object.freeze({ port: core.data.PORT });
  const secrets: ServerSecrets = Object.freeze({
    openAiApiKey: core.data.OPENAI_API_KEY,
    kakaoRestApiKey: core.data.KAKAO_REST_API_KEY,
    tmapAppKey: core.data.TMAP_APP_KEY,
    naverSearchClientId: naverPair.id,
    naverSearchClientSecret: naverPair.secret,
  });

  return Object.freeze({ config, secrets });
};
