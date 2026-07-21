import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { deleteModelDir } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
});

export async function GET(_request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const model = await prisma.model.findUnique({
      where: { id },
      include: { files: true },
    });
    if (!model) return jsonError("Model not found", 404);
    return jsonOk(model);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const body = updateSchema.parse(await request.json());
    const model = await prisma.model.update({
      where: { id },
      data: body,
      include: { files: true },
    });
    return jsonOk(model);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const model = await prisma.model.findUnique({ where: { id } });
    if (!model) return jsonError("Model not found", 404);
    await prisma.model.delete({ where: { id } });
    await deleteModelDir(id);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
