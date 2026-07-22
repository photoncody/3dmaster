import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { isTimerFinished, remainingSeconds } from "@/lib/timer";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  action: z.enum(["start", "pause", "resume", "reset", "complete", "set"]),
  durationSeconds: z.number().int().min(0).max(60 * 60 * 48).optional(),
  linkedQueueItemId: z.string().nullable().optional(),
});

export async function GET(_request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id: printerId } = await ctx.params;
    const timer = await prisma.printTimer.findUnique({
      where: { printerId },
    });

    if (!timer) {
      return jsonOk({
        printerId,
        status: "idle",
        durationSeconds: 0,
        startedAt: null,
        pausedRemaining: null,
        linkedQueueItemId: null,
        remainingSeconds: 0,
      });
    }

    const responseTimer = isTimerFinished(timer)
      ? { ...timer, status: "completed", pausedRemaining: null }
      : timer;

    return jsonOk({
      ...responseTimer,
      remainingSeconds: remainingSeconds(responseTimer),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id: printerId } = await ctx.params;
    const body = patchSchema.parse(await request.json());

    const current = await prisma.printTimer.upsert({
      where: { printerId },
      create: { printerId },
      update: {},
    });

    if (body.linkedQueueItemId !== undefined && body.linkedQueueItemId !== null) {
      const queueItem = await prisma.printQueueItem.findFirst({
        where: { id: body.linkedQueueItemId, printerId },
        select: { id: true },
      });
      if (!queueItem) return jsonError("Linked queue item not found");
    }

    const linkedQueueItemId =
      body.linkedQueueItemId === undefined
        ? current.linkedQueueItemId
        : body.linkedQueueItemId;

    let data: Record<string, unknown> = {};

    switch (body.action) {
      case "set": {
        if (body.durationSeconds === undefined) {
          return jsonError("durationSeconds required");
        }
        data = {
          durationSeconds: body.durationSeconds,
          status: "idle",
          startedAt: null,
          pausedRemaining: null,
          linkedQueueItemId,
        };
        break;
      }
      case "start": {
        const duration =
          body.durationSeconds ??
          (current.status === "paused" ? current.pausedRemaining : null) ??
          current.durationSeconds;
        if (!duration || duration <= 0) {
          return jsonError("Set a duration before starting");
        }
        data = {
          durationSeconds: duration,
          startedAt: new Date(),
          status: "running",
          pausedRemaining: null,
          linkedQueueItemId,
        };
        break;
      }
      case "pause": {
        if (current.status !== "running") {
          return jsonError("Timer is not running");
        }
        data = {
          status: "paused",
          pausedRemaining: remainingSeconds(current),
          startedAt: null,
        };
        break;
      }
      case "resume": {
        if (current.status !== "paused") {
          return jsonError("Timer is not paused");
        }
        const rem = current.pausedRemaining ?? 0;
        data = {
          status: "running",
          startedAt: new Date(),
          durationSeconds: rem,
          pausedRemaining: null,
        };
        break;
      }
      case "reset": {
        data = {
          status: "idle",
          startedAt: null,
          pausedRemaining: null,
          linkedQueueItemId: null,
        };
        break;
      }
      case "complete": {
        data = {
          status: "completed",
          pausedRemaining: null,
          startedAt: null,
        };
        break;
      }
    }

    const timer = await prisma.$transaction(async (tx) => {
      const updated = await tx.printTimer.update({
        where: { printerId },
        data,
      });

      // Completing a print clears the active queue slot so the next item
      // can be started (with a required duration) from the queue UI.
      if (body.action === "complete" && updated.linkedQueueItemId) {
        const linkedId = updated.linkedQueueItemId;
        await tx.printQueueItem.deleteMany({
          where: { id: linkedId, printerId },
        });
        await tx.printTimer.update({
          where: { printerId },
          data: { linkedQueueItemId: null },
        });

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

        return { ...updated, linkedQueueItemId: null };
      }

      return updated;
    });

    return jsonOk({
      ...timer,
      remainingSeconds: remainingSeconds(timer),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
