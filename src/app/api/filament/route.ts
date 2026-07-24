import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";
import { filamentLabel } from "@/lib/filament-label";

const createSchema = z
  .object({
    name: z.string().max(200).optional(),
    manufacturer: z.string().max(200).optional().default(""),
    material: z.string().max(80).optional().default("PLA"),
    color: z.string().max(80).optional().default(""),
    startingGrams: z.number().positive().max(100_000),
    remainingGrams: z.number().min(0).max(100_000).optional(),
    rollCount: z.number().int().min(1).max(10_000).optional().default(1),
    openedFromBag: z.boolean().optional().default(false),
    notes: z.string().max(2000).optional().default(""),
  })
  .refine(
    (data) =>
      data.remainingGrams === undefined ||
      data.remainingGrams <= data.startingGrams,
    {
      path: ["remainingGrams"],
      message: "Remaining grams must be less than or equal to starting grams",
    },
  );

export async function GET() {
  try {
    await requireAuth();
    const rolls = await prisma.filamentRoll.findMany({
      orderBy: [{ manufacturer: "asc" }, { material: "asc" }, { color: "asc" }],
      include: {
        loadedPrinter: { select: { id: true, name: true } },
      },
    });
    return jsonOk(rolls);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    await requireAuth();
    const body = createSchema.parse(await request.json());
    const name =
      body.name?.trim() ||
      filamentLabel({
        manufacturer: body.manufacturer,
        material: body.material,
        color: body.color,
      });
    const remainingGrams = body.remainingGrams ?? body.startingGrams;
    const rollCount = body.rollCount;

    // Each physical roll is its own inventory row so remaining/dried state
    // can be tracked independently.
    const rolls = await prisma.$transaction(
      Array.from({ length: rollCount }, () =>
        prisma.filamentRoll.create({
          data: {
            name,
            manufacturer: body.manufacturer,
            material: body.material,
            color: body.color,
            startingGrams: body.startingGrams,
            remainingGrams,
            rollCount: 1,
            openedFromBag: body.openedFromBag,
            notes: body.notes,
          },
        }),
      ),
    );

    return jsonOk(rollCount === 1 ? rolls[0] : rolls, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
