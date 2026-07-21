import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  notes: z.string().max(2000).optional().default(""),
});

export async function GET() {
  try {
    await requireAuth();
    const printers = await prisma.printer.findMany({
      orderBy: { name: "asc" },
      include: {
        maintenance: true,
        timer: true,
        _count: { select: { queueItems: true } },
      },
    });
    return jsonOk(printers);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    await requireAuth();
    const body = createSchema.parse(await request.json());
    const printer = await prisma.printer.create({
      data: {
        name: body.name,
        notes: body.notes,
        maintenance: { create: {} },
        timer: { create: {} },
      },
      include: { maintenance: true, timer: true },
    });
    return jsonOk(printer, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
