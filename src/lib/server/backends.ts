import "server-only";
import { promises as fs } from "fs";
import path from "path";

/**
 * Where the server keeps things. Picked automatically from env vars:
 *  - "redis": Upstash Redis / Vercel KV REST credentials are set (free cloud database, works on Vercel)
 *  - "file":  running on your own machine -> ./data/ (or $DATA_DIR)
 *  - "none":  on Vercel with no database configured -> the browser stores data instead
 *
 * Both real backends are a tiny key-value store: get a JSON value by key, set it, delete it.
 * Accounts, sessions secrets and each person's time data are all just keys.
 */
export interface Backend {
  kind: "redis" | "file" | "none";
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  /** Set only if the key does not exist yet. Returns false if it already existed. */
  setIfMissing(key: string, value: unknown): Promise<boolean>;
  del(key: string): Promise<void>;
}

/** Key prefix, so one database can be shared with other apps. */
export const PREFIX = process.env.STORAGE_KEY || "timetrack:data";

function redisBackend(url: string, token: string): Backend {
  const call = async (cmd: (string | number)[]) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cmd),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Redis error ${res.status}`);
    return (await res.json()) as { result: string | null };
  };
  return {
    kind: "redis",
    async get<T>(key: string) {
      const { result } = await call(["GET", key]);
      return result ? (JSON.parse(result) as T) : null;
    },
    async set(key, value) {
      await call(["SET", key, JSON.stringify(value)]);
    },
    async setIfMissing(key, value) {
      const { result } = await call(["SET", key, JSON.stringify(value), "NX"]);
      return result === "OK";
    },
    async del(key) {
      await call(["DEL", key]);
    },
  };
}

function fileBackend(dir: string): Backend {
  // The original single-user key keeps its old file name, so existing local data still loads.
  const fileFor = (key: string) =>
    path.join(dir, key === PREFIX ? "timetrack.json" : `${key.replace(/[^a-zA-Z0-9_.@-]/g, "_")}.json`);
  const get = async <T,>(key: string): Promise<T | null> => {
    try {
      return JSON.parse(await fs.readFile(fileFor(key), "utf8")) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  };
  const set = async (key: string, value: unknown) => {
    await fs.mkdir(dir, { recursive: true });
    // Write to a temp file then rename, so a crash never leaves half a file.
    const file = fileFor(key);
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value, null, 2));
    await fs.rename(tmp, file);
  };
  return {
    kind: "file",
    get,
    set,
    async setIfMissing(key, value) {
      if ((await get(key)) !== null) return false;
      await set(key, value);
      return true;
    },
    async del(key) {
      await fs.rm(fileFor(key), { force: true });
    },
  };
}

const none: Backend = {
  kind: "none",
  get: async () => null,
  set: async () => {},
  setIfMissing: async () => false,
  del: async () => {},
};

export function getBackend(): Backend {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) return redisBackend(url, token);
  if (!process.env.VERCEL) return fileBackend(process.env.DATA_DIR || path.join(process.cwd(), "data"));
  return none;
}
