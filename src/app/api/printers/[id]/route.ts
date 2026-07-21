import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  notes: z.string().max(2000).optional(),
});

export async function GET(_request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const printer = await prisma.printer.findUnique({
      where: { id },
      include: {
        maintenance: true,
        timer: true,
        queueItems: {
          orderBy: { position: "asc" },
          include: {
            model: { include: { files: true } },
          },
        },
      },
    });
    if (!printer) return jsonError("Printer not found", 404);
    return jsonOk(printer);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const body = updateSchema.parse(await request.json());
    const printer = await prisma.printer.update({
      where: { id },
      data: body,
      include: { maintenance: true, timer: true },
    });
    return jsonOk(printer);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    await prisma.printer.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
