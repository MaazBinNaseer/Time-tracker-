"use client";

import { Fragment, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useNow, useStore } from "@/components/StoreProvider";
import { ProjectDot } from "@/components/ProjectPicker";
import { addDays, dayKey, formatHM, formatHours, parseDayKey, rangeStats, startOfDay, startOfWeek, toSegments } from "@/lib/time";
import { entryTypeId, NO_PROJECT_COLOR, workTypesOf, type AppData, type Project } from "@/lib/types";

type RangeKey = "week" | "7d" | "30d" | "month";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
];
const MAX_SERIES = 7; // more projects than this fold into "Other" so colours stay readable
const OTHER = "__other";

function rangeFor(key: RangeKey, now: Date): [Date, Date] {
  const tomorrow = addDays(startOfDay(now), 1);
  switch (key) {
    case "week": {
      const s = startOfWeek(now);
      return [s, addDays(s, 7)];
    }
    case "7d":
      return [addDays(tomorrow, -7), tomorrow];
    case "30d":
      return [addDays(tomorrow, -30), tomorrow];
    case "month":
      return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)];
  }
}

export default function DashboardPage() {
  const { data, projectById } = useStore();
  const now = useNow(30_000);
  const [range, setRange] = useState<RangeKey>("week");

  const view = useMemo(() => {
    const [from, to] = rangeFor(range, now);
    const stats = rangeStats(data.entries, from, to, now);
    const ranked = [...stats.byProject.entries()].sort((a, b) => b[1] - a[1]);
    const series = ranked.slice(0, MAX_SERIES).map(([id, ms]) => {
      const p = projectById(id);
      return { key: id ?? "none", id, name: p?.name ?? "No project", color: p?.color ?? NO_PROJECT_COLOR, ms };
    });
    const rest = ranked.slice(MAX_SERIES);
    if (rest.length) {
      series.push({ key: OTHER, id: null, name: `Other (${rest.length})`, color: "#8b8798", ms: rest.reduce((s, [, ms]) => s + ms, 0) });
    }
    const inSeries = new Set(series.filter((s) => s.key !== OTHER).map((s) => s.key));
    const daily = stats.days.map((day) => {
      const row: Record<string, number | string> = {
        day,
        label: parseDayKey(day).toLocaleDateString([], stats.days.length > 7 ? { day: "numeric", month: "short" } : { weekday: "short", day: "numeric" }),
        total: 0,
      };
      for (const [pid, ms] of stats.byDay.get(day) ?? []) {
        const k = inSeries.has(pid ?? "none") ? pid ?? "none" : OTHER;
        row[k] = ((row[k] as number) ?? 0) + ms / 3_600_000;
        row.total = (row.total as number) + ms;
      }
      return row;
    });
    const activeDays = daily.filter((d) => (d.total as number) > 0).length;
    const hours = stats.byHour.map((ms, h) => ({ h, hours: ms / 3_600_000 }));
    return { stats, series, daily, activeDays, hours, ranked };
  }, [data.entries, range, now, projectById]);

  const { stats, series, daily, activeDays, hours } = view;
  const top = series[0];
  const peak = hours.reduce((a, b) => (b.hours > a.hours ? b : a), hours[0]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Where your time went. Multiple sessions on a project count as one daily total.</p>
        </div>
        <div className="flex rounded-xl border border-border bg-surface p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${range === r.key ? "bg-accent text-white dark:text-[#140f1f]" : "text-muted hover:text-text"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Total tracked" value={formatHM(stats.total)} hint={stats.total ? `${formatHM(stats.billable)} billable (${Math.round((stats.billable / stats.total) * 100)}%)` : undefined} />
        <Kpi label="Daily average" value={formatHM(activeDays ? stats.total / activeDays : 0)} hint={`over ${activeDays} active ${activeDays === 1 ? "day" : "days"}`} />
        <Kpi label="Top project" value={top?.name ?? "None"} hint={top ? `${formatHM(top.ms)} · ${Math.round((top.ms / stats.total) * 100)}%` : undefined} dot={top?.color} />
        <Kpi label="Peak hour" value={peak && peak.hours > 0 ? `${peak.h}:00 – ${peak.h + 1}:00` : "None"} hint="when you track the most" />
      </div>

      {stats.total === 0 ? (
        <div className="card mt-6 px-6 py-16 text-center text-muted">No time tracked in this period yet.</div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="card p-5 lg:col-span-2">
              <ChartHeader title="Hours per day" subtitle="Each bar is a day, split by project" />
              <Legend series={series} />
              <div className="mt-3 h-72">
                <ResponsiveContainer>
                  <BarChart data={daily} margin={{ top: 8, right: 0, left: -18, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} interval="preserveStartEnd" minTickGap={8} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} tickFormatter={(v) => `${v}h`} allowDecimals={false} />
                    <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<DayTooltip series={series} />} />
                    {series.map((s, i) => (
                      <Bar
                        key={s.key}
                        dataKey={s.key}
                        stackId="a"
                        fill={s.color}
                        stroke="var(--surface)"
                        strokeWidth={2}
                        maxBarSize={36}
                        radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card p-5">
              <ChartHeader title="Project split" subtitle="Share of total time" />
              <div className="relative mx-auto mt-2 h-48 w-48">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={series} dataKey="ms" nameKey="name" innerRadius="68%" outerRadius="100%" stroke="var(--surface)" strokeWidth={2} paddingAngle={0} isAnimationActive={false}>
                      {series.map((s) => <Cell key={s.key} fill={s.color} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip total={stats.total} />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div>
                    <div className="tabular text-xl font-semibold">{formatHours(stats.total)}h</div>
                    <div className="text-xs text-muted">total</div>
                  </div>
                </div>
              </div>
              <ul className="mt-4 space-y-2.5">
                {series.map((s) => {
                  const pct = (s.ms / stats.total) * 100;
                  return (
                    <li key={s.key} className="text-sm">
                      <div className="flex items-center gap-2">
                        <ProjectDot color={s.color} />
                        <span className="min-w-0 flex-1 truncate">{s.name}</span>
                        <span className="tabular text-muted">{Math.round(pct)}%</span>
                        <span className="tabular w-16 text-right font-medium">{formatHM(s.ms)}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: s.color }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <TypeHeatmap data={data} days={stats.days} now={now} projects={data.projects} />
            <div className="card p-5">
              <ChartHeader title="Daily totals" subtitle="One line per day, all projects combined" />
              <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto pr-1 text-sm">
                {[...daily].reverse().filter((d) => (d.total as number) > 0).map((d) => (
                  <li key={d.day as string} className="flex justify-between rounded-lg px-2 py-1.5 hover:bg-surface-2">
                    <span className="text-muted">{parseDayKey(d.day as string).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}</span>
                    <span className="tabular font-medium">{formatHM(d.total as number)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, dot }: { label: string; value: string; hint?: string; dot?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1.5 flex items-center gap-2 text-xl font-semibold tracking-tight">
        {dot && <ProjectDot color={dot} size={10} />}
        <span className="tabular truncate">{value}</span>
      </div>
      {hint && <div className="mt-0.5 truncate text-xs text-muted">{hint}</div>}
    </div>
  );
}

function ChartHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="font-semibold">{title}</h2>
      <p className="text-xs text-muted">{subtitle}</p>
    </div>
  );
}

type Series = { key: string; name: string; color: string; ms: number };

function Legend({ series }: { series: Series[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <ProjectDot color={s.color} size={8} /> {s.name}
        </span>
      ))}
    </div>
  );
}

const tipClass = "card px-3 py-2 text-xs shadow-lg";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DayTooltip({ active, payload, series }: any & { series: Series[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const items = (series as Series[]).filter((s) => row[s.key] > 0).sort((a, b) => row[b.key] - row[a.key]);
  return (
    <div className={tipClass}>
      <div className="mb-1 font-semibold">{row.label} · {formatHM(row.total)}</div>
      {items.length === 0 && <div className="text-muted">Nothing tracked</div>}
      {items.map((s) => (
        <div key={s.key} className="flex items-center gap-2 py-0.5">
          <ProjectDot color={s.color} size={8} />
          <span className="flex-1">{s.name}</span>
          <span className="tabular font-medium">{formatHM(row[s.key] * 3_600_000)}</span>
        </div>
      ))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PieTooltip({ active, payload, total }: any) {
  if (!active || !payload?.length) return null;
  const s = payload[0].payload as Series;
  return (
    <div className={tipClass}>
      <div className="flex items-center gap-2 font-semibold"><ProjectDot color={s.color} size={8} />{s.name}</div>
      <div className="tabular mt-0.5 text-muted">{formatHM(s.ms)} · {Math.round((s.ms / total) * 100)}%</div>
    </div>
  );
}

// ---- Type of work heatmap ------------------------------------------------------------------

const ALL = "__all";
const NONE = "__none";
// Fixed hour bands (not relative to the busiest day), so a colour means the same thing whatever
// range or project is picked. One hue, light to dark.
const LEVELS = [
  { upTo: 1, mix: 32, label: "under 1h" },
  { upTo: 3, mix: 50, label: "1–3h" },
  { upTo: 5, mix: 74, label: "3–5h" },
  { upTo: Infinity, mix: 100, label: "5h+" },
];
const cellColor = (ms: number) => {
  if (ms <= 0) return "var(--surface-2)";
  const level = LEVELS.find((l) => ms / 3_600_000 <= l.upTo)!;
  return `color-mix(in oklab, var(--accent) ${level.mix}%, var(--surface-2))`;
};

/**
 * Rows are types of work, columns are the days of the chosen range; a square gets darker the more
 * hours went into that type that day. The project menu narrows it to one project.
 */
function TypeHeatmap({ data, days, now, projects }: { data: AppData; days: string[]; now: Date; projects: Project[] }) {
  const [project, setProject] = useState<string>(ALL);
  const [hover, setHover] = useState<{ type: string; day: string; ms: number } | null>(null);
  const types = workTypesOf(data);

  const rows = useMemo(() => {
    const first = days[0];
    const last = days[days.length - 1];
    const wanted = (pid: string | null) => project === ALL || (project === NONE ? pid === null : pid === project);
    const byType = new Map<string, Map<string, number>>();
    for (const seg of toSegments(data.entries, now)) {
      if (seg.day < first || seg.day > last || !wanted(seg.entry.projectId)) continue;
      const tid = entryTypeId(seg.entry);
      let row = byType.get(tid);
      if (!row) byType.set(tid, (row = new Map()));
      row.set(seg.day, (row.get(seg.day) ?? 0) + seg.ms);
    }
    const known = types.filter((t) => byType.has(t.id)).map((t) => ({ id: t.id, name: t.name, color: t.color, cells: byType.get(t.id)! }));
    // Sessions whose type was removed in Settings still count, in one row.
    const removed = new Map<string, number>();
    for (const [tid, cells] of byType) {
      if (types.some((t) => t.id === tid)) continue;
      for (const [day, ms] of cells) removed.set(day, (removed.get(day) ?? 0) + ms);
    }
    if (removed.size) known.push({ id: "__removed", name: "Removed type", color: NO_PROJECT_COLOR, cells: removed });
    return known.map((r) => ({ ...r, total: [...r.cells.values()].reduce((a, b) => a + b, 0) }));
  }, [data.entries, days, now, project, types]);

  const used = new Set(data.entries.map((e) => e.projectId));
  const options = projects.filter((p) => !p.archived || used.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  const today = dayKey(now);
  const wide = days.length > 7;
  const label = (day: string) => parseDayKey(day).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="card p-5 lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ChartHeader title="Type of work" subtitle="Hours per day for each type. Darker means more time." />
        <select className="input max-w-[220px] py-1.5 text-sm" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project">
          <option value={ALL}>All projects</option>
          <option value={NONE}>No project</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ""}</option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 py-8 text-center text-sm text-muted">No time on this project in this period.</p>
      ) : (
        <div
          className="mt-4 grid items-center gap-[2px]"
          style={{ gridTemplateColumns: `max-content repeat(${days.length}, minmax(6px, 1fr)) max-content` }}
          onMouseLeave={() => setHover(null)}
        >
          <span />
          {days.map((day) => {
            const d = parseDayKey(day);
            const show = !wide || d.getDay() === 1 || day === days[0];
            return (
              <span key={day} className={`h-5 overflow-visible whitespace-nowrap text-[11px] ${day === today ? "font-semibold text-text" : "text-muted"}`}>
                {show ? d.toLocaleDateString([], wide ? { day: "numeric", month: "short" } : { weekday: "short", day: "numeric" }) : ""}
              </span>
            );
          })}
          <span className="pl-3 text-right text-[11px] text-muted">Total</span>
          {rows.map((r) => (
            <Fragment key={r.id}>
              <span className="flex items-center gap-1.5 whitespace-nowrap pr-3 text-sm"><ProjectDot color={r.color} size={8} />{r.name}</span>
              {days.map((day) => {
                const ms = r.cells.get(day) ?? 0;
                const on = hover?.type === r.name && hover.day === day;
                return (
                  <span
                    key={day}
                    className="h-7 rounded"
                    style={{ background: cellColor(ms), outline: on ? "2px solid var(--text)" : undefined, outlineOffset: -1 }}
                    title={`${r.name} · ${label(day)} · ${ms ? formatHM(ms) : "nothing"}`}
                    onMouseEnter={() => setHover({ type: r.name, day, ms })}
                  />
                );
              })}
              <span className="tabular whitespace-nowrap pl-3 text-right text-sm font-medium">{formatHM(r.total)}</span>
            </Fragment>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="min-h-4">
          {hover ? <><span className="font-medium text-text">{hover.type}</span> · {label(hover.day)} · {hover.ms ? formatHM(hover.ms) : "nothing tracked"}</> : "Hover a square for the exact time."}
        </span>
        <span className="flex items-center gap-1.5">
          {LEVELS.map((l) => (
            <span key={l.label} className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-sm" style={{ background: `color-mix(in oklab, var(--accent) ${l.mix}%, var(--surface-2))` }} />
              {l.label}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
