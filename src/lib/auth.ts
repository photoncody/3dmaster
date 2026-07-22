import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { assertAuthConfig, config } from "./config";
import { ensureBootstrapUser, prisma } from "./db";

assertAuthConfig();

const DUMMY_HASH =
  "$2b$10$w3FpYmXEF6VrAVYxIXPuPe.Vi8pD7enbU3timaDHzZjhwzZDGsQlq";

function groupsFromProfile(profile: Record<string, unknown>): string[] {
  const claim = config.oidc.groupClaim;
  const raw = profile[claim];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return raw.split(/[,\s]+/).filter(Boolean);
    }
  }
  return [];
}

function isInAllowedGroup(groups: string[]): boolean {
  if (config.oidc.allowedGroups.length === 0) {
    return config.oidcAllowAllGroups;
  }
  return groups.some((g) => config.oidc.allowedGroups.includes(g));
}

const providers: Provider[] = [];

if (config.credentialsEnabled) {
  providers.push(
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = z
          .object({
            username: z.string().min(1),
            password: z.string().min(1),
          })
          .safeParse(credentials);
        if (!parsed.success) return null;

        await ensureBootstrapUser();
        const user = await prisma.user.findUnique({
          where: { username: parsed.data.username },
        });
        if (!user) {
          await bcrypt.compare(parsed.data.password, DUMMY_HASH);
          return null;
        }
        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, name: user.username };
      },
    }),
  );
}

if (config.oidc.issuer && config.oidc.clientId && config.oidc.clientSecret) {
  providers.push({
    id: "oidc",
    name: "OIDC",
    type: "oidc",
    issuer: config.oidc.issuer,
    clientId: config.oidc.clientId,
    clientSecret: config.oidc.clientSecret,
    authorization: { params: { scope: "openid profile email" } },
    profile(profile) {
      const groups = groupsFromProfile(profile as Record<string, unknown>);
      if (!isInAllowedGroup(groups)) {
        throw new Error("User is not in an allowed group");
      }
      return {
        id: String(profile.sub),
        name:
          (profile.name as string) ||
          (profile.preferred_username as string) ||
          (profile.email as string) ||
          String(profile.sub),
        email: (profile.email as string) || undefined,
      };
    },
  } as Provider);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: config.authSecret,
  trustHost: config.authTrustHost,
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub || "";
        session.user.name = token.name || session.user.name;
      }
      return session;
    },
  },
});

export async function requireAuth() {
  if (!config.authEnabled) return null;
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

export async function requireBootstrapAdmin() {
  const session = await requireAuth();
  if (!config.authEnabled) return session;

  const bootstrapUser = config.bootstrap.username;
  if (!bootstrapUser || session?.user?.name !== bootstrapUser) {
    throw new Error("Forbidden");
  }
  return session;
}

export function oidcConfigured(): boolean {
  return Boolean(
    config.oidc.issuer && config.oidc.clientId && config.oidc.clientSecret,
  );
}
