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
    let timer = await prisma.printTimer.upsert({
      where: { printerId },
      create: { printerId },
      update: {},
    });

    if (isTimerFinished(timer)) {
      timer = await prisma.printTimer.update({
        where: { printerId },
        data: { status: "completed", pausedRemaining: 0 },
      });
    }

    return jsonOk({
      ...timer,
      remainingSeconds: remainingSeconds(timer),
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
          linkedQueueItemId:
            body.linkedQueueItemId === undefined
              ? current.linkedQueueItemId
              : body.linkedQueueItemId,
        };
        break;
      }
      case "start": {
        const duration =
          body.durationSeconds ??
          current.pausedRemaining ??
          current.durationSeconds;
        if (duration <= 0) return jsonError("Set a duration before starting");
        data = {
          durationSeconds: duration,
          startedAt: new Date(),
          status: "running",
          pausedRemaining: null,
          linkedQueueItemId:
            body.linkedQueueItemId === undefined
              ? current.linkedQueueItemId
              : body.linkedQueueItemId,
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
          pausedRemaining: 0,
          startedAt: null,
        };
        break;
      }
    }

    const timer = await prisma.printTimer.update({
      where: { printerId },
      data,
    });

    return jsonOk({
      ...timer,
      remainingSeconds: remainingSeconds(timer),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
