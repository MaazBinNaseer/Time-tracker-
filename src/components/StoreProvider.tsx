"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { detectStorage, logout, type SessionUser, type StorageAdapter } from "@/lib/storage";
import { mergeData, sameContent, stampChanges } from "@/lib/merge";
import { FolderReconnect, LoginScreen } from "./LoginScreen";
import { emptyData, PROJECT_COLORS, type AppData, type Project, type Settings, type TimeEntry, type WorkType } from "@/lib/types";

type SaveState = "idle" | "saving" | "saved" | "error";

interface Store {
  data: AppData;
  ready: boolean;
  adapter: StorageAdapter | null;
  /** Logged-in account, or null when login is off (own computer, browser-only). */
  user: SessionUser | null;
  signOut: () => Promise<void>;
  saveState: SaveState;
  running: TimeEntry | null;
  projectById: (id: string | null) => Project | undefined;
  startTimer: (fields: Pick<TimeEntry, "projectId" | "description" | "billable" | "typeId"> & { start?: string }) => void;
  stopTimer: () => void;
  updateRunning: (patch: Partial<Pick<TimeEntry, "projectId" | "description" | "start" | "billable">>) => void;
  addEntry: (e: Omit<TimeEntry, "id">) => void;
  updateEntry: (id: string, patch: Partial<TimeEntry>) => void;
  deleteEntries: (ids: string[]) => void;
  addProject: (p: Pick<Project, "name"> & Partial<Project>) => Project;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  replaceData: (d: AppData) => void;
  /** Add many projects and sessions in one change (used by the importer). */
  bulkAdd: (projects: Project[], entries: TimeEntry[]) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  /** Replace the list of work types (Settings > Types of work). */
  setWorkTypes: (types: WorkType[]) => void;
}

const Ctx = createContext<Store | null>(null);

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData);
  const [ready, setReady] = useState(false);
  const [adapter, setAdapter] = useState<StorageAdapter | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [login, setLogin] = useState<{ signupOpen: false | "first" | "open" } | null>(null);
  const [reconnect, setReconnect] = useState<{ name: string; reconnect: () => Promise<boolean> } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const dirty = useRef(false);
  const saving = useRef(false);
  const dataRef = useRef(data);
  dataRef.current = data;

  const boot = useCallback(async () => {
    setLoadError(null);
    const found = await detectStorage();
    if (found.status === "login") {
      setLogin({ signupOpen: found.signupOpen });
      return;
    }
    if (found.status === "reconnect") {
      setReconnect(found);
      return;
    }
    setLogin(null);
    setReconnect(null);
    try {
      const loaded = await found.adapter.load();
      setUser(found.user);
      setAdapter(found.adapter);
      setData(loaded);
      setReady(true);
    } catch (err) {
      setLoadError(String(err));
    }
  }, []);

  useEffect(() => {
    boot();
  }, [boot]);

  // Every change marks the data dirty and timestamps what changed; a short debounce batches
  // rapid edits into one save.
  const mutate = useCallback((fn: (d: AppData) => AppData) => {
    dirty.current = true;
    setData((d) => stampChanges(d, fn(d)));
  }, []);

  useEffect(() => {
    if (!ready || !adapter || !dirty.current) return;
    setSaveState("saving");
    const t = setTimeout(() => {
      const sent = data;
      saving.current = true;
      adapter
        .save(sent)
        .then((merged) => {
          setSaveState("saved");
          const untouched = dataRef.current === sent;
          // Another window saved in between: show the combined result (plus anything typed meanwhile).
          if (merged) setData((cur) => (cur === sent ? merged : mergeData(merged, cur)));
          if (untouched) dirty.current = false;
        })
        .catch(() => setSaveState("error"))
        .finally(() => (saving.current = false));
    }, 400);
    return () => clearTimeout(t);
  }, [data, ready, adapter]);

  // Pick up changes made in other tabs or on other computers: when this window gets focus,
  // every minute while it is visible, and when another tab of this browser saves.
  useEffect(() => {
    if (!ready || !adapter) return;
    let busy = false;
    const refresh = async () => {
      if (busy || saving.current || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const remote = adapter.poll ? await adapter.poll() : await adapter.load();
        if (!remote) return; // nothing changed elsewhere
        const cur = dataRef.current;
        if (remote.updatedAt === cur.updatedAt) return;
        if (!dirty.current && sameContent(remote, cur)) return;
        const merged = mergeData(remote, cur);
        if (sameContent(merged, remote)) {
          setData(remote); // nothing new on this side: just take theirs
        } else {
          dirty.current = true; // this window has changes the other side lacks: save the combination
          setData(merged);
        }
      } catch {
        /* offline or signed out: try again later */
      } finally {
        busy = false;
      }
    };
    const onVisible = () => document.visibilityState === "visible" && refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [ready, adapter]);

  const running = useMemo(() => data.entries.find((e) => e.end === null) ?? null, [data.entries]);

  const store = useMemo<Store>(() => {
    const projectById = (id: string | null) => (id ? data.projects.find((p) => p.id === id) : undefined);
    const stopAll = (entries: TimeEntry[]) => {
      const now = new Date().toISOString();
      return entries.map((e) => (e.end === null ? { ...e, end: now } : e));
    };
    return {
      data,
      ready,
      adapter,
      user,
      signOut: async () => {
        await logout(user);
        window.location.reload();
      },
      saveState,
      running,
      projectById,
      startTimer: ({ start, ...fields }) =>
        mutate((d) => ({
          ...d,
          entries: [
            ...stopAll(d.entries),
            { id: uid(), ...fields, start: start ?? new Date().toISOString(), end: null },
          ],
        })),
      stopTimer: () =>
        mutate((d) => ({
          ...d,
          // Drop accidental sub-second clicks instead of saving empty sessions.
          entries: stopAll(d.entries).filter(
            (e) => new Date(e.end!).getTime() - new Date(e.start).getTime() >= 1000,
          ),
        })),
      updateRunning: (patch) =>
        mutate((d) => ({ ...d, entries: d.entries.map((e) => (e.end === null ? { ...e, ...patch } : e)) })),
      addEntry: (e) => mutate((d) => ({ ...d, entries: [...d.entries, { ...e, id: uid() }] })),
      updateEntry: (id, patch) =>
        mutate((d) => ({ ...d, entries: d.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
      deleteEntries: (ids) => mutate((d) => ({ ...d, entries: d.entries.filter((e) => !ids.includes(e.id)) })),
      addProject: (p) => {
        const project: Project = {
          id: uid(),
          color: PROJECT_COLORS[data.projects.length % PROJECT_COLORS.length],
          createdAt: new Date().toISOString(),
          ...p,
        };
        mutate((d) => ({ ...d, projects: [...d.projects, project] }));
        return project;
      },
      updateProject: (id, patch) =>
        mutate((d) => ({ ...d, projects: d.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      deleteProject: (id) =>
        mutate((d) => ({
          ...d,
          projects: d.projects.filter((p) => p.id !== id),
          // Keep the hours; they move to "No project" rather than vanishing.
          entries: d.entries.map((e) => (e.projectId === id ? { ...e, projectId: null } : e)),
        })),
      replaceData: (next) => mutate(() => next),
      bulkAdd: (projects, entries) =>
        mutate((d) => {
          // Projects with an id we already have are updates (e.g. a code filled in by an import).
          const byId = new Map(projects.map((p) => [p.id, p]));
          const updated = d.projects.map((p) => byId.get(p.id) ?? p);
          const added = projects.filter((p) => !d.projects.some((x) => x.id === p.id));
          return { ...d, projects: [...updated, ...added], entries: [...d.entries, ...entries] };
        }),
      updateSettings: (patch) => mutate((d) => ({ ...d, settings: { ...d.settings, ...patch } })),
      setWorkTypes: (workTypes) => mutate((d) => ({ ...d, workTypes })),
    };
  }, [data, ready, adapter, user, saveState, running, mutate]);

  if (reconnect) return <FolderReconnect name={reconnect.name} reconnect={reconnect.reconnect} onDone={boot} />;
  if (login) return <LoginScreen signupOpen={login.signupOpen} onDone={boot} />;
  if (loadError)
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <p className="font-semibold">Could not load your data</p>
          <p className="mt-1 text-sm text-muted">{loadError}</p>
          <button className="btn-primary mt-4" onClick={boot}>Try again</button>
        </div>
      </div>
    );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

/** Re-renders every `interval` ms so running timers tick. */
export function useNow(interval = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}
