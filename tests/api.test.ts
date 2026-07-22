import { execSync } from "child_process";
import path from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimitStore } from "@/lib/rate-limit";

const authMock = vi.hoisted(() => ({
  session: null as null | { user?: { name?: string | null } },
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: async () => authMock.session,
  requireBootstrapAdmin: async () => {
    const bootstrap = process.env.AUTH_BOOTSTRAP_USER || "";
    if (!bootstrap || authMock.session?.user?.name !== bootstrap) {
      throw new Error("Forbidden");
    }
    return authMock.session;
  },
  auth: async () => authMock.session,
  handlers: {
    GET: async () => new Response("ok"),
    POST: async () => new Response("ok"),
  },
  signIn: async () => undefined,
  signOut: async () => undefined,
  oidcConfigured: () => false,
}));

const dataDir = process.env.DATA_DIR!;
const dbUrl = process.env.DATABASE_URL!;

beforeAll(() => {
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: dbUrl, DATA_DIR: dataDir },
    cwd: path.resolve(__dirname, ".."),
    stdio: "pipe",
  });
});

async function resetDb() {
  const { prisma } = await import("@/lib/db");
  await prisma.printQueueItem.deleteMany();
  await prisma.modelFile.deleteMany();
  await prisma.model.deleteMany();
  await prisma.printTimer.deleteMany();
  await prisma.printerMaintenance.deleteMany();
  await prisma.printer.deleteMany();
  await prisma.filamentRoll.deleteMany();
  await prisma.user.deleteMany();
}

beforeEach(async () => {
  process.env.AUTH_ENABLED = "false";
  process.env.AUTH_BOOTSTRAP_USER = "";
  authMock.session = null;
  resetRateLimitStore();
  await resetDb();
});

afterAll(async () => {
  const { prisma } = await import("@/lib/db");
  await prisma.$disconnect();
});

describe("printers API", () => {
  it("creates and lists printers with maintenance and timer", async () => {
    const { POST, GET } = await import("@/app/api/printers/route");
    const created = await POST(
      new Request("http://localhost/api/printers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Workshop A",
          model: "X1C",
          notes: "bench",
        }),
      }),
    );
    expect(created.status).toBe(201);
    const printer = await created.json();
    expect(printer.name).toBe("Workshop A");
    expect(printer.model).toBe("X1C");
    expect(printer.maintenance).toBeTruthy();
    expect(printer.timer).toBeTruthy();

    const listed = await GET();
    expect(listed.status).toBe(200);
    const printers = await listed.json();
    expect(printers).toHaveLength(1);
  });

  it("rejects empty printer names", async () => {
    const { POST } = await import("@/app/api/printers/route");
    const res = await POST(
      new Request("http://localhost/api/printers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("filament API", () => {
  it("tracks remaining grams and markDried", async () => {
    const { POST } = await import("@/app/api/filament/route");
    const { PATCH } = await import("@/app/api/filament/[id]/route");

    const created = await POST(
      new Request("http://localhost/api/filament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manufacturer: "Generic",
          material: "PLA",
          color: "Black",
          startingGrams: 1000,
          remainingGrams: 750,
          rollCount: 1,
          openedFromBag: true,
        }),
      }),
    );
    expect(created.status).toBe(201);
    const roll = await created.json();
    expect(roll.remainingGrams).toBe(750);
    expect(roll.rollCount).toBe(1);
    expect(roll.name).toBe("Generic · PLA · Black");
    expect(roll.lastDriedAt).toBeNull();

    const dried = await PATCH(
      new Request(`http://localhost/api/filament/${roll.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markDried: true }),
      }),
      { params: Promise.resolve({ id: roll.id }) },
    );
    expect(dried.status).toBe(200);
    const updated = await dried.json();
    expect(updated.lastDriedAt).toBeTruthy();
  });

  it("creates separate inventory rows for rollCount > 1", async () => {
    const { POST, GET } = await import("@/app/api/filament/route");

    const created = await POST(
      new Request("http://localhost/api/filament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manufacturer: "Bambu",
          material: "PETG",
          color: "Blue",
          startingGrams: 1000,
          rollCount: 3,
        }),
      }),
    );
    expect(created.status).toBe(201);
    const rolls = await created.json();
    expect(Array.isArray(rolls)).toBe(true);
    expect(rolls).toHaveLength(3);
    expect(rolls.every((roll: { rollCount: number }) => roll.rollCount === 1)).toBe(
      true,
    );

    const listed = await GET();
    const inventory = await listed.json();
    const createdIds = new Set(rolls.map((roll: { id: string }) => roll.id));
    expect(inventory.filter((roll: { id: string }) => createdIds.has(roll.id))).toHaveLength(
      3,
    );
  });

  it("rejects impossible filament bounds", async () => {
    const { POST } = await import("@/app/api/filament/route");
    const res = await POST(
      new Request("http://localhost/api/filament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material: "PLA",
          startingGrams: 1000,
          remainingGrams: 1001,
          rollCount: 1,
        }),
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.issues).toContainEqual(
      expect.objectContaining({ path: "remainingGrams" }),
    );
  });

  it("rejects partial PATCH that would leave remaining above starting", async () => {
    const { POST } = await import("@/app/api/filament/route");
    const { PATCH } = await import("@/app/api/filament/[id]/route");

    const created = await POST(
      new Request("http://localhost/api/filament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "PLA Partial",
          startingGrams: 1000,
          remainingGrams: 750,
          rollCount: 1,
        }),
      }),
    );
    const roll = await created.json();

    const tooHigh = await PATCH(
      new Request(`http://localhost/api/filament/${roll.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remainingGrams: 1200 }),
      }),
      { params: Promise.resolve({ id: roll.id }) },
    );
    expect(tooHigh.status).toBe(400);
    expect(await tooHigh.json()).toEqual({
      error: "Remaining grams must be less than or equal to starting grams",
    });

    const lowerStart = await PATCH(
      new Request(`http://localhost/api/filament/${roll.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startingGrams: 500 }),
      }),
      { params: Promise.resolve({ id: roll.id }) },
    );
    expect(lowerStart.status).toBe(400);
  });
});

describe("users API", () => {
  it("allows only the bootstrap admin to create users when auth is enabled", async () => {
    process.env.AUTH_ENABLED = "true";
    process.env.AUTH_BOOTSTRAP_USER = "admin";
    authMock.session = { user: { name: "operator" } };

    const { POST } = await import("@/app/api/users/route");
    const res = await POST(
      new Request("http://localhost/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "newuser", password: "password123" }),
      }),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });
});

describe("queue + timer + maintenance API", () => {
  it("queues models, maintains printer, and runs timer actions", async () => {
    const printers = await import("@/app/api/printers/route");
    const models = await import("@/app/api/models/route");
    const queue = await import("@/app/api/printers/[id]/queue/route");
    const queueItem = await import(
      "@/app/api/printers/[id]/queue/[itemId]/route"
    );
    const maintenance = await import(
      "@/app/api/printers/[id]/maintenance/route"
    );
    const timer = await import("@/app/api/printers/[id]/timer/route");

    const printerRes = await printers.POST(
      new Request("http://localhost/api/printers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "A1" }),
      }),
    );
    const printer = await printerRes.json();

    const form = new FormData();
    form.set("name", "Benchy");
    form.set("description", "test model");
    form.set(
      "file",
      new File(["solid test\nendsolid test\n"], "benchy.stl", {
        type: "application/octet-stream",
      }),
    );
    const modelRes = await models.POST(
      new Request("http://localhost/api/models", {
        method: "POST",
        body: form,
      }),
    );
    expect(modelRes.status).toBe(201);
    const model = await modelRes.json();
    expect(model.files[0].format).toBe("stl");

    const queued = await queue.POST(
      new Request(`http://localhost/api/printers/${printer.id}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: model.id, durationSeconds: 120 }),
      }),
      { params: Promise.resolve({ id: printer.id }) },
    );
    expect(queued.status).toBe(201);
    const item = await queued.json();
    expect(item.position).toBe(0);
    expect(item.status).toBe("printing");

    const timerState = await timer.GET(
      new Request(`http://localhost/api/printers/${printer.id}/timer`),
      { params: Promise.resolve({ id: printer.id }) },
    );
    const runningFromPrint = await timerState.json();
    expect(runningFromPrint.status).toBe("running");
    expect(runningFromPrint.linkedQueueItemId).toBe(item.id);
    expect(runningFromPrint.remainingSeconds).toBeGreaterThan(0);

    const cleaned = await maintenance.PATCH(
      new Request(`http://localhost/api/printers/${printer.id}/maintenance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markCleaned: true }),
      }),
      { params: Promise.resolve({ id: printer.id }) },
    );
    expect(cleaned.status).toBe(200);
    expect((await cleaned.json()).lastCleanedAt).toBeTruthy();

    const paused = await timer.PATCH(
      new Request(`http://localhost/api/printers/${printer.id}/timer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause" }),
      }),
      { params: Promise.resolve({ id: printer.id }) },
    );
    expect((await paused.json()).status).toBe("paused");

    const second = await queue.POST(
      new Request(`http://localhost/api/printers/${printer.id}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: model.id }),
      }),
      { params: Promise.resolve({ id: printer.id }) },
    );
    expect(second.status).toBe(201);
    const queuedItem = await second.json();
    expect(queuedItem.status).toBe("queued");
    expect(queuedItem.position).toBe(1);

    const removed = await queueItem.DELETE(
      new Request(
        `http://localhost/api/printers/${printer.id}/queue/${item.id}`,
        { method: "DELETE" },
      ),
      {
        params: Promise.resolve({ id: printer.id, itemId: item.id }),
      },
    );
    expect(removed.status).toBe(200);

    const remaining = await queue.GET(
      new Request(`http://localhost/api/printers/${printer.id}/queue`),
      { params: Promise.resolve({ id: printer.id }) },
    );
    const remainingItems = await remaining.json();
    expect(remainingItems).toHaveLength(1);
    expect(remainingItems[0].id).toBe(queuedItem.id);

    const startedNext = await queueItem.PATCH(
      new Request(
        `http://localhost/api/printers/${printer.id}/queue/${queuedItem.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start", durationSeconds: 60 }),
        },
      ),
      {
        params: Promise.resolve({ id: printer.id, itemId: queuedItem.id }),
      },
    );
    expect(startedNext.status).toBe(200);
    expect((await startedNext.json()).status).toBe("printing");
  });

  it("requires duration when starting a print with an empty active slot", async () => {
    const { prisma } = await import("@/lib/db");
    const printers = await import("@/app/api/printers/route");
    const queue = await import("@/app/api/printers/[id]/queue/route");

    const printerRes = await printers.POST(
      new Request("http://localhost/api/printers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Needs duration" }),
      }),
    );
    const printer = await printerRes.json();
    const model = await prisma.model.create({ data: { name: "Timed model" } });

    const missing = await queue.POST(
      new Request(`http://localhost/api/printers/${printer.id}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: model.id }),
      }),
      { params: Promise.resolve({ id: printer.id }) },
    );
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({
      error: "Duration is required to start a print",
    });
  });

  it("reports elapsed timers as completed on GET without mutating storage", async () => {
    const { prisma } = await import("@/lib/db");
    const timer = await import("@/app/api/printers/[id]/timer/route");
    const printer = await prisma.printer.create({
      data: {
        name: "Timer test",
        timer: {
          create: {
            status: "running",
            durationSeconds: 1,
            startedAt: new Date(Date.now() - 10_000),
            pausedRemaining: 0,
          },
        },
      },
    });

    const res = await timer.GET(
      new Request(`http://localhost/api/printers/${printer.id}/timer`),
      { params: Promise.resolve({ id: printer.id }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("completed");
    expect(body.remainingSeconds).toBe(0);
    expect(body.pausedRemaining).toBeNull();

    const stored = await prisma.printTimer.findUnique({
      where: { printerId: printer.id },
    });
    expect(stored?.status).toBe("running");
    expect(stored?.pausedRemaining).toBe(0);
  });

  it("validates linked queue items and clears links when deleting queue items", async () => {
    const { prisma } = await import("@/lib/db");
    const timer = await import("@/app/api/printers/[id]/timer/route");
    const queueItem = await import(
      "@/app/api/printers/[id]/queue/[itemId]/route"
    );
    const model = await prisma.model.create({ data: { name: "Linked model" } });
    const printer = await prisma.printer.create({
      data: { name: "Linked printer", timer: { create: {} } },
    });
    const otherPrinter = await prisma.printer.create({
      data: { name: "Other printer", timer: { create: {} } },
    });
    const item = await prisma.printQueueItem.create({
      data: { printerId: printer.id, modelId: model.id, position: 0 },
    });
    const otherItem = await prisma.printQueueItem.create({
      data: { printerId: otherPrinter.id, modelId: model.id, position: 0 },
    });

    const invalidLink = await timer.PATCH(
      new Request(`http://localhost/api/printers/${printer.id}/timer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set",
          durationSeconds: 60,
          linkedQueueItemId: otherItem.id,
        }),
      }),
      { params: Promise.resolve({ id: printer.id }) },
    );
    expect(invalidLink.status).toBe(400);

    const linked = await timer.PATCH(
      new Request(`http://localhost/api/printers/${printer.id}/timer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set",
          durationSeconds: 60,
          linkedQueueItemId: item.id,
        }),
      }),
      { params: Promise.resolve({ id: printer.id }) },
    );
    expect(linked.status).toBe(200);
    expect((await linked.json()).linkedQueueItemId).toBe(item.id);

    const removed = await queueItem.DELETE(
      new Request(
        `http://localhost/api/printers/${printer.id}/queue/${item.id}`,
        { method: "DELETE" },
      ),
      { params: Promise.resolve({ id: printer.id, itemId: item.id }) },
    );
    expect(removed.status).toBe(200);

    const stored = await prisma.printTimer.findUnique({
      where: { printerId: printer.id },
    });
    expect(stored?.linkedQueueItemId).toBeNull();
  });

  it("requires queue reorder ids to be an exact permutation", async () => {
    const { prisma } = await import("@/lib/db");
    const queue = await import("@/app/api/printers/[id]/queue/route");
    const model = await prisma.model.create({ data: { name: "Reorder model" } });
    const printer = await prisma.printer.create({ data: { name: "Queue" } });
    const first = await prisma.printQueueItem.create({
      data: { printerId: printer.id, modelId: model.id, position: 0 },
    });
    const second = await prisma.printQueueItem.create({
      data: { printerId: printer.id, modelId: model.id, position: 1 },
    });

    const missing = await queue.PUT(
      new Request(`http://localhost/api/printers/${printer.id}/queue`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: [second.id] }),
      }),
      { params: Promise.resolve({ id: printer.id }) },
    );
    expect(missing.status).toBe(400);

    const duplicate = await queue.PUT(
      new Request(`http://localhost/api/printers/${printer.id}/queue`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: [second.id, second.id] }),
      }),
      { params: Promise.resolve({ id: printer.id }) },
    );
    expect(duplicate.status).toBe(400);

    const reordered = await queue.PUT(
      new Request(`http://localhost/api/printers/${printer.id}/queue`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: [second.id, first.id] }),
      }),
      { params: Promise.resolve({ id: printer.id }) },
    );
    expect(reordered.status).toBe(200);
    const body = await reordered.json();
    expect(body.map((item: { id: string; position: number }) => item.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(body.map((item: { position: number }) => item.position)).toEqual([0, 1]);
  });

  it("rejects disallowed model uploads", async () => {
    const models = await import("@/app/api/models/route");
    const form = new FormData();
    form.set("name", "Evil");
    form.set(
      "file",
      new File(["#!/bin/sh"], "payload.sh", { type: "text/plain" }),
    );
    const res = await models.POST(
      new Request("http://localhost/api/models", {
        method: "POST",
        body: form,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Unsupported file type/);
  });

  it("rejects model names over 200 characters", async () => {
    const models = await import("@/app/api/models/route");
    const form = new FormData();
    form.set("name", "x".repeat(201));
    form.set(
      "file",
      new File(["solid test\nendsolid test\n"], "benchy.stl", {
        type: "application/octet-stream",
      }),
    );

    const res = await models.POST(
      new Request("http://localhost/api/models", {
        method: "POST",
        body: form,
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Name must be at most 200 characters",
    });
  });
});

describe("health API", () => {
  it("returns ok", async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.app).toBe("3D Master");
  });

  it("ready checks the database", async () => {
    const { GET } = await import("@/app/api/health/ready/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: true });
  });
});
