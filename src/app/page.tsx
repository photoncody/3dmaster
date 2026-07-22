import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { ensureDataDirs } from "@/lib/storage";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (config.authEnabled) {
    const session = await auth();
    if (!session?.user) redirect("/login");
  }

  await ensureDataDirs();
  const [printerCount, modelCount, filamentCount] = await Promise.all([
    prisma.printer.count(),
    prisma.model.count(),
    prisma.filamentRoll.count(),
  ]);

  return (
    <div>
      {!config.authEnabled ? (
        <div className="banner" role="status">
          Authentication is disabled. Anyone on the network can use this
          instance. Enable it with <code>AUTH_ENABLED=true</code> before
          exposing beyond a trusted LAN.
        </div>
      ) : null}

      <section className="hero">
        <h1>3D Master</h1>
        <p>
          Keep printers, models, filament, and maintenance in one place — queues
          and timers per machine, inventory that stays on your server.
        </p>
      </section>

      <div className="grid-cards">
        <Link href="/printers" className="printer-link">
          <h3>Printers</h3>
          <p className="muted">
            {printerCount} configured · queues, timers, maintenance
          </p>
        </Link>
        <Link href="/models" className="printer-link">
          <h3>Models</h3>
          <p className="muted">{modelCount} in inventory · download for your slicer</p>
        </Link>
        <Link href="/filament" className="printer-link">
          <h3>Filament</h3>
          <p className="muted">
            {filamentCount} rolls tracked · drying reminders
          </p>
        </Link>
      </div>
    </div>
  );
}
