import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(message: string, status = 400, extra?: object) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function prismaError(err: unknown): { status: number; message: string } | null {
  if (!err || typeof err !== "object" || !("code" in err)) return null;
  const code = (err as { code?: unknown }).code;
  if (code === "P2002") return { status: 409, message: "Already exists" };
  if (code === "P2025") return { status: 404, message: "Not found" };
  return null;
}

export function handleApiError(err: unknown) {
  if (err instanceof ZodError) {
    return jsonError("Validation failed", 400, {
      issues: err.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }

  if (err instanceof ApiError) {
    return jsonError(err.message, err.status);
  }

  const prisma = prismaError(err);
  if (prisma) {
    return jsonError(prisma.message, prisma.status);
  }

  const message = err instanceof Error ? err.message : "Internal server error";
  if (message === "Unauthorized") return jsonError("Unauthorized", 401);
  if (message === "Forbidden") return jsonError("Forbidden", 403);
  if (message === "Not found") return jsonError("Not found", 404);
  if (message === "Path traversal blocked") {
    return jsonError("Invalid path", 400);
  }

  console.error(err);
  return jsonError("Internal server error", 500);
}
