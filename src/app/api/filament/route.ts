import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";

const createSchema = z
  .object({
    name: z.string().min(1).max(200),
    manufacturer: z.string().max(200).optional().default(""),
    material: z.string().max(80).optional().default("PLA"),
    color: z.string().max(80).optional().default(""),
    startingGrams: z.number().positive().max(100_000),
    remainingGrams: z.number().min(0).max(100_000).optional(),
    rollCount: z.number().int().min(0).max(10_000).optional().default(1),
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
      orderBy: [{ manufacturer: "asc" }, { name: "asc" }],
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
    const roll = await prisma.filamentRoll.create({
      data: {
        name: body.name,
        manufacturer: body.manufacturer,
        material: body.material,
        color: body.color,
        startingGrams: body.startingGrams,
        remainingGrams: body.remainingGrams ?? body.startingGrams,
        rollCount: body.rollCount,
        openedFromBag: body.openedFromBag,
        notes: body.notes,
      },
    });
    return jsonOk(roll, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
