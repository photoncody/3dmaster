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

export const config = {
  get authEnabled() {
    return envBool(readEnv("AUTH_ENABLED"), false);
  },
  get authSecret() {
    return readEnv("AUTH_SECRET") || "dev-secret-change-me";
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

export function modelsDir(): string {
  return path.join(config.dataDir, "models");
}
