import { execSync } from "child_process";
import path from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimitStore } from "@/lib/rate-limit";

const authMock = vi.hoisted(() => ({
  session: null as null | { user?: { name?: string | null } },
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: async () => authMock.session,
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
        body: JSON.stringify({ name: "X1C", notes: "bench" }),
      }),
    );
    expect(created.status).toBe(201);
    const printer = await created.json();
    expect(printer.name).toBe("X1C");
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
          name: "PLA Black",
          manufacturer: "Generic",
          startingGrams: 1000,
          remainingGrams: 750,
          rollCount: 2,
          openedFromBag: true,
        }),
      }),
    );
    expect(created.status).toBe(201);
    const roll = await created.json();
    expect(roll.remainingGrams).toBe(750);
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

  it("rejects impossible filament bounds", async () => {
    const { POST } = await import("@/app/api/filament/route");
    const res = await POST(
      new Request("http://localhost/api/filament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "PLA Overfill",
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
    expect(await res.json()).toEqual({
      error: "Only the bootstrap admin can create users",
    });
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
        body: JSON.stringify({ modelId: model.id }),
      }),
      { params: Promise.resolve({ id: printer.id }) },
    );
    expect(queued.status).toBe(201);
    const item = await queued.json();
    expect(item.position).toBe(0);

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

    const started = await timer.PATCH(
      new Request(`http://localhost/api/printers/${printer.id}/timer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", durationSeconds: 120 }),
      }),
      { params: Promise.resolve({ id: printer.id }) },
    );
    expect(started.status).toBe(200);
    const running = await started.json();
    expect(running.status).toBe("running");
    expect(running.remainingSeconds).toBeGreaterThan(0);

    const paused = await timer.PATCH(
      new Request(`http://localhost/api/printers/${printer.id}/timer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause" }),
      }),
      { params: Promise.resolve({ id: printer.id }) },
    );
    expect((await paused.json()).status).toBe("paused");

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
    expect(await remaining.json()).toHaveLength(0);
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
});
