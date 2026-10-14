import { NextResponse } from "next/server";
import { getBackend, type Backend } from "@/lib/server/backends";
import { requestDataKey as keyFor } from "@/lib/server/auth";
import { cloudDailyBackup, dailyBackup, listBackups, listCloudBackups } from "@/lib/server/backup";
import { mergeData } from "@/lib/merge";
import type { AppData } from "@/lib/types";

export const dynamic = "force-dynamic";

/** A tiny copy of the data's updatedAt, so "has anything changed?" never has to download the data. */
const verKey = (key: string) => `${key}:ver`;

async function store(backend: Backend, key: string, data: AppData) {
  await backend.set(key, data);
  await backend.set(verKey(key), data.updatedAt);
}

export async function GET(req: Request) {
  const backend = getBackend();
  if (backend.kind === "none") return NextResponse.json({ backend: "none" });
  try {
    const key = await keyFor(backend);
    if (!key) return NextResponse.json({ backend: backend.kind, error: "login required" }, { status: 401 });
    const since = new URL(req.url).searchParams.get("since");
    if (since && (await backend.get<string>(verKey(key))) === since) {
      return NextResponse.json({ backend: backend.kind, unchanged: true });
    }
    return NextResponse.json({
      backend: backend.kind,
      data: await backend.get<AppData>(key),
      backups: backend.kind === "file" ? await listBackups() : await listCloudBackups(backend, key),
    });
  } catch (err) {
    return NextResponse.json({ backend: backend.kind, error: String(err) }, { status: 500 });
  }
}

// Saves for the same person run one at a time, so the "has anyone saved since?" check can't race.
const queues = new Map<string, Promise<unknown>>();
function oneAtATime<T>(key: string, job: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).then(job, job);
  queues.set(key, run.catch(() => {}));
  return run;
}

export async function PUT(req: Request) {
  const backend = getBackend();
  if (backend.kind === "none") return NextResponse.json({ error: "no server storage configured" }, { status: 400 });
  const key = await keyFor(backend);
  if (!key) return NextResponse.json({ error: "login required" }, { status: 401 });
  // New clients send { data, base } where base is the version they started from; old ones send the data alone.
  const body = (await req.json()) as { data?: AppData; base?: string | null } & Partial<AppData>;
  const data = (body.data ?? body) as AppData;
  if (!data || !Array.isArray(data.projects) || !Array.isArray(data.entries)) {
    return NextResponse.json({ error: "invalid data" }, { status: 400 });
  }
  // A failed backup must never block saving.
  if (backend.kind === "file") await dailyBackup().catch(() => {});
  else await cloudDailyBackup(backend, key).catch(() => {});

  return oneAtATime(key, async () => {
    // Someone else (another tab or computer) saved since this window last loaded: combine, don't overwrite.
    if ("base" in body) {
      const stored = await backend.get<AppData>(key);
      if (stored && stored.updatedAt !== body.base) {
        const merged = mergeData(stored, data);
        await store(backend, key, merged);
        return NextResponse.json({ ok: true, merged });
      }
    }
    await store(backend, key, data);
    return NextResponse.json({ ok: true });
  });
}
