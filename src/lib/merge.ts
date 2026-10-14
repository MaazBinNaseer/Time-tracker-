// ".ts" so the tests can run this file with plain Node.
import { DEFAULT_WORK_TYPES, type AppData, type Project, type TimeEntry, type WorkType } from "./types.ts";

/**
 * Combining two versions of the same person's data, e.g. when the app is open in two tabs or on
 * two computers and both saved changes. Instead of "last save wins" (which silently throws away
 * the other window's work), every project and session is compared one by one:
 *
 *  - present in only one version  -> kept (it was added there)
 *  - present in both              -> the one changed most recently wins
 *  - deleted in either version    -> stays deleted, unless it was edited again after the delete
 */

const TOMBSTONE_DAYS = 90;

type Item = { id: string; updatedAt?: string };

function mergeList<T extends Item>(a: T[], b: T[], deleted: Record<string, string>): T[] {
  const byId = new Map<string, T>();
  for (const item of [...a, ...b]) {
    const seen = byId.get(item.id);
    if (!seen || (item.updatedAt ?? "") >= (seen.updatedAt ?? "")) byId.set(item.id, item);
  }
  return [...byId.values()].filter((item) => !(deleted[item.id] && deleted[item.id] >= (item.updatedAt ?? "")));
}

export function mergeData(a: AppData, b: AppData, now = new Date()): AppData {
  const deleted: Record<string, string> = { ...(a.deleted ?? {}) };
  for (const [id, at] of Object.entries(b.deleted ?? {})) if (!deleted[id] || at > deleted[id]) deleted[id] = at;

  const projects = mergeList<Project>(a.projects, b.projects, deleted);
  let entries = mergeList<TimeEntry>(a.entries, b.entries, deleted);
  // A side that never edited its type list is still using the starter list.
  const workTypes =
    a.workTypes || b.workTypes
      ? mergeList<WorkType>(a.workTypes ?? DEFAULT_WORK_TYPES, b.workTypes ?? DEFAULT_WORK_TYPES, deleted)
      : undefined;

  // Only one timer may run. If both windows started one, the later start wins and the earlier
  // one is stopped at the moment the later one began.
  const running = entries.filter((e) => e.end === null).sort((x, y) => (x.start < y.start ? 1 : -1));
  if (running.length > 1) {
    const keep = running[0];
    entries = entries
      .map((e) => (e.end === null && e.id !== keep.id ? { ...e, end: keep.start } : e))
      .filter((e) => e.end === null || e.end > e.start);
  }

  const newer = (a.updatedAt ?? "") >= (b.updatedAt ?? "") ? a : b;
  return {
    version: 1,
    projects,
    entries,
    ...(workTypes && { workTypes }),
    deleted: pruneTombstones(deleted, now),
    settings: newer.settings,
    updatedAt: now.toISOString(),
  };
}

export function pruneTombstones(deleted: Record<string, string>, now = new Date()) {
  const cutoff = new Date(now.getTime() - TOMBSTONE_DAYS * 864e5).toISOString();
  return Object.fromEntries(Object.entries(deleted).filter(([, at]) => at >= cutoff));
}

/**
 * After a change, give every added or edited item a fresh `updatedAt` and remember the ids that
 * disappeared. `prev` and `next` share unchanged objects, so `!==` finds exactly what changed.
 */
export function stampChanges(prev: AppData, next: AppData, now = new Date()): AppData {
  const at = now.toISOString();
  const deleted: Record<string, string> = { ...(next.deleted ?? prev.deleted ?? {}) };
  const stamp = <T extends Item>(before: T[], after: T[]) => {
    const old = new Map(before.map((x) => [x.id, x]));
    const ids = new Set(after.map((x) => x.id));
    for (const x of before) if (!ids.has(x.id)) deleted[x.id] = at;
    return after.map((x) => {
      if (deleted[x.id] && old.get(x.id) !== x) delete deleted[x.id]; // re-added (e.g. restored from backup)
      return old.get(x.id) === x ? x : { ...x, updatedAt: at };
    });
  };
  return {
    ...next,
    projects: stamp(prev.projects, next.projects),
    entries: stamp(prev.entries, next.entries),
    // The first edit turns the starter list into your own list; compare against it so removing a
    // starter type is remembered as a delete.
    ...(next.workTypes && { workTypes: stamp(prev.workTypes ?? DEFAULT_WORK_TYPES, next.workTypes) }),
    deleted: pruneTombstones(deleted, now),
    updatedAt: at,
  };
}

/** Cheap check for "do these two versions hold the same projects and sessions?" */
export function sameContent(a: AppData, b: AppData): boolean {
  const sig = (d: AppData) =>
    [...d.projects, ...d.entries, ...(d.workTypes ?? [])].map((x) => `${x.id}@${x.updatedAt ?? ""}`).sort().join("|") +
    "#" + Object.keys(d.deleted ?? {}).sort().join("|") +
    "#" + JSON.stringify(d.settings ?? {});
  return sig(a) === sig(b);
}
