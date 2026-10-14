import { emptyData, type AppData } from "../types";
import { folderModeOn, openSavedFolder } from "./folder";

/**
 * The app talks to storage only through this interface, so swapping where
 * data lives (browser, a file on your machine, a cloud database) never
 * touches the UI code.
 */
export interface StorageAdapter {
  kind: "browser" | "file" | "redis" | "folder";
  label: string;
  load(): Promise<AppData>;
  /**
   * Cheap "has anything changed?" check for the once-a-minute refresh: the new data, or null when
   * nothing changed. Adapters without it are simply re-loaded.
   */
  poll?(): Promise<AppData | null>;
  /** Folder mode: the chosen folder's name. */
  folderName?: string;
  /** Returns a combined version if someone else saved in the meantime, otherwise null. */
  save(data: AppData): Promise<AppData | null>;
  /** Dates of the automatic daily backups, newest first. */
  backups?: string[];
}

export interface SessionUser {
  id: string;
  username: string;
  role: "admin" | "member";
  createdAt?: string;
}

const LS_KEY = "timetrack:data";
// Each account gets its own offline copy, so two people sharing a browser never see each other's data.
const localKey = (user: SessionUser | null) => (user ? `${LS_KEY}:${user.id}` : LS_KEY);

function readLocal(key: string): AppData | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as AppData) : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, data: AppData) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* storage full or blocked: nothing more we can do here */
  }
}

export const browserAdapter: StorageAdapter = {
  kind: "browser",
  label: "This browser (localStorage)",
  async load() {
    return readLocal(LS_KEY) ?? emptyData();
  },
  async save(data) {
    writeLocal(LS_KEY, data);
    return null;
  },
};

function serverAdapter(kind: "file" | "redis", user: SessionUser | null): StorageAdapter {
  const key = localKey(user);
  // The version this window last loaded or saved. Sent with every save so the server can tell
  // whether someone else saved in between (and combine the two instead of overwriting).
  let base: string | null = null;
  const adapter: StorageAdapter = {
    kind,
    label: kind === "file" ? "Local folder on this computer (data/)" : "Cloud database (Upstash Redis)",
    async load() {
      const res = await fetch("/api/data", { cache: "no-store" });
      if (res.status === 401) throw new Error("Your login expired. Reload the page to sign in again.");
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      const body = (await res.json()) as { data: AppData | null; backups?: string[] };
      base = body.data?.updatedAt ?? null;
      adapter.backups = body.backups;
      // First run against an empty server: carry over this account's own browser copy if there is one.
      // With logins on we never borrow the shared browser copy, or a new user would get someone else's data.
      return body.data ?? readLocal(key) ?? (user ? null : readLocal(LS_KEY)) ?? emptyData();
    },
    async save(data) {
      writeLocal(key, data); // keep an offline copy in the browser too
      const res = await fetch("/api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, base }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      const { merged } = (await res.json()) as { merged?: AppData };
      base = (merged ?? data).updatedAt;
      if (merged) writeLocal(key, merged);
      return merged ?? null;
    },
    async poll() {
      // Only the version stamp travels unless something changed, so an open tab costs almost nothing.
      const res = await fetch(`/api/data?since=${encodeURIComponent(base ?? "")}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      const body = (await res.json()) as { unchanged?: boolean; data?: AppData | null; backups?: string[] };
      if (body.unchanged || !body.data) return null;
      base = body.data.updatedAt;
      adapter.backups = body.backups;
      writeLocal(key, body.data);
      return body.data;
    },
  };
  return adapter;
}

export type DetectResult =
  | { status: "ready"; adapter: StorageAdapter; user: SessionUser | null }
  | { status: "login"; signupOpen: false | "first" | "open" }
  | { status: "reconnect"; name: string; reconnect: () => Promise<boolean> };

/** Ask the server which storage it has and who is logged in; fall back to the browser. */
export async function detectStorage(): Promise<DetectResult> {
  const browser: DetectResult = { status: "ready", adapter: browserAdapter, user: null };
  if (process.env.NEXT_PUBLIC_STORAGE === "browser") return browser;
  // "Use on this computer only" was chosen in this browser: never talk to the server about data.
  if (folderModeOn()) {
    const found = await openSavedFolder();
    if (found.status === "ready") return { status: "ready", adapter: found.adapter, user: null };
    if (found.status === "reconnect") return found;
    // The browser lost the folder (site data cleared): fall through to the normal choice.
  }
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store" });
    if (!res.ok) return browser;
    const body = (await res.json()) as {
      backend: "file" | "redis" | "none";
      authEnabled: boolean;
      user: SessionUser | null;
      signupOpen?: false | "first" | "open";
    };
    if (body.backend === "none") return browser;
    if (body.authEnabled && !body.user) return { status: "login", signupOpen: body.signupOpen ?? false };
    return { status: "ready", adapter: serverAdapter(body.backend, body.user), user: body.user };
  } catch {
    return browser;
  }
}

// ---- account calls ----------------------------------------------------------------------

async function post(url: string, body?: unknown, method = "POST"): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return null;
    return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Request failed (${res.status})`;
  } catch {
    return "Could not reach the server. Check your connection.";
  }
}

/** Each returns null on success, or an error message to show. */
export const login = (username: string, password: string) => post("/api/auth/login", { username, password });
export const signup = (username: string, password: string) => post("/api/auth/signup", { username, password });
export const changePassword = (current: string, next: string) => post("/api/auth/password", { current, next });

export async function logout(user: SessionUser | null) {
  await post("/api/auth/logout");
  try {
    if (user) localStorage.removeItem(localKey(user)); // don't leave a copy on shared computers
  } catch {}
}

// ---- admin: manage users ----------------------------------------------------------------

export async function listUsers(): Promise<SessionUser[] | string> {
  try {
    const res = await fetch("/api/auth/users", { cache: "no-store" });
    const body = (await res.json()) as { users?: SessionUser[]; error?: string };
    return res.ok ? body.users ?? [] : body.error ?? `Request failed (${res.status})`;
  } catch {
    return "Could not reach the server.";
  }
}
export const addUser = (username: string, password: string, role: "admin" | "member") =>
  post("/api/auth/users", { username, password, role });
export const resetUserPassword = (username: string, password: string) =>
  post("/api/auth/users", { username, password }, "PATCH");
export const setUserRole = (username: string, role: "admin" | "member") =>
  post("/api/auth/users", { username, role }, "PATCH");
export const removeUser = (username: string) => post("/api/auth/users", { username }, "DELETE");
