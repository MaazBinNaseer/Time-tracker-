"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Cloud, Download, FileInput, FileSpreadsheet, FolderOpen, HardDrive, KeyRound, LogOut, Monitor, Sparkles, Trash2, Upload, UserPlus, Users } from "lucide-react";
import { useStore } from "@/components/StoreProvider";
import { demoData } from "@/lib/demo";
import { addUser, changePassword, listUsers, removeUser, resetUserPassword, setUserRole, type SessionUser } from "@/lib/storage";
import { chooseFolder, folderSupported, leaveFolderMode } from "@/lib/storage/folder";
import { formatHours, rollupByDay } from "@/lib/time";
import { emptyData, type AppData } from "@/lib/types";

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export default function SettingsPage() {
  const { data, adapter, replaceData, projectById, user, signOut, updateSettings } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const stamp = new Date().toISOString().slice(0, 10);

  const exportJson = () => download(`tempo-backup-${stamp}.json`, JSON.stringify(data, null, 2), "application/json");

  const exportCsv = () => {
    // One row per project per day: the same rolled-up view as the timer page.
    const rows = [["Date", "Project", "Code", "Client", "Hours", "Billable hours", "Sessions", "Activities"].map(csvCell).join(",")];
    for (const d of rollupByDay(data.entries.filter((e) => e.end), new Date()).reverse()) {
      for (const p of d.projects) {
        const proj = projectById(p.projectId);
        rows.push([d.day, proj?.name ?? "No project", proj?.code ?? "", proj?.client ?? "", formatHours(p.ms, 2), formatHours(p.billableMs, 2), p.sessions.length, p.descriptions.join("; ")].map(csvCell).join(","));
      }
    }
    download(`tempo-daily-${stamp}.csv`, rows.join("\n"), "text/csv");
  };

  const importJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as AppData;
      if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.entries)) throw new Error("not a Tempo backup");
      if (!confirm(`Replace current data with ${parsed.projects.length} projects and ${parsed.entries.length} sessions from this file?`)) return;
      replaceData({ ...emptyData(), ...parsed, version: 1 });
      setMessage("Backup imported.");
    } catch (err) {
      setMessage(`Could not import: ${(err as Error).message}`);
    }
  };

  const Icon = adapter?.kind === "redis" ? Cloud : adapter?.kind === "folder" ? FolderOpen : adapter?.kind === "file" ? HardDrive : Monitor;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted">Where your data lives, backups, and exports.</p>

      <section className="card mt-6 p-5">
        <h2 className="font-semibold">Storage</h2>
        <div className="mt-3 flex items-start gap-3 rounded-xl bg-surface-2 p-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><Icon size={18} /></span>
          <div className="text-sm">
            <div className="font-medium">{adapter?.label}</div>
            <p className="mt-0.5 text-muted">
              {adapter?.kind === "browser" &&
                "Your data is saved inside this browser only. Export a backup regularly, or connect a cloud database to sync across devices (see README)."}
              {adapter?.kind === "file" &&
                (user
                  ? "Your data is saved as a JSON file in the app's data folder on this computer, separate from every other user's. Back up that folder like any other file."
                  : "Your data is saved as a JSON file in the app's data folder on this computer. Back up that folder like any other file.")}
              {adapter?.kind === "redis" && "Your data is saved in your cloud database under your account, so every device you sign in on sees the same timers."}
              {adapter?.kind === "folder" &&
                "Your data is saved as tempo-data.json in this folder and is never sent to the server. If the folder is inside OneDrive, Google Drive or Dropbox, your other computers see the same data: pick the same synced folder on each one."}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">
          {data.projects.length} projects · {data.entries.length} sessions
        </p>
        {adapter?.kind === "file" && (
          <p className="mt-1 text-xs text-muted">
            Automatic backups: {adapter.backups?.length
              ? `${adapter.backups.length} daily ${adapter.backups.length === 1 ? "copy" : "copies"} in data/backups, newest ${adapter.backups[0]}`
              : "the first daily copy is made the next time you save"}. The last 14 days are kept.
          </p>
        )}
        {adapter?.kind === "redis" && <CloudBackups days={adapter.backups ?? []} />}
        {adapter?.kind === "folder" && (
          <p className="mt-1 text-xs text-muted">
            Automatic backups: {adapter.backups?.length
              ? `${adapter.backups.length} daily ${adapter.backups.length === 1 ? "copy" : "copies"} in ${adapter.folderName}/backups, newest ${adapter.backups[0]}`
              : "the first daily copy is made the next time you save"}. The last 14 days are kept.
          </p>
        )}
        <StorageSwitch kind={adapter?.kind} signedIn={!!user} data={data} />
      </section>

      <section className="card mt-4 p-5">
        <h2 className="font-semibold">Timer reminder</h2>
        <p className="mt-1 text-sm text-muted">Warn me when a timer has been running longer than this, in case I forgot to stop it.</p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="number"
            min={0}
            max={24}
            step={0.5}
            className="input w-24"
            value={data.settings?.longTimerHours ?? 10}
            onChange={(e) => updateSettings({ longTimerHours: Math.max(0, Math.min(24, Number(e.target.value) || 0)) })}
          />
          hours <span className="text-muted">(0 turns the reminder off)</span>
        </label>
      </section>

      {user && <AccountSection username={user.username} onSignOut={signOut} />}
      {user?.role === "admin" && <UsersSection me={user.username} />}

      <section className="card mt-4 p-5">
        <h2 className="font-semibold">Backup, export &amp; import</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-outline" onClick={exportJson}><Download size={16} /> Download backup (JSON)</button>
          <button className="btn-outline" onClick={() => fileRef.current?.click()}><Upload size={16} /> Restore from backup</button>
          <button className="btn-outline" onClick={exportCsv}><FileSpreadsheet size={16} /> Export daily totals (CSV)</button>
          <Link className="btn-outline" href="/import"><FileInput size={16} /> Import from Toggl, Jibble, Clockify…</Link>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        </div>
        {message && <p className="mt-3 text-sm text-muted">{message}</p>}
      </section>

      <section className="card mt-4 p-5">
        <h2 className="font-semibold">Try it out</h2>
        <p className="mt-1 text-sm text-muted">Fill the app with two weeks of sample data to see the dashboard. This replaces your current data.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-outline" onClick={() => confirm("Replace current data with sample data?") && replaceData(demoData())}><Sparkles size={16} /> Load sample data</button>
          <button className="btn-outline text-danger" onClick={() => confirm("Delete ALL projects and time entries? Download a backup first if unsure.") && replaceData(emptyData())}><Trash2 size={16} /> Erase all data</button>
        </div>
      </section>
    </div>
  );
}

function AccountSection({ username, onSignOut }: { username: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = await changePassword(current, next);
    setMsg(err ? { ok: false, text: err } : { ok: true, text: "Password changed. Other devices have been signed out." });
    if (!err) {
      setCurrent("");
      setNext("");
      setOpen(false);
    }
  };

  return (
    <section className="card mt-4 p-5">
      <h2 className="font-semibold">Account</h2>
      <p className="mt-1 text-sm text-muted">Signed in as <span className="font-medium text-text">{username}</span></p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-outline" onClick={() => setOpen((o) => !o)}><KeyRound size={16} /> Change password</button>
        <button className="btn-outline" onClick={onSignOut}><LogOut size={16} /> Sign out</button>
      </div>
      {open && (
        <form className="mt-4 grid max-w-sm gap-2" onSubmit={submit}>
          <input className="input" type="password" placeholder="Current password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          <input className="input" type="password" placeholder="New password (8+ characters)" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
          <button className="btn-primary justify-self-start" type="submit">Save new password</button>
        </form>
      )}
      {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-muted" : "text-danger"}`}>{msg.text}</p>}
    </section>
  );
}

/** Admin only: everyone who can sign in to this Tempo. Each person's time data is separate. */
function UsersSection({ me }: { me: string }) {
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [resetting, setResetting] = useState<string | null>(null);
  const [newPw, setNewPw] = useState("");

  const refresh = useCallback(async () => {
    const r = await listUsers();
    if (typeof r === "string") setMsg({ ok: false, text: r });
    else setUsers(r);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = async (p: Promise<string | null>, ok: string) => {
    const err = await p;
    setMsg(err ? { ok: false, text: err } : { ok: true, text: ok });
    if (!err) await refresh();
    return !err;
  };

  return (
    <section className="card mt-4 p-5">
      <h2 className="flex items-center gap-2 font-semibold"><Users size={18} /> Users</h2>
      <p className="mt-1 text-sm text-muted">
        Everyone listed here can sign in on this app with their own username and password. Each person sees only their own projects and time.
      </p>

      <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
        {users.map((u) => (
          <li key={u.id} className="px-3 py-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{u.username}</span>
              {u.username === me && <span className="text-xs text-muted">(you)</span>}
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${u.role === "admin" ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted"}`}>{u.role}</span>
              <span className="flex-1" />
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { setResetting(resetting === u.username ? null : u.username); setNewPw(""); }}>Reset password</button>
              {u.username !== me && (
                <>
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => run(setUserRole(u.username, u.role === "admin" ? "member" : "admin"), `${u.username} is now ${u.role === "admin" ? "a member" : "an admin"}.`)}>
                    {u.role === "admin" ? "Make member" : "Make admin"}
                  </button>
                  <button
                    className="btn-ghost px-2 py-1 text-xs hover:text-danger"
                    onClick={() => confirm(`Remove ${u.username}? Their projects and tracked time are deleted too.`) && run(removeUser(u.username), `${u.username} was removed.`)}
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
            {resetting === u.username && (
              <form
                className="mt-2 flex flex-wrap gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await run(resetUserPassword(u.username, newPw), `New password set for ${u.username}. Tell them what it is; they can change it in Settings.`)) setResetting(null);
                }}
              >
                <input className="input min-w-0 flex-1" type="text" placeholder="New password (8+ characters)" minLength={8} required value={newPw} onChange={(e) => setNewPw(e.target.value)} autoFocus />
                <button className="btn-primary" type="submit">Set password</button>
              </form>
            )}
          </li>
        ))}
      </ul>

      <form
        className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(addUser(name, pw, role), `Added ${name.trim().toLowerCase()}. They can now sign in with that username and password.`)) {
            setName("");
            setPw("");
            setRole("member");
          }
        }}
      >
        <input className="input" placeholder="Username" autoCapitalize="none" spellCheck={false} required value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" type="text" placeholder="Password (8+ characters)" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} />
        <select className="input" value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")}>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        <button className="btn-primary whitespace-nowrap" type="submit"><UserPlus size={16} /> Add user</button>
      </form>
      {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-muted" : "text-danger"}`}>{msg.text}</p>}
    </section>
  );
}

/** Daily copies kept in the cloud database. Download one, then use "Restore from backup" to go back to it. */
function CloudBackups({ days }: { days: string[] }) {
  const [day, setDay] = useState(days[0] ?? "");
  if (days.length === 0)
    return <p className="mt-1 text-xs text-muted">Automatic backups: the first daily copy is made the next time you save. The last 14 days are kept.</p>;
  return (
    <div className="mt-2 text-xs text-muted">
      <p>
        Automatic backups: {days.length} daily {days.length === 1 ? "copy" : "copies"} in the cloud database, newest {days[0]}. The last 14 days are kept.
        To go back to one, download it, then use <span className="font-medium text-text">Restore from backup</span> below.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select className="input py-1.5 text-sm" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Backup day">
          {days.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <a className="btn-outline" href={`/api/data/backup?day=${day}`} download><Download size={16} /> Download this day</a>
      </div>
    </div>
  );
}

/** Move between "online account" and "a folder on this computer". */
function StorageSwitch({ kind, signedIn, data }: { kind?: string; signedIn: boolean; data: AppData }) {
  const [msg, setMsg] = useState<string | null>(null);
  const pick = async (copy: boolean) => {
    setMsg(null);
    const err = await chooseFolder(copy ? data : undefined);
    if (err) setMsg(err);
    else window.location.reload();
  };
  if (kind === "folder")
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-outline" onClick={() => pick(true)}><FolderOpen size={16} /> Change folder</button>
        <button
          className="btn-outline"
          onClick={() => {
            if (!confirm("Switch this browser back to an online account? Your folder stays as it is, and you can come back to it any time.")) return;
            leaveFolderMode();
            window.location.reload();
          }}
        >
          <Cloud size={16} /> Use an online account instead
        </button>
        {msg && <p className="w-full text-sm text-danger">{msg}</p>}
      </div>
    );
  if (!folderSupported()) return null;
  return (
    <div className="mt-3">
      <button
        className="btn-outline"
        onClick={() =>
          pick(
            confirm(
              signedIn
                ? "Copy your current time into the folder you pick? (Your online account keeps its copy too.) Cancel to start the folder empty, or to use one that already has Tempo data."
                : "Copy your current time into the folder you pick? Cancel to start the folder empty, or to use one that already has Tempo data.",
            ),
          )
        }
      >
        <FolderOpen size={16} /> Keep my data in a folder on this computer instead
      </button>
      {msg && <p className="mt-2 text-sm text-danger">{msg}</p>}
    </div>
  );
}
