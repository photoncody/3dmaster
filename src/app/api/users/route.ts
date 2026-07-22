import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { config } from "@/lib/config";

const createSchema = z.object({
  username: z.string().min(2).max(64),
  password: z.string().min(8).max(200),
});

export async function GET() {
  try {
    await requireAuth();
    if (!config.authEnabled) {
      return jsonOk({ authEnabled: false, users: [] });
    }
    const users = await prisma.user.findMany({
      select: { id: true, username: true, createdAt: true },
      orderBy: { username: "asc" },
    });
    return jsonOk({ authEnabled: true, users });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    if (!config.authEnabled) {
      return jsonError("Auth is disabled", 400);
    }
    const bootstrap = config.bootstrap.username;
    if (!bootstrap || session?.user?.name !== bootstrap) {
      return jsonError("Only the bootstrap admin can create users", 403);
    }
    const body = createSchema.parse(await request.json());
    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: { username: body.username, passwordHash },
      select: { id: true, username: true, createdAt: true },
    });
    return jsonOk(user, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
