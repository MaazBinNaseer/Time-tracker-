"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, FileUp, Upload } from "lucide-react";
import { BillableBadge, ProjectDot } from "@/components/ProjectPicker";
import { uid, useStore } from "@/components/StoreProvider";
import {
  buildEntries, detectSource, FIELDS, guessDateOrder, guessMapping, parseCsv, planImport,
  type DateOrder, type Field, type Mapping,
} from "@/lib/importer";
import { formatHM, formatTime } from "@/lib/time";
import { NO_PROJECT_COLOR, PROJECT_COLORS, type Project, type TimeEntry } from "@/lib/types";

const HOW_TO = [
  ["Toggl Track", "Reports → Detailed → Export (top right) → Download CSV."],
  ["Jibble", "Timesheets → Export → choose “Time entries list” and file type CSV."],
  ["Clockify", "Reports → Detailed → Export → Save as CSV."],
  ["Excel / Google Sheets", "Save or download the sheet as CSV. It needs a date column and either start + end times, or hours."],
];

export default function ImportPage() {
  const { data, bulkAdd } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; header: string[]; rows: string[][] } | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [order, setOrder] = useState<DateOrder>("ymd");
  const [ambiguous, setAmbiguous] = useState(false);
  const [member, setMember] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ sessions: number; projects: number; ms: number } | null>(null);
  const [showProblems, setShowProblems] = useState(false);

  const read = async (f: File) => {
    setError(null);
    setDone(null);
    if (/\.(xlsx?|numbers)$/i.test(f.name)) {
      setError("That's a spreadsheet file. Please export or save it as CSV (both Toggl and Jibble have a CSV option) and choose that file.");
      return;
    }
    const all = parseCsv(await f.text());
    if (all.length < 2) {
      setError("This file has no rows to import.");
      return;
    }
    const [header, ...rows] = all;
    const m = guessMapping(header, rows);
    const d = guessDateOrder(rows.map((r) => (m.date !== undefined ? r[m.date] : "")));
    setFile({ name: f.name, header, rows });
    setMapping(m);
    setOrder(d.order);
    setAmbiguous(d.ambiguous);
    setMember("");
  };

  const result = useMemo(() => (file ? buildEntries(file.rows, mapping, order, member || undefined) : null), [file, mapping, order, member]);
  const plan = useMemo(() => (result ? planImport(data, result.entries) : null), [data, result]);
  const totalMs = plan?.fresh.reduce((s, e) => s + (e.end.getTime() - e.start.getTime()), 0) ?? 0;
  const isNew = (name: string) => !!name && plan?.newProjects.some((p) => p.name.toLowerCase() === name.toLowerCase());
  const colorFor = (name: string) => {
    if (!name) return NO_PROJECT_COLOR;
    const existing = data.projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.color;
    const i = plan?.newProjects.findIndex((p) => p.name.toLowerCase() === name.toLowerCase()) ?? 0;
    return PROJECT_COLORS[(data.projects.length + i) % PROJECT_COLORS.length];
  };

  const doImport = () => {
    if (!plan) return;
    const now = new Date().toISOString();
    const created: Project[] = plan.newProjects.map((p, i) => ({
      id: uid(),
      name: p.name,
      client: p.client,
      code: p.code?.toUpperCase(),
      color: PROJECT_COLORS[(data.projects.length + i) % PROJECT_COLORS.length],
      createdAt: now,
    }));
    // Fill in a code or client that an existing project is missing, if the file has one.
    const filled: Project[] = [];
    for (const p of data.projects) {
      const hit = plan.fresh.find((e) => e.project.toLowerCase() === p.name.toLowerCase());
      const code = !p.code && hit?.projectCode ? hit.projectCode.toUpperCase() : undefined;
      const client = !p.client && hit?.client ? hit.client : undefined;
      if (code || client) filled.push({ ...p, code: code ?? p.code, client: client ?? p.client });
    }
    const all = [...data.projects, ...created];
    const idFor = (name: string) => (name ? all.find((p) => p.name.toLowerCase() === name.toLowerCase())?.id ?? null : null);
    const entries: TimeEntry[] = plan.fresh.map((e) => ({
      id: uid(),
      projectId: idFor(e.project),
      description: e.description,
      billable: e.billable,
      start: e.start.toISOString(),
      end: e.end.toISOString(),
    }));
    bulkAdd([...filled, ...created], entries);
    setDone({ sessions: entries.length, projects: created.length, ms: totalMs });
    setFile(null);
  };

  const setField = (f: Field, v: string) => setMapping((m) => ({ ...m, [f]: v === "" ? undefined : Number(v) }));
  const clockMode = mapping.entryType !== undefined;

  return (
    <div className="max-w-5xl">
      <Link href="/settings" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text"><ArrowLeft size={14} /> Settings</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Import time from another app</h1>
      <p className="mt-1 text-sm text-muted">
        Bring in your history from Toggl Track, Jibble, Clockify or a spreadsheet. Nothing is saved until you press Import, and
        sessions you already have are skipped, so importing the same file twice is safe.
      </p>

      {done && (
        <div className="card mt-6 flex items-start gap-3 border-emerald-500/40 p-4">
          <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={20} />
          <div className="text-sm">
            <div className="font-semibold">Imported {done.sessions} sessions ({formatHM(done.ms)})</div>
            <div className="text-muted">
              {done.projects ? `${done.projects} new ${done.projects === 1 ? "project was" : "projects were"} created. ` : ""}
              <Link className="text-accent hover:underline" href="/">See them on the Timer page</Link> or{" "}
              <Link className="text-accent hover:underline" href="/calendar">in the Calendar</Link>.
            </div>
          </div>
        </div>
      )}

      {!file && (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_340px]">
          <button
            className="card flex min-h-[220px] flex-col items-center justify-center gap-3 border-2 border-dashed p-8 text-center transition hover:border-accent hover:bg-accent-soft/40"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) read(f);
            }}
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent"><FileUp size={24} /></span>
            <span className="font-semibold">Choose a CSV file, or drop it here</span>
            <span className="text-sm text-muted">The app works out which columns are which. You can check before importing.</span>
          </button>
          <div className="card p-5">
            <h2 className="font-semibold">How to export your data</h2>
            <ul className="mt-3 space-y-3 text-sm">
              {HOW_TO.map(([app, how]) => (
                <li key={app}><span className="font-medium">{app}:</span> <span className="text-muted">{how}</span></li>
              ))}
            </ul>
          </div>
          <input ref={fileRef} type="file" accept=".csv,text/csv,.tsv,.txt" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ""; }} />
        </div>
      )}
      {error && <p className="mt-4 flex items-center gap-2 text-sm text-danger"><AlertCircle size={16} /> {error}</p>}

      {file && result && plan && (
        <>
          <div className="card mt-6 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{file.name}</div>
                <div className="text-sm text-muted">
                  Looks like: <span className="font-medium text-text">{detectSource(file.header)}</span> · {file.rows.length} rows
                  {clockMode && " · clock in / clock out events"}
                </div>
              </div>
              <button className="btn-ghost" onClick={() => setFile(null)}>Choose another file</button>
            </div>

            <h3 className="mt-5 text-sm font-semibold">Which column is which</h3>
            <p className="text-xs text-muted">We guessed these from the column names. Change any that look wrong; the preview below updates as you go.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {FIELDS.map(([f, label]) => (
                <label key={f} className="text-xs font-medium text-muted">
                  {label}
                  <select className="input mt-1 w-full" value={mapping[f] ?? ""} onChange={(e) => setField(f, e.target.value)}>
                    <option value="">(not in this file)</option>
                    {file.header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </label>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-4">
              {(ambiguous || order !== "ymd") && (
                <label className="text-xs font-medium text-muted">
                  Dates are written as
                  <select className="input mt-1 block" value={order} onChange={(e) => setOrder(e.target.value as DateOrder)}>
                    <option value="mdy">Month/Day/Year (10/13/2026)</option>
                    <option value="dmy">Day/Month/Year (13/10/2026)</option>
                    <option value="ymd">Year-Month-Day (2026-10-13)</option>
                  </select>
                  {ambiguous && <span className="mt-1 block text-amber-600">Can&apos;t tell from this file. Please check.</span>}
                </label>
              )}
              {result.members.length > 1 && (
                <label className="text-xs font-medium text-muted">
                  Whose time to import
                  <select className="input mt-1 block" value={member} onChange={(e) => setMember(e.target.value)}>
                    <option value="">Everyone in the file ({result.members.length} people)</option>
                    {result.members.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Sessions to import" value={String(plan.fresh.length)} hint={formatHM(totalMs)} />
            <Stat label="New projects" value={String(plan.newProjects.length)} hint={plan.newProjects.map((p) => p.name).slice(0, 3).join(", ") || "all already exist"} />
            <Stat label="Already in Tempo" value={String(plan.duplicates)} hint="skipped" />
            <Stat label="Rows with problems" value={String(result.problems.length)} hint={result.problems.length ? "see below" : "none"} />
          </div>

          {result.problems.length > 0 && (
            <div className="card mt-4 p-4 text-sm">
              <button className="font-medium text-amber-600" onClick={() => setShowProblems((s) => !s)}>
                {showProblems ? "Hide" : "Show"} the {result.problems.length} rows that will be skipped
              </button>
              {showProblems && (
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-muted">
                  {result.problems.map((p, i) => <li key={i}>Row {p.row}: {p.reason}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="card mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2/60 text-left text-xs font-medium uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5">Date</th><th className="px-2">Time</th><th className="px-2">Project</th>
                  <th className="px-2">Description</th>{result.members.length > 1 && !member && <th className="px-2">Person</th>}
                  <th className="px-4 text-right">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {plan.fresh.slice(0, 25).map((e, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap px-4 py-2">{e.start.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</td>
                    <td className="tabular whitespace-nowrap px-2 text-muted">{formatTime(e.start)} – {formatTime(e.end)}</td>
                    <td className="px-2">
                      <span className="flex items-center gap-1.5">
                        <ProjectDot color={colorFor(e.project)} size={8} />
                        <span className="truncate">{e.project || <span className="text-muted">No project</span>}</span>
                        {isNew(e.project) && <span className="rounded bg-accent-soft px-1 text-[10px] font-semibold text-accent">NEW</span>}
                      </span>
                    </td>
                    <td className="max-w-[260px] truncate px-2">{e.description || <span className="text-muted">–</span>}</td>
                    {result.members.length > 1 && !member && <td className="px-2 text-muted">{e.member}</td>}
                    <td className="tabular px-4 text-right">
                      <span className="inline-flex items-center gap-1.5">{e.billable && <BillableBadge />}{formatHM(e.end.getTime() - e.start.getTime())}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {plan.fresh.length > 25 && <p className="px-4 py-2 text-xs text-muted">…and {plan.fresh.length - 25} more.</p>}
            {plan.fresh.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">Nothing new to import with these settings.</p>}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button className="btn-outline" onClick={() => setFile(null)}>Cancel</button>
            <button className="btn-primary" disabled={plan.fresh.length === 0} onClick={doImport}>
              <Upload size={16} /> Import {plan.fresh.length} sessions
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="tabular mt-1 text-xl font-semibold">{value}</div>
      {hint && <div className="truncate text-xs text-muted">{hint}</div>}
    </div>
  );
}
