import fs from "fs/promises";
import path from "path";
import { config, modelsDir } from "./config";

export async function ensureDataDirs(): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.mkdir(modelsDir(), { recursive: true });
}

export function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- ()[\]]+/g, "_");
  const cleaned = base.replace(/^[_]+$/, "").slice(0, 200);
  return cleaned || "model.bin";
}

export function getExtension(filename: string): string {
  return path.extname(filename).toLowerCase();
}

export function isAllowedModelFile(filename: string): boolean {
  return (config.allowedModelExtensions as readonly string[]).includes(
    getExtension(filename),
  );
}

export async function writeModelFile(
  modelId: string,
  filename: string,
  data: Buffer,
): Promise<{ storagePath: string; absolutePath: string }> {
  await ensureDataDirs();
  const safe = sanitizeFilename(filename);
  const dir = path.join(modelsDir(), modelId);
  await fs.mkdir(dir, { recursive: true });
  const absolutePath = path.join(dir, safe);
  const resolved = path.resolve(absolutePath);
  if (!resolved.startsWith(path.resolve(dir) + path.sep)) {
    throw new Error("Invalid storage path");
  }
  await fs.writeFile(resolved, data);
  return {
    storagePath: path.join(modelId, safe),
    absolutePath: resolved,
  };
}

export function resolveModelStoragePath(storagePath: string): string {
  const absolute = path.resolve(modelsDir(), storagePath);
  const root = path.resolve(modelsDir());
  if (!absolute.startsWith(root + path.sep) && absolute !== root) {
    throw new Error("Path traversal blocked");
  }
  return absolute;
}

export async function deleteModelDir(modelId: string): Promise<void> {
  const dir = path.resolve(modelsDir(), modelId);
  const root = path.resolve(modelsDir());
  if (!dir.startsWith(root + path.sep)) {
    throw new Error("Path traversal blocked");
  }
  await fs.rm(dir, { recursive: true, force: true });
}
