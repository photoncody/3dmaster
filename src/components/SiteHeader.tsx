"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";

const links = [
  { href: "/", label: "Home" },
  { href: "/printers", label: "Printers" },
  { href: "/models", label: "Models" },
  { href: "/filament", label: "Filament" },
  { href: "/settings", label: "Settings" },
];

export function SiteHeader({
  authEnabled,
  userName,
}: {
  authEnabled: boolean;
  userName?: string | null;
}) {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand">
          <span className="brand-mark">3D Master</span>
          <span className="brand-tag">Print workshop organizer</span>
        </Link>
        <nav className="nav" aria-label="Primary">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              data-active={
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href)
              }
            >
              {link.label}
            </Link>
          ))}
          {authEnabled && userName ? (
            <span className="muted" style={{ padding: "0.45rem 0.5rem" }}>
              {userName}
            </span>
          ) : null}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
