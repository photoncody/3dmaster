import path from "path";
import os from "os";
import fs from "fs";

const dataDir = path.join(os.tmpdir(), `3dmaster-vitest-${process.pid}`);
fs.mkdirSync(path.join(dataDir, "models"), { recursive: true });

process.env.DATA_DIR = dataDir;
// Must match src/lib/db.ts which stores the DB as ${DATA_DIR}/3dmaster.db
process.env.DATABASE_URL = `file:${path.join(dataDir, "3dmaster.db")}`;
process.env.AUTH_ENABLED = "false";
process.env.AUTH_SECRET = "test-secret-at-least-32-characters-long";
process.env.ALLOW_INSECURE_NO_AUTH = "true";
