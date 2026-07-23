import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { rateLimit } from "@/lib/rate-limit";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health"];

function envBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function rateLimitIp(request: NextRequest): string {
  const requestIp = (request as NextRequest & { ip?: string }).ip;
  if (requestIp) return requestIp;

  if (envBool(process.env.TRUST_PROXY, false)) {
    return (
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "direct"
    );
  }

  return "direct";
}

export async function middleware(request: NextRequest) {
  const authEnabled = envBool(process.env.AUTH_ENABLED, false);

  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/auth") && request.method === "POST") {
    const limited = rateLimit(`auth:${rateLimitIp(request)}`, 10, 60_000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many login attempts. Try again shortly." },
        { status: 429 },
      );
    }
  }

  if (!authEnabled) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // Signed slicer handoff downloads (Bambu Studio fetches without a browser session).
  const isModelFileDownload =
    /^\/api\/models\/[^/]+\/files\/[^/]+$/.test(pathname) &&
    request.method === "GET" &&
    request.nextUrl.searchParams.has("token");
  if (isModelFileDownload) {
    return NextResponse.next();
  }

  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
