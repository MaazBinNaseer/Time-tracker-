"use client";

import { Fragment, useMemo, useState } from "react";
import { Check, ChevronDown, Pencil, X } from "lucide-react";
import { Kpi } from "@/components/Kpi";
import { CodeBadge, ProjectDot } from "@/components/ProjectPicker";
import { uid, useNow, useStore } from "@/components/StoreProvider";
import { addDays, dayKey, formatHM, parseDayKey, parseHours, rangeStats, toSegments } from "@/lib/time";
import { setCellTotal } from "@/lib/timesheet";
import { NO_PROJECT_COLOR } from "@/lib/types";

/** h:mm for compact grid cells, e.g. 5400000 -> "1:30". */
const cell = (ms: number) => {
  const m = Math.round(ms / 60000);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

/** Timesheet: projects as rows, Mon to Sun as columns. `from` is the Monday. */
export function WeekView({ from }: { from: Date }) {
  const { data, projectById, replaceData } = useStore();
  const now = useNow(30_000);
  const [open, setOpen] = useState<string | null>(null);
  // Edit mode: every cell becomes a box you can type hours into ("4", "4.5" or "4:30").
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<string[]>([]); // projects added to the grid while editing
  const [focusCell, setFocusCell] = useState<string | null>(null);

  const view = useMemo(() => {
    const to = addDays(from, 7);
    const stats = rangeStats(data.entries, from, to, now);
    const prev = rangeStats(data.entries, addDays(from, -7), from, now);

    // What you did on each project this week: descriptions summed across sessions.
    const tasks = new Map<string, Map<string, number>>();
    const fromKey = dayKey(from);
    const toKey = dayKey(to);
    for (const seg of toSegments(data.entries, now)) {
      if (seg.day < fromKey || seg.day >= toKey) continue;
      const pk = seg.entry.projectId ?? "none";
      const desc = seg.entry.description.trim() || "No description";
      let m = tasks.get(pk);
      if (!m) tasks.set(pk, (m = new Map()));
      m.set(desc, (m.get(desc) ?? 0) + seg.ms);
    }

    const running = new Set<string>();
    for (const seg of toSegments(data.entries, now))
      if (seg.entry.end === null && seg.day >= fromKey && seg.day < toKey) running.add(`${seg.entry.projectId ?? "none"}|${seg.day}`);
    const listed = [...stats.byProject.entries()].sort((a, b) => b[1] - a[1]);
    for (const k of extra) {
      const id = k === "none" ? null : k;
      if (!stats.byProject.has(id)) listed.push([id, 0]);
    }
    const rows = listed
      .map(([id, ms]) => {
        const p = projectById(id);
        const key = id ?? "none";
        return {
          key,
          name: p?.name ?? "No project",
          client: p?.client,
          code: p?.code,
          color: p?.color ?? NO_PROJECT_COLOR,
          ms,
          perDay: stats.days.map((d) => stats.byDay.get(d)?.get(id) ?? 0),
          tasks: [...(tasks.get(key) ?? new Map()).entries()].sort((a, b) => b[1] - a[1]),
        };
      });
    const dayTotals = stats.days.map((d) => [...(stats.byDay.get(d)?.values() ?? [])].reduce((s, v) => s + v, 0));
    const maxCell = Math.max(1, ...rows.flatMap((r) => r.perDay));
    const busiest = dayTotals.reduce((best, v, i) => (v > dayTotals[best] ? i : best), 0);
    return { to, stats, prevTotal: prev.total, rows, dayTotals, maxCell, busiest, running };
  }, [data.entries, from, now, projectById, extra]);

  const { stats, rows, dayTotals, maxCell, busiest, prevTotal, running } = view;

  // ---- editing ----
  const cellKey = (row: string, day: string) => `${row}|${day}`;
  const shown = (row: string, day: string, ms: number) => draft[cellKey(row, day)] ?? (ms > 0 ? cell(ms) : "");
  /** Minutes typed in a box, or null if it can't be read. Empty means zero. */
  const typed = (text: string) => (text.trim() === "" ? 0 : parseHours(text));
  const bad = (text: string) => {
    const m = typed(text);
    return m === null || m > 24 * 60;
  };
  const changed = rows.flatMap((r) =>
    stats.days
      .map((day, i) => ({ r, day, before: r.perDay[i], text: draft[cellKey(r.key, day)] }))
      .filter((c) => c.text !== undefined && c.text !== (c.before > 0 ? cell(c.before) : "")),
  );
  const invalid = changed.some((c) => bad(c.text!));
  const startEditing = (focus?: string) => {
    setEditing(true);
    setFocusCell(focus ?? null);
  };
  const cancel = () => {
    setEditing(false);
    setDraft({});
    setExtra([]);
  };
  const save = () => {
    if (invalid) return;
    let entries = data.entries;
    for (const c of changed) {
      const projectId = c.r.key === "none" ? null : c.r.key;
      entries = setCellTotal(entries, projectId, c.day, typed(c.text!)! * 60000, new Date(), (f) => ({
        ...f,
        id: uid(),
        billable: f.billable ?? projectById(projectId)?.billable ?? false,
      }));
    }
    if (entries !== data.entries) replaceData({ ...data, entries });
    cancel();
  };
  const liveDayTotal = (i: number) =>
    rows.reduce((sum, r) => {
      const text = draft[cellKey(r.key, stats.days[i])];
      if (text === undefined || bad(text)) return sum + r.perDay[i];
      return sum + typed(text)! * 60000;
    }, 0);
  const liveRowTotal = (r: (typeof rows)[number]) =>
    stats.days.reduce((sum, day, i) => {
      const text = draft[cellKey(r.key, day)];
      return sum + (text === undefined || bad(text) ? r.perDay[i] : typed(text)! * 60000);
    }, 0);
  const addable = data.projects.filter((p) => !p.archived && !rows.some((r) => r.key === p.id));
  const todayKey = dayKey(now);
  const last = addDays(from, 6);
  const sameMonth = from.getMonth() === last.getMonth();
  const title = `${from.toLocaleDateString([], { day: "numeric", month: "short" })} – ${sameMonth ? last.getDate() : last.toLocaleDateString([], { day: "numeric", month: "short" })}, ${last.getFullYear()}`;
  const change = prevTotal > 0 ? Math.round(((stats.total - prevTotal) / prevTotal) * 100) : null;

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Week total" value={formatHM(stats.total)} hint={title} />
        <Kpi label="Projects worked on" value={String(rows.length)} hint={rows.slice(0, 3).map((r) => r.name).join(", ") || "None yet"} />
        <Kpi label="Busiest day" value={dayTotals[busiest] > 0 ? parseDayKey(stats.days[busiest]).toLocaleDateString([], { weekday: "long" }) : "None"} hint={dayTotals[busiest] > 0 ? formatHM(dayTotals[busiest]) : undefined} />
        <Kpi
          label="vs. previous week"
          value={change === null ? "—" : `${change > 0 ? "+" : ""}${change}%`}
          hint={prevTotal > 0 ? `previous week: ${formatHM(prevTotal)}` : "no data for the week before"}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
        {editing ? (
          <>
            <span className="mr-auto text-sm text-muted">Type hours like 4, 4.5 or 4:30. Leave a box empty for none.</span>
            <select
              className="input py-1.5 text-sm"
              value=""
              onChange={(e) => e.target.value && setExtra((x) => [...x, e.target.value])}
              aria-label="Add a project row"
            >
              <option value="">+ Add a project…</option>
              {!rows.some((r) => r.key === "none") && <option value="none">No project</option>}
              {addable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button className="btn-outline" onClick={cancel}><X size={16} /> Cancel</button>
            <button className="btn-primary" onClick={save} disabled={invalid}><Check size={16} /> Save{changed.length ? ` (${changed.length})` : ""}</button>
          </>
        ) : (
          <button className="btn-outline" onClick={() => startEditing()}><Pencil size={15} /> Edit hours</button>
        )}
      </div>

      <div className="card mt-3 overflow-x-auto">
        {rows.length === 0 && !editing ? (
          <div className="px-6 py-16 text-center text-sm text-muted">Nothing tracked this week.</div>
        ) : (
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/60 text-xs font-medium uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 text-left">Project</th>
                {stats.days.map((d) => (
                  <th key={d} className={`w-[72px] px-1 py-2.5 text-center ${d === todayKey ? "text-accent" : ""}`}>
                    <div>{parseDayKey(d).toLocaleDateString([], { weekday: "short" })}</div>
                    <div className="font-normal normal-case">{parseDayKey(d).getDate()}</div>
                  </th>
                ))}
                <th className="w-[96px] px-4 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.key}>
                  <tr
                    className={`border-b border-border ${editing ? "" : "cursor-pointer hover:bg-surface-2/50"}`}
                    onClick={() => !editing && setOpen((o) => (o === r.key ? null : r.key))}
                    aria-expanded={open === r.key}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <ProjectDot color={r.color} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5"><span className="truncate font-medium">{r.name}</span><CodeBadge code={r.code} /></div>
                          <div className="truncate text-xs text-muted">
                            {r.client ? `${r.client} · ` : ""}
                            {r.tasks.length} {r.tasks.length === 1 ? "task" : "tasks"}
                          </div>
                        </div>
                        <ChevronDown size={14} className={`ml-auto shrink-0 text-muted transition ${open === r.key ? "rotate-180" : ""}`} />
                      </div>
                    </td>
                    {r.perDay.map((ms, i) => (
                      <td
                        key={i}
                        className="px-1 py-2 text-center"
                        onDoubleClick={(e) => {
                          if (editing) return;
                          e.stopPropagation();
                          startEditing(cellKey(r.key, stats.days[i]));
                        }}
                        title={editing ? undefined : "Double-click to edit"}
                      >
                        {editing ? (
                          running.has(cellKey(r.key, stats.days[i])) ? (
                            <span className="tabular inline-block min-w-[52px] text-muted" title="A timer is running here. Stop it to edit this day.">{cell(ms)}</span>
                          ) : (
                            <input
                              className={`input tabular w-[60px] px-1 py-1 text-center ${bad(shown(r.key, stats.days[i], ms)) ? "border-danger ring-1 ring-danger" : ""}`}
                              inputMode="decimal"
                              placeholder="–"
                              aria-label={`${r.name}, ${parseDayKey(stats.days[i]).toLocaleDateString([], { weekday: "long" })}`}
                              value={shown(r.key, stats.days[i], ms)}
                              autoFocus={focusCell === cellKey(r.key, stats.days[i])}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => setDraft((d) => ({ ...d, [cellKey(r.key, stats.days[i])]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") save();
                                if (e.key === "Escape") cancel();
                              }}
                            />
                          )
                        ) : ms > 0 ? (
                          <span
                            className="tabular inline-block min-w-[52px] rounded-lg px-1.5 py-1 font-medium"
                            // Darker tint = more hours, so heavy days stand out at a glance.
                            style={{ background: `color-mix(in srgb, ${r.color} ${Math.round(12 + (ms / maxCell) * 38)}%, transparent)` }}
                          >
                            {cell(ms)}
                          </span>
                        ) : (
                          <span className="text-muted/50">–</span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right">
                      <div className="tabular font-semibold">{formatHM(editing ? liveRowTotal(r) : r.ms)}</div>
                      <div className="text-xs text-muted">{stats.total ? Math.round((r.ms / stats.total) * 100) : 0}%</div>
                    </td>
                  </tr>
                  {open === r.key && (
                    <tr className="border-b border-border bg-surface-2/40">
                      <td colSpan={9} className="px-4 py-3">
                        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">What you worked on</div>
                        <ul className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
                          {r.tasks.map(([desc, ms]) => (
                            <li key={desc} className="flex items-center gap-3">
                              <span className="min-w-0 flex-1 truncate">{desc}</span>
                              <span className="h-1.5 w-24 shrink-0 rounded-full bg-surface-2">
                                <span className="block h-full rounded-full" style={{ width: `${(ms / r.ms) * 100}%`, background: r.color }} />
                              </span>
                              <span className="tabular w-16 shrink-0 text-right">{formatHM(ms)}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2/60 font-semibold">
                <td className="px-4 py-3">Daily total</td>
                {dayTotals.map((saved, i) => {
                  const ms = editing ? liveDayTotal(i) : saved;
                  return <td key={i} className="tabular px-1 py-3 text-center">{ms > 0 ? cell(ms) : <span className="font-normal text-muted/50">–</span>}</td>;
                })}
                <td className="tabular px-4 py-3 text-right">{formatHM(editing ? stats.days.reduce((s, _, i) => s + liveDayTotal(i), 0) : stats.total)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      <p className="mt-3 text-xs text-muted">Tip: click a project to see the tasks behind its hours. Double-click a time (or press Edit hours) to change it. Cells are hours:minutes; darker means more time.</p>
    </div>
  );
}
