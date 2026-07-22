# 3D Master

Web-based organizer for 3D printing workshops. Single Next.js 15 (App Router) service backed by Prisma + SQLite. See `README.md` for the product overview and full config in `.env.example`.

## Cursor Cloud specific instructions

Standard commands live in `package.json` (`dev`, `build`, `start`, `lint`, `test`, `db:migrate`, `db:deploy`) and `README.md`. Notes below cover only non-obvious caveats.

- Single service: the Next.js app on port 3000 (`npm run dev`). No external services required — the database is local SQLite under `data/`, auth is off by default (`AUTH_ENABLED=false`).
- Database path gotcha: at runtime the app derives the SQLite path from `DATA_DIR` (`src/lib/config.ts` → `src/lib/db.ts`), i.e. `file:<DATA_DIR>/3dmaster.db` resolved to an absolute path. The Prisma CLI instead reads `DATABASE_URL` from `.env`, and resolves a relative `file:` URL relative to the `prisma/` schema dir — so `DATABASE_URL=file:./data/3dmaster.db` migrates `prisma/data/3dmaster.db`, NOT the DB the app actually opens. Always run migrations against the runtime path, e.g. `DATABASE_URL="file:$(pwd)/data/3dmaster.db" npx prisma migrate deploy`. The update script already does this.
- If migrations are applied while `npm run dev` is running, restart the dev server — the cached Prisma client keeps the stale connection and pages that hit the DB will 500 until restart.
- `/api/health` does not touch the DB, so a 200 there does not prove the DB is migrated; check a DB-backed page like `/` or `/printers`.
