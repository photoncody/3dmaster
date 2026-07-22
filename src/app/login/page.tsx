import { Suspense } from "react";
import { oidcConfigured } from "@/lib/auth";
import { config } from "@/lib/config";
import LoginClient from "./LoginClient";

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <LoginClient
        oidcConfigured={oidcConfigured()}
        credentialsEnabled={config.credentialsEnabled}
      />
    </Suspense>
  );
}
