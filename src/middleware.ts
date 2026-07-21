import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health"];

export async function middleware(request: NextRequest) {
  const authEnabled = ["1", "true", "yes", "on"].includes(
    (process.env.AUTH_ENABLED || "false").toLowerCase(),
  );

  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/auth") && request.method === "POST") {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "local";
    const limited = rateLimit(`auth:${ip}`, 30, 60_000);
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

  const sessionToken =
    request.cookies.get("authjs.session-token")?.value ||
    request.cookies.get("__Secure-authjs.session-token")?.value;

  if (!sessionToken) {
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
