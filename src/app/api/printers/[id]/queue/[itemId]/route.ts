import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id: printerId, itemId } = await ctx.params;
    const existing = await prisma.printQueueItem.findFirst({
      where: { id: itemId, printerId },
    });
    if (!existing) return jsonError("Queue item not found", 404);

    await prisma.$transaction(async (tx) => {
      await tx.printTimer.updateMany({
        where: { printerId, linkedQueueItemId: itemId },
        data: { linkedQueueItemId: null },
      });
      await tx.printQueueItem.delete({ where: { id: itemId } });

      const remaining = await tx.printQueueItem.findMany({
        where: { printerId },
        orderBy: { position: "asc" },
      });
      await Promise.all(
        remaining.map((item, index) =>
          tx.printQueueItem.update({
            where: { id: item.id },
            data: { position: index },
          }),
        ),
      );
    });

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
