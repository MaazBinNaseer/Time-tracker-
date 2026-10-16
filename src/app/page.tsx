"use client";

import { dayKind } from "@/lib/workdays";
import { toPlain, toSummary } from "@/lib/richtext";
import { useMemo, useState } from "react";
import { ChevronDown, Clock3, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useEntryDialog } from "@/components/EntryDialog";
import { BillableBadge, CodeBadge } from "@/components/ProjectPicker";
import { useNow, useStore } from "@/components/StoreProvider";
import { dayKey, formatClock, formatDayLabel, formatHM, formatTime, parseDayKey, rollupByDay, startOfWeek, type ProjectDay } from "@/lib/time";
import { TypeTag } from "@/components/TypeTag";
import { entryTypeId, NO_PROJECT_COLOR, workTypesOf, type TimeEntry } from "@/lib/types";

const PAGE = 14;

export default function TimerPage() {
  const { data } = useStore();
  const now = useNow();
  const openDialog = useEntryDialog();
  const [shownDays, setShownDays] = useState(PAGE);

  const days = useMemo(() => rollupByDay(data.entries, now), [data.entries, now]);
  const todayMs = days.find((d) => d.day === dayKey(now))?.ms ?? 0;
  const weekStart = dayKey(startOfWeek(now));
  const weekMs = days.filter((d) => d.day >= weekStart).reduce((s, d) => s + d.ms, 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Timer</h1>
          <p className="mt-1 text-sm text-muted">Each project shows once per day. Expand a row to see the individual sessions.</p>
        </div>
        <div className="flex items-center gap-3">
          <Stat label="Today" value={formatHM(todayMs)} />
          <Stat label="This week" value={formatHM(weekMs)} />
          <button className="btn-primary" onClick={() => openDialog({ mode: "add" })}><Plus size={16} /> Add time</button>
        </div>
      </div>

      {days.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-5">
          {days.slice(0, shownDays).map((d) => (
            <section key={d.day} className="card overflow-hidden">
              <header className="flex items-center justify-between border-b border-border bg-surface-2/60 px-4 py-2.5 text-sm">
                <span className="flex items-center gap-2 font-semibold">
                  {formatDayLabel(d.day, now)}
                  <DayOffTag day={d.day} />
                </span>
                <span className="text-muted">
                  Total <span className="tabular ml-1 font-semibold text-text">{formatHM(d.ms)}</span>
                </span>
              </header>
              <ul className="divide-y divide-border">
                {d.projects.map((p) => (
                  <ProjectDayRow key={String(p.projectId)} row={p} onEdit={(entry) => openDialog({ mode: "edit", entry })} />
                ))}
              </ul>
            </section>
          ))}
          {days.length > shownDays && (
            <button className="btn-outline mx-auto flex" onClick={() => setShownDays((n) => n + PAGE)}>Show older days</button>
          )}
        </div>
      )}

    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-1.5 text-right">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="tabular text-sm font-semibold">{value}</div>
    </div>
  );
}

function ProjectDayRow({ row, onEdit }: { row: ProjectDay; onEdit: (e: TimeEntry) => void }) {
  const { data, projectById, deleteEntries } = useStore();
  const types = workTypesOf(data);
  const typeOf = (e: TimeEntry) => types.find((t) => t.id === entryTypeId(e));
  const rowTypes = [...new Set(row.sessions.map((s) => entryTypeId(s.entry)))];
  const openDialog = useEntryDialog();
  const [open, setOpen] = useState(false);
  const project = projectById(row.projectId);
  const color = project?.color ?? NO_PROJECT_COLOR;
  const n = row.sessions.length;
  const desc = row.descriptions.length ? row.descriptions.slice(0, 2).map(toSummary).join(", ") + (row.descriptions.length > 2 ? ` +${row.descriptions.length - 2}` : "") : "";

  return (
    <li>
      <div className="group flex items-center gap-3 px-4 py-3">
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={open}>
          <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: color }} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium" style={{ color: project ? color : undefined }}>
                {project?.name ?? "No project"}
              </span>
              <CodeBadge code={project?.code} />
              {rowTypes.map((id) => <span key={id} className="hidden sm:inline-flex"><TypeTag type={types.find((t) => t.id === id)} /></span>)}
              {row.billableMs > 0 && <BillableBadge partial={row.billableMs < row.ms} />}
              {row.running && <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-500">Running</span>}
            </div>
            <div className="truncate text-sm text-muted">{desc || "No description"}</div>
          </div>
          <span className="hidden items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted sm:flex">
            {n} {n === 1 ? "session" : "sessions"}
            <ChevronDown size={14} className={`transition ${open ? "rotate-180" : ""}`} />
          </span>
          <span className="tabular w-20 text-right font-semibold">{formatClock(row.ms)}</span>
        </button>
        <button
          className="btn-ghost p-2 opacity-60 group-hover:opacity-100"
          title="Continue this project"
          onClick={() => openDialog({ mode: "start", preset: { projectId: row.projectId, description: row.sessions[0]?.entry.description ?? "", typeId: row.sessions[0]?.entry.typeId } })}
        >
          <Play size={16} />
        </button>
      </div>
      {open && (
        <ul className="border-t border-border bg-surface-2/40 py-1">
          {row.sessions.map((s) => (
            <li key={s.entry.id + s.day} className="group/s flex items-center gap-3 py-2 pl-8 pr-4 text-sm sm:pl-12">
              <Clock3 size={14} className="shrink-0 text-muted" />
              <span className="tabular shrink-0 whitespace-nowrap text-muted sm:w-40">
                {formatTime(s.start)} – {s.entry.end === null ? "now" : formatTime(s.end)}
              </span>
              <span className="min-w-0 flex-1 truncate" title={toPlain(s.entry.description)}>{toSummary(s.entry.description) || <span className="text-muted">No description</span>}</span>
              <TypeTag type={typeOf(s.entry)} />
              {s.entry.billable && <BillableBadge />}
              <span className="tabular w-16 text-right">{formatHM(s.ms)}</span>
              <button className="btn-ghost p-1.5 opacity-0 group-hover/s:opacity-100 max-md:opacity-100" title="Edit" onClick={() => onEdit(s.entry)}>
                <Pencil size={14} />
              </button>
              {s.entry.end !== null && (
                <button className="btn-ghost p-1.5 opacity-0 hover:text-danger group-hover/s:opacity-100 max-md:opacity-100" title="Delete" onClick={() => deleteEntries([s.entry.id])}>
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function EmptyState() {
  return (
    <div className="card grid place-items-center px-6 py-16 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
        <Clock3 size={26} />
      </div>
      <h2 className="mt-4 text-lg font-semibold">No time tracked yet</h2>
      <p className="mt-1 max-w-sm text-sm text-muted">
        Type what you are working on in the bar above, pick a project, and press the play button. Your sessions will appear here, grouped per project per day.
      </p>
    </div>
  );
}

/** "Holiday: Thanksgiving Day" or "Day off" when time was logged on a non-work day. */
function DayOffTag({ day }: { day: string }) {
  const { data } = useStore();
  const off = dayKind(parseDayKey(day), data.settings);
  if (off.kind === "work") return null;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${off.kind === "holiday" ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted"}`}>
      {off.kind === "holiday" ? `Holiday: ${off.name}` : "Day off"}
    </span>
  );
}
