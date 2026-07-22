import { jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return jsonOk({ ok: true, db: true });
  } catch {
    return jsonError("Database not ready", 503);
  }
}
