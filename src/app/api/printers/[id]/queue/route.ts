import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

const addSchema = z.object({
  modelId: z.string().min(1),
});

export async function GET(_request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id: printerId } = await ctx.params;
    const items = await prisma.printQueueItem.findMany({
      where: { printerId },
      orderBy: { position: "asc" },
      include: { model: { include: { files: true } } },
    });
    return jsonOk(items);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id: printerId } = await ctx.params;
    const body = addSchema.parse(await request.json());

    const printer = await prisma.printer.findUnique({ where: { id: printerId } });
    if (!printer) return jsonError("Printer not found", 404);
    const model = await prisma.model.findUnique({ where: { id: body.modelId } });
    if (!model) return jsonError("Model not found", 404);

    const max = await prisma.printQueueItem.aggregate({
      where: { printerId },
      _max: { position: true },
    });
    const position = (max._max.position ?? -1) + 1;

    const item = await prisma.printQueueItem.create({
      data: { printerId, modelId: body.modelId, position },
      include: { model: { include: { files: true } } },
    });
    return jsonOk(item, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

const reorderSchema = z.object({
  orderedIds: z.array(z.string()).min(1),
});

export async function PUT(request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id: printerId } = await ctx.params;
    const body = reorderSchema.parse(await request.json());

    await prisma.$transaction(
      body.orderedIds.map((itemId, index) =>
        prisma.printQueueItem.updateMany({
          where: { id: itemId, printerId },
          data: { position: index },
        }),
      ),
    );

    const items = await prisma.printQueueItem.findMany({
      where: { printerId },
      orderBy: { position: "asc" },
      include: { model: { include: { files: true } } },
    });
    return jsonOk(items);
  } catch (err) {
    return handleApiError(err);
  }
}
