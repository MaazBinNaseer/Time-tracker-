"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { Play, Square, X } from "lucide-react";
import { formatHM, parseHours } from "@/lib/time";
import type { TimeEntry } from "@/lib/types";
import { ProjectPicker } from "./ProjectPicker";
import { useStore } from "./StoreProvider";

/**
 * One form for every way a session is created or changed:
 *  - "start": pressing play. Leave End empty to start a live timer, or fill it to log time you forgot.
 *  - "stop":  pressing stop. End is set to now so you can correct it before saving.
 *  - "edit":  clicking an existing session.
 *  - "add":   "Add time" for a past session.
 */
export type DialogRequest =
  | { mode: "start"; preset?: { projectId?: string | null; description?: string } }
  | { mode: "stop"; entry: TimeEntry }
  | { mode: "edit"; entry: TimeEntry }
  | { mode: "add" };

const Ctx = createContext<(r: DialogRequest) => void>(() => {});
export const useEntryDialog = () => useContext(Ctx);

export function EntryDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<{ req: DialogRequest; id: number } | null>(null);
  // Stable for the whole app, so components that use it don't re-render needlessly.
  const show = useCallback((req: DialogRequest) => setOpen({ req, id: Date.now() }), []);
  return (
    <Ctx.Provider value={show}>
      {children}
      {/* The key is fixed when the form opens, so each opening starts fresh but typing (which
          re-renders the app, e.g. editing the project code) never resets the form or its focus. */}
      {open && <EntryDialog key={open.id} req={open.req} onClose={() => setOpen(null)} />}
    </Ctx.Provider>
  );
}

// ---- small time helpers for the form (all local time) ----
const pad = (n: number) => String(n).padStart(2, "0");
const toDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const combine = (date: string, time: string) => (date && time ? new Date(`${date}T${time}`) : null);

const minutesToHours = (m: number) => (m / 60).toFixed(2).replace(/\.?0+$/, "");

function EntryDialog({ req, onClose }: { req: DialogRequest; onClose: () => void }) {
  const { projectById, updateProject, startTimer, addEntry, updateEntry, deleteEntries } = useStore();
  const now = new Date();
  const entry = "entry" in req ? req.entry : undefined;
  const preset = req.mode === "start" ? req.preset : undefined;

  const initialStart = entry ? new Date(entry.start) : req.mode === "add" ? new Date(now.getTime() - 3_600_000) : now;
  const initialEnd = req.mode === "stop" || req.mode === "add" ? now : entry?.end ? new Date(entry.end) : null;
  const initialProject = entry?.projectId ?? preset?.projectId ?? null;

  const [projectId, setProjectId] = useState<string | null>(initialProject);
  const [activity, setActivity] = useState(entry?.description ?? preset?.description ?? "");
  const [billable, setBillable] = useState<boolean>(entry?.billable ?? projectById(initialProject)?.billable ?? false);
  const [date, setDate] = useState(toDate(initialStart));
  const [start, setStart] = useState(toTime(initialStart));
  const [end, setEnd] = useState(initialEnd ? toTime(initialEnd) : "");
  const [hours, setHours] = useState(
    initialEnd ? minutesToHours(Math.round((initialEnd.getTime() - initialStart.getTime()) / 60000)) : "",
  );

  const project = projectById(projectId);
  const startD = combine(date, start);

  /** End as a full date: if the end clock time is earlier than the start, it is the next day. */
  const endFor = (endTime: string) => {
    const e = combine(date, endTime);
    if (!e || !startD) return null;
    if (e <= startD) e.setDate(e.getDate() + 1);
    return e;
  };
  const endD = end ? endFor(end) : null;
  const minutes = startD && endD ? Math.round((endD.getTime() - startD.getTime()) / 60000) : null;

  // Keep End and Hours in sync: change one and the other follows.
  const onEnd = (v: string) => {
    setEnd(v);
    const e = v ? endFor(v) : null;
    setHours(e && startD ? minutesToHours(Math.round((e.getTime() - startD.getTime()) / 60000)) : "");
  };
  const onHours = (v: string) => {
    setHours(v);
    const m = parseHours(v);
    if (m !== null && m > 0 && startD) setEnd(toTime(new Date(startD.getTime() + m * 60000)));
    if (!v.trim()) setEnd("");
  };
  const onStart = (v: string) => {
    setStart(v);
    // Keep the end time fixed and recompute how long that was.
    const s = combine(date, v);
    if (s && end) {
      const e = combine(date, end)!;
      if (e <= s) e.setDate(e.getDate() + 1);
      setHours(minutesToHours(Math.round((e.getTime() - s.getTime()) / 60000)));
    }
  };
  const onProject = (id: string | null) => {
    setProjectId(id);
    const p = projectById(id);
    if (p?.billable !== undefined && !entry) setBillable(p.billable);
  };

  // What pressing the main button will do.
  const live = !end && (req.mode === "start" || (req.mode === "edit" && entry?.end === null));
  let error: string | null = null;
  if (!startD) error = "Pick a date and start time.";
  else if (live && startD > now) error = "A running timer can't start in the future.";
  else if (!live && !endD) error = "Add an end time or the number of hours.";
  else if (!live && minutes !== null && minutes <= 0) error = "End must be after start.";
  else if (hours && parseHours(hours) === null) error = "Hours should look like 4, 4.5 or 4:30.";
  else if (minutes !== null && minutes > 24 * 60) error = "A single session can't be longer than 24 hours.";

  const title = { start: "Start tracking", stop: "Stop timer", edit: "Edit session", add: "Add time" }[req.mode];
  const action =
    req.mode === "start" ? (live ? "Start timer" : "Save entry") : req.mode === "stop" ? "Stop & save" : "Save";

  const save = () => {
    if (error || !startD) return;
    const fields = { projectId, description: activity.trim(), billable };
    if (req.mode === "start" && live) startTimer({ ...fields, start: startD.toISOString() });
    else if (req.mode === "start" || req.mode === "add") addEntry({ ...fields, start: startD.toISOString(), end: endD!.toISOString() });
    else updateEntry(entry!.id, { ...fields, start: startD.toISOString(), end: live ? null : endD!.toISOString() });
    onClose();
  };

  const elapsedLive = live && startD && startD <= now ? now.getTime() - startD.getTime() : 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" onMouseDown={onClose}>
      <form
        className="card w-full max-w-lg p-5 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" className="btn-ghost p-1.5" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
            <Field label="Project">
              <div className="rounded-xl border border-border">
                <ProjectPicker value={projectId} onChange={onProject} wide />
              </div>
            </Field>
            <Field label="Project code">
              <input
                className="input w-full uppercase placeholder:normal-case"
                placeholder={project ? "e.g. ACM-01" : "Pick a project"}
                disabled={!project}
                value={project?.code ?? ""}
                onChange={(e) => project && updateProject(project.id, { code: e.target.value.toUpperCase() || undefined })}
              />
            </Field>
          </div>

          <Field label="Activity">
            <textarea
              className="input min-h-[76px] w-full resize-y"
              placeholder="What are you working on?"
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              autoFocus
            />
          </Field>

          <Field label="Billable">
            <div className="flex w-max rounded-xl border border-border p-1">
              {[true, false].map((v) => (
                <button
                  type="button"
                  key={String(v)}
                  onClick={() => setBillable(v)}
                  className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                    billable === v ? (v ? "bg-emerald-600 text-white" : "bg-surface-2 text-text") : "text-muted hover:text-text"
                  }`}
                >
                  {v ? "Yes" : "No"}
                </button>
              ))}
            </div>
          </Field>

          <div className="rounded-xl bg-surface-2/70 p-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <input type="date" className="input w-full" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Start time">
                <input type="time" className="input w-full" value={start} onChange={(e) => onStart(e.target.value)} />
              </Field>
              <Field label="End time">
                <input type="time" className="input w-full" value={end} onChange={(e) => onEnd(e.target.value)} />
              </Field>
              <Field label="Hours">
                <input className="input tabular w-full" inputMode="decimal" placeholder={live ? "running" : "e.g. 4 or 4:30"} value={hours} onChange={(e) => onHours(e.target.value)} />
              </Field>
            </div>
            <p className="mt-2 text-xs text-muted">
              {live
                ? `Leave End time and Hours empty to keep the timer running${elapsedLive ? ` (${formatHM(elapsedLive)} so far)` : ""}. Fill either one to save a finished session instead.`
                : minutes !== null && minutes > 0
                  ? `${formatHM(minutes * 60000)}${endD && startD && endD.getDate() !== startD.getDate() ? " (ends the next day)" : ""}. Change End time or Hours and the other updates itself.`
                  : "Change End time or Hours and the other updates itself."}
            </p>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <div className="mt-5 flex items-center gap-2">
          {(req.mode === "edit" || req.mode === "stop") && (
            <button
              type="button"
              className="btn-ghost text-danger"
              onClick={() => {
                if (confirm(req.mode === "stop" ? "Discard this timer without saving it?" : "Delete this session?")) {
                  deleteEntries([entry!.id]);
                  onClose();
                }
              }}
            >
              {req.mode === "stop" ? "Discard" : "Delete"}
            </button>
          )}
          <div className="flex-1" />
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className={req.mode === "stop" ? "btn bg-rose-500 text-white hover:bg-rose-600" : "btn-primary"} disabled={!!error}>
            {req.mode === "start" && live && <Play size={14} fill="currentColor" />}
            {req.mode === "stop" && <Square size={12} fill="currentColor" />}
            {action}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-xs font-medium text-muted">
      <div className="mb-1">{label}</div>
      {children}
    </div>
  );
}
