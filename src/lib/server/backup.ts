import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { Backend } from "./backends";

const KEEP_DAYS = 14;
let lastDay: string | null = null;

export const dataDir = () => process.env.DATA_DIR || path.join(process.cwd(), "data");

/**
 * Once a day, before the first save, copy every file in the data folder (accounts and everyone's
 * time) to data/backups/YYYY-MM-DD/. Only the newest 14 days are kept.
 * To restore: stop the app, copy the files from a backup folder back into data/, start it again.
 */
export async function dailyBackup(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (lastDay === day) return;
  const dir = dataDir();
  const target = path.join(dir, "backups", day);
  try {
    await fs.access(target);
    lastDay = day; // already done today (e.g. before a restart)
    return;
  } catch {}
  let files: string[];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    return; // no data folder yet, nothing to back up
  }
  if (files.length === 0) return;
  await fs.mkdir(target, { recursive: true });
  await Promise.all(files.map((f) => fs.copyFile(path.join(dir, f), path.join(target, f))));
  lastDay = day;

  const days = (await fs.readdir(path.join(dir, "backups"))).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  for (const old of days.slice(0, Math.max(0, days.length - KEEP_DAYS))) {
    await fs.rm(path.join(dir, "backups", old), { recursive: true, force: true });
  }
}

export async function listBackups(): Promise<string[]> {
  try {
    return (await fs.readdir(path.join(dataDir(), "backups"))).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
  } catch {
    return [];
  }
}

// ---- cloud database (Upstash) ------------------------------------------------------------

const cloudDone = new Map<string, string>(); // data key -> last day backed up (per server instance)
const today = (now: Date) => now.toISOString().slice(0, 10); // UTC day
const indexKey = (key: string) => `${key}:backups`;
const copyKey = (key: string, day: string) => `${key}:backup:${day}`;

/**
 * Cloud version of the daily backup, one person at a time: before the first save of each day, the
 * data as it was is copied to "<key>:backup:YYYY-MM-DD" in the same database. The newest 14 are kept.
 * Restore by downloading one in Settings, then "Restore from backup".
 */
export async function cloudDailyBackup(backend: Backend, key: string, now = new Date()) {
  const day = today(now);
  if (cloudDone.get(key) === day) return;
  const current = await backend.get(key);
  if (!current) return; // nothing saved yet: try again on the next save
  // "Only if missing" means two servers saving at once still make just one copy per day.
  if (await backend.setIfMissing(copyKey(key, day), current)) {
    const days = [...((await backend.get<string[]>(indexKey(key))) ?? []).filter((d) => d !== day), day].sort();
    const drop = days.slice(0, Math.max(0, days.length - KEEP_DAYS));
    await Promise.all(drop.map((d) => backend.del(copyKey(key, d))));
    await backend.set(indexKey(key), days.slice(drop.length));
  }
  cloudDone.set(key, day);
}

/** Days with a cloud backup for this person, newest first. */
export async function listCloudBackups(backend: Backend, key: string): Promise<string[]> {
  return [...((await backend.get<string[]>(indexKey(key))) ?? [])].reverse();
}

export async function readCloudBackup(backend: Backend, key: string, day: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? backend.get(copyKey(key, day)) : null;
}
