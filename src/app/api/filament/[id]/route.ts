import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    manufacturer: z.string().max(200).optional(),
    material: z.string().max(80).optional(),
    color: z.string().max(80).optional(),
    startingGrams: z.number().positive().max(100_000).optional(),
    remainingGrams: z.number().min(0).max(100_000).optional(),
    rollCount: z.number().int().min(0).max(10_000).optional(),
    openedFromBag: z.boolean().optional(),
    notes: z.string().max(2000).optional(),
    markDried: z.boolean().optional(),
    lastDriedAt: z.string().datetime().nullable().optional(),
  })
  .refine(
    (data) => {
      if (
        data.startingGrams === undefined ||
        data.remainingGrams === undefined
      ) {
        return true;
      }
      return data.remainingGrams <= data.startingGrams;
    },
    {
      path: ["remainingGrams"],
      message: "Remaining grams must be less than or equal to starting grams",
    },
  );

export async function GET(_request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const roll = await prisma.filamentRoll.findUnique({ where: { id } });
    if (!roll) return jsonError("Filament not found", 404);
    return jsonOk(roll);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const body = updateSchema.parse(await request.json());

    const data: Record<string, unknown> = { ...body };
    delete data.markDried;
    if (body.markDried) {
      data.lastDriedAt = new Date();
    } else if (body.lastDriedAt !== undefined) {
      data.lastDriedAt = body.lastDriedAt ? new Date(body.lastDriedAt) : null;
    }

    const roll = await prisma.filamentRoll.update({
      where: { id },
      data,
    });
    return jsonOk(roll);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    await prisma.filamentRoll.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
