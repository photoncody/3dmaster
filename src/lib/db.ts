import path from "path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { config } from "./config";

/**
 * Resolve SQLite path from DATA_DIR at runtime.
 * Avoid depending on DATABASE_URL here — Next.js may inline that env var at
 * build time, which breaks relative paths when the process cwd changes (Docker).
 */
export function resolveDatabaseUrl(): string {
  const dataDir = path.resolve(config.dataDir);
  return `file:${path.join(dataDir, "3dmaster.db")}`;
}

const databaseUrl = resolveDatabaseUrl();

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

let bootstrapPromise: Promise<void> | null = null;

export async function ensureBootstrapUser(): Promise<void> {
  if (!config.authEnabled) return;
  const { username, password } = config.bootstrap;
  if (!username || !password) return;

  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const existing = await prisma.user.findUnique({ where: { username } });
      if (existing) return;
      const passwordHash = await bcrypt.hash(password, 12);
      await prisma.user.create({ data: { username, passwordHash } });
    })().catch((err) => {
      bootstrapPromise = null;
      throw err;
    });
  }
  await bootstrapPromise;
}
