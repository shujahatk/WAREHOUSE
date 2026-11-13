import { mkdir, readFile, writeFile, rename, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { emptyStore, issues, storeSchema, type StoreData } from "./schemas.ts";

const chains = new Map<string, Promise<void>>();

export function storePath(): string {
  return process.env.STOCKFLOW_STORE_PATH?.trim() || path.join(process.cwd(), "data", "warehouse-store.json");
}

async function acquireLock(file: string, timeoutMs = 8000): Promise<() => Promise<void>> {
  const lockDir = `${file}.lock`;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      await mkdir(lockDir);
      return async () => {
        try {
          await rm(lockDir, { recursive: true, force: true });
        } catch {}
      };
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err && err.code === "EEXIST") {
        try {
          const stats = await stat(lockDir);
          if (Date.now() - stats.mtimeMs > 10000) {
            await rm(lockDir, { recursive: true, force: true });
            continue;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 25));
        continue;
      }
      throw err;
    }
  }

  return async () => {
    try {
      await rm(lockDir, { recursive: true, force: true });
    } catch {}
  };
}

export async function readStore(file: string, retries = 3): Promise<StoreData> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const raw = await readFile(file, "utf8");
      const parsed = storeSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) throw new Error(`The warehouse store at ${file} does not match the domain schema. ${issues(parsed.error)}`);
      return parsed.data;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return emptyStore();
      if (attempt < retries && (error instanceof SyntaxError || (error instanceof Error && "code" in error && (error.code === "EBUSY" || error.code === "EPERM")))) {
        await new Promise((r) => setTimeout(r, 40));
        continue;
      }
      throw error;
    }
  }
  return emptyStore();
}

async function writeStore(file: string, store: StoreData): Promise<void> {
  const parsed = storeSchema.safeParse(store);
  if (!parsed.success) throw new Error(`A warehouse change was rejected. ${issues(parsed.error)}`);
  await mkdir(path.dirname(file), { recursive: true });
  const tmpFile = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmpFile, JSON.stringify(parsed.data, null, 2), "utf8");

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await rename(tmpFile, file);
      return;
    } catch (err: unknown) {
      if (attempt < 4 && err && typeof err === "object" && "code" in err && (err.code === "EPERM" || err.code === "EBUSY")) {
        await new Promise((r) => setTimeout(r, 30));
        continue;
      }
      try {
        await writeFile(file, JSON.stringify(parsed.data, null, 2), "utf8");
        await rm(tmpFile, { force: true }).catch(() => undefined);
        return;
      } catch {
        throw err;
      }
    }
  }
}

export async function withStore<T>(file: string, fn: (store: StoreData) => T | Promise<T>): Promise<T> {
  const previous = chains.get(file) ?? Promise.resolve();
  let releaseChain: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    releaseChain = resolve;
  });
  chains.set(
    file,
    previous.then(() => gate),
  );
  await previous;

  let releaseLock: (() => Promise<void>) | null = null;
  try {
    releaseLock = await acquireLock(file);
    const store = await readStore(file);
    const result = await fn(store);
    await writeStore(file, store);
    return result;
  } finally {
    if (releaseLock) {
      await releaseLock().catch(() => undefined);
    }
    releaseChain();
  }
}
