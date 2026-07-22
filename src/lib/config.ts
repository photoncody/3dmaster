import path from "path";

function readEnv(name: string): string | undefined {
  // Dynamic key prevents Next.js from inlining the value at build time.
  return process.env[name];
}

function envBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function envInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

const WEAK_AUTH_SECRETS = new Set([
  "dev-secret-change-me",
  "change-me-to-a-long-random-string",
  "generate-a-long-random-string",
  "change-me",
]);

export function isWeakAuthSecret(secret: string): boolean {
  const normalized = secret.trim();
  return normalized.length < 32 || WEAK_AUTH_SECRETS.has(normalized);
}

export const config = {
  get authEnabled() {
    return envBool(readEnv("AUTH_ENABLED"), false);
  },
  get authSecret() {
    return readEnv("AUTH_SECRET") || "";
  },
  get authTrustHost() {
    return envBool(readEnv("AUTH_TRUST_HOST"), true);
  },
  get credentialsEnabled() {
    return envBool(readEnv("AUTH_CREDENTIALS_ENABLED"), true);
  },
  get oidcAllowAllGroups() {
    return envBool(readEnv("OIDC_ALLOW_ALL_GROUPS"), false);
  },
  get allowInsecureNoAuth() {
    return envBool(readEnv("ALLOW_INSECURE_NO_AUTH"), false);
  },
  get dataDir() {
    return readEnv("DATA_DIR") || path.join(process.cwd(), "data");
  },
  get maxUploadBytes() {
    return envInt(readEnv("MAX_UPLOAD_BYTES"), 200 * 1024 * 1024);
  },
  get dryThresholdsDays() {
    return {
      green: envInt(readEnv("DRY_GREEN_DAYS"), 3),
      yellow: envInt(readEnv("DRY_YELLOW_DAYS"), 7),
      orange: envInt(readEnv("DRY_ORANGE_DAYS"), 14),
    };
  },
  get cleanThresholdsDays() {
    return {
      green: envInt(readEnv("CLEAN_GREEN_DAYS"), 7),
      yellow: envInt(readEnv("CLEAN_YELLOW_DAYS"), 14),
      orange: envInt(readEnv("CLEAN_ORANGE_DAYS"), 30),
    };
  },
  get oidc() {
    return {
      issuer: readEnv("OIDC_ISSUER") || "",
      clientId: readEnv("OIDC_CLIENT_ID") || "",
      clientSecret: readEnv("OIDC_CLIENT_SECRET") || "",
      groupClaim: readEnv("OIDC_GROUP_CLAIM") || "groups",
      allowedGroups: (readEnv("OIDC_ALLOWED_GROUPS") || "")
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean),
    };
  },
  get bootstrap() {
    return {
      username: readEnv("AUTH_BOOTSTRAP_USER") || "",
      password: readEnv("AUTH_BOOTSTRAP_PASSWORD") || "",
    };
  },
  allowedModelExtensions: [
    ".stl",
    ".3mf",
    ".obj",
    ".gcode",
    ".gco",
    ".step",
    ".stp",
    ".amf",
  ] as const,
};

export function assertAuthConfig(): void {
  // Skip runtime production guards during `next build` (NODE_ENV=production there).
  const isNextBuild = process.env.NEXT_PHASE === "phase-production-build";

  if (!config.authEnabled) {
    if (
      process.env.NODE_ENV === "production" &&
      !config.allowInsecureNoAuth &&
      !isNextBuild
    ) {
      throw new Error(
        "AUTH_ENABLED=false is not allowed in production unless ALLOW_INSECURE_NO_AUTH=true.",
      );
    }
    return;
  }

  if (isWeakAuthSecret(config.authSecret)) {
    throw new Error(
      "AUTH_SECRET must be set to a strong random value of at least 32 characters when AUTH_ENABLED=true.",
    );
  }

  const oidc = config.oidc;
  const oidcConfigured = Boolean(oidc.issuer && oidc.clientId && oidc.clientSecret);
  if (
    oidcConfigured &&
    oidc.allowedGroups.length === 0 &&
    !config.oidcAllowAllGroups
  ) {
    throw new Error(
      "OIDC_ALLOWED_GROUPS is required when OIDC is configured unless OIDC_ALLOW_ALL_GROUPS=true.",
    );
  }
}

export function modelsDir(): string {
  return path.join(config.dataDir, "models");
}
