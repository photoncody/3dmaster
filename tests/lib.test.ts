import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getExtension,
  isAllowedModelFile,
  resolveModelStoragePath,
  sanitizeFilename,
} from "@/lib/storage";
import { resetRateLimitStore, rateLimit, clientIpFromRequest } from "@/lib/rate-limit";
import { remainingSeconds, isTimerFinished } from "@/lib/timer";
import { filamentLabel } from "@/lib/filament-label";
import {
  clearSlicerAdapters,
  listSlicerAdapters,
  registerSlicerAdapter,
} from "@/features/models/slicer-handoff";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { ZodError, z } from "zod";

describe("filamentLabel", () => {
  it("joins manufacturer, material, and color", () => {
    expect(
      filamentLabel({
        manufacturer: "Generic",
        material: "PLA",
        color: "Black",
      }),
    ).toBe("Generic · PLA · Black");
  });

  it("falls back when nothing is provided", () => {
    expect(filamentLabel({})).toBe("Filament");
  });
});

describe("sanitizeFilename", () => {
  it("strips path segments and unsafe characters", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("cool model (v2).stl")).toBe("cool model (v2).stl");
    expect(sanitizeFilename("weird<>name?.3mf")).toBe("weird_name_.3mf");
  });

  it("falls back when nothing safe remains", () => {
    expect(sanitizeFilename("???")).toBe("model.bin");
  });
});

describe("model file allowlist", () => {
  it("accepts known extensions case-insensitively", () => {
    expect(getExtension("Part.STL")).toBe(".stl");
    expect(isAllowedModelFile("benchy.3mf")).toBe(true);
    expect(isAllowedModelFile("tool.gcode")).toBe(true);
    expect(isAllowedModelFile("notes.txt")).toBe(false);
    expect(isAllowedModelFile("payload.exe")).toBe(false);
  });
});

describe("resolveModelStoragePath", () => {
  it("blocks path traversal", () => {
    expect(() => resolveModelStoragePath("../secrets.txt")).toThrow(
      /Path traversal blocked/,
    );
    expect(() => resolveModelStoragePath("model-id/ok.stl")).not.toThrow();
  });
});

describe("rateLimit", () => {
  afterEach(() => {
    resetRateLimitStore();
  });

  it("allows requests under the limit and blocks after", () => {
    expect(rateLimit("ip:1", 2, 60_000).ok).toBe(true);
    expect(rateLimit("ip:1", 2, 60_000).ok).toBe(true);
    expect(rateLimit("ip:1", 2, 60_000).ok).toBe(false);
  });

  it("isolates keys", () => {
    rateLimit("a", 1, 60_000);
    expect(rateLimit("a", 1, 60_000).ok).toBe(false);
    expect(rateLimit("b", 1, 60_000).ok).toBe(true);
  });

  it("ignores forwarded IPs unless TRUST_PROXY is enabled", () => {
    const previous = process.env.TRUST_PROXY;
    try {
      delete process.env.TRUST_PROXY;
      const req = new Request("http://localhost", {
        headers: {
          "x-forwarded-for": "203.0.113.9",
          "x-real-ip": "198.51.100.7",
        },
      });
      expect(clientIpFromRequest(req)).toBe("direct");

      process.env.TRUST_PROXY = "true";
      expect(clientIpFromRequest(req)).toBe("203.0.113.9");
    } finally {
      if (previous === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = previous;
    }
  });

  it("prunes expired entries on later checks", () => {
    vi.useFakeTimers();
    let deleteSpy: ReturnType<typeof vi.spyOn> | undefined;
    try {
      vi.setSystemTime(0);
      rateLimit("expired", 1, 100);
      vi.setSystemTime(101);
      deleteSpy = vi.spyOn(Map.prototype, "delete");

      rateLimit("fresh", 1, 100);

      expect(deleteSpy).toHaveBeenCalledWith("expired");
    } finally {
      deleteSpy?.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe("remainingSeconds", () => {
  const now = new Date("2026-07-21T12:00:00Z").getTime();

  it("returns paused remaining", () => {
    expect(
      remainingSeconds(
        {
          status: "paused",
          pausedRemaining: 42,
          durationSeconds: 100,
          startedAt: null,
        },
        now,
      ),
    ).toBe(42);
  });

  it("counts down while running", () => {
    expect(
      remainingSeconds(
        {
          status: "running",
          pausedRemaining: null,
          durationSeconds: 100,
          startedAt: new Date(now - 40_000),
        },
        now,
      ),
    ).toBe(60);
  });

  it("clamps finished timers at zero and marks finished", () => {
    const timer = {
      status: "running",
      pausedRemaining: null,
      durationSeconds: 10,
      startedAt: new Date(now - 20_000),
    };
    expect(remainingSeconds(timer, now)).toBe(0);
    expect(isTimerFinished(timer, now)).toBe(true);
  });

  it("returns configured duration when idle", () => {
    expect(
      remainingSeconds(
        {
          status: "idle",
          pausedRemaining: null,
          durationSeconds: 3600,
          startedAt: null,
        },
        now,
      ),
    ).toBe(3600);
  });
});

describe("slicer handoff adapters", () => {
  afterEach(() => {
    clearSlicerAdapters();
  });

  it("lists only adapters that can handle the context", () => {
    registerSlicerAdapter({
      id: "stl-only",
      label: "STL",
      canHandle: (ctx) => ctx.filename.endsWith(".stl"),
      send: async () => undefined,
    });
    registerSlicerAdapter({
      id: "any",
      label: "Any",
      canHandle: () => true,
      send: async () => undefined,
    });

    const stl = listSlicerAdapters({
      modelId: "m1",
      fileId: "f1",
      filename: "part.stl",
      downloadUrl: "/x",
    });
    expect(stl.map((a) => a.id)).toEqual(["stl-only", "any"]);

    const gcode = listSlicerAdapters({
      modelId: "m1",
      fileId: "f1",
      filename: "part.gcode",
      downloadUrl: "/x",
    });
    expect(gcode.map((a) => a.id)).toEqual(["any"]);
  });
});

describe("api helpers", () => {
  it("jsonOk and jsonError set status and body", async () => {
    const ok = jsonOk({ hello: "world" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ hello: "world" });

    const err = jsonError("nope", 422);
    expect(err.status).toBe(422);
    expect(await err.json()).toEqual({ error: "nope" });
  });

  it("handleApiError maps known safe errors", async () => {
    try {
      z.object({ name: z.string() }).parse({});
    } catch (e) {
      const res = handleApiError(e);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
      expect(body.issues.length).toBeGreaterThan(0);
    }

    const unauthorized = handleApiError(new Error("Unauthorized"));
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toEqual({ error: "Unauthorized" });

    const forbidden = handleApiError(new Error("Forbidden"));
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: "Forbidden" });

    const notFound = handleApiError(new Error("Not found"));
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toEqual({ error: "Not found" });

    const traversal = handleApiError(new Error("Path traversal blocked"));
    expect(traversal.status).toBe(400);
    expect(await traversal.json()).toEqual({ error: "Invalid path" });

    expect(new ZodError([])).toBeInstanceOf(ZodError);
  });

  it("handleApiError maps Prisma errors without leaking messages", async () => {
    const unique = handleApiError({ code: "P2002", message: "Unique failed" });
    expect(unique.status).toBe(409);
    expect(await unique.json()).toEqual({ error: "Already exists" });

    const missing = handleApiError({ code: "P2025", message: "Record missing" });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "Not found" });
  });

  it("handleApiError hides unknown error messages", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const generic = handleApiError(new Error("database password leaked"));
      expect(generic.status).toBe(500);
      expect(await generic.json()).toEqual({ error: "Internal server error" });
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
