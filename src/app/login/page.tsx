import { Suspense } from "react";
import { oidcConfigured } from "@/lib/auth";
import LoginClient from "./LoginClient";

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <LoginClient oidcConfigured={oidcConfigured()} />
    </Suspense>
  );
}
