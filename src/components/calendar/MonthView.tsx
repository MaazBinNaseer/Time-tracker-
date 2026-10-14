"use client";

import { useMemo } from "react";
import { Kpi } from "@/components/Kpi";
import { ProjectDot } from "@/components/ProjectPicker";
import { useNow, useStore } from "@/components/StoreProvider";
import { addDays, dayKey, formatHM, projectTotals, rangeStats, startOfWeek } from "@/lib/time";
import { NO_PROJECT_COLOR } from "@/lib/types";
import { ProjectSummary } from "./ProjectSummary";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Month grid: each day shows its total and its projects (one line per project). */
export function MonthView({ month, onPickDay }: { month: Date; onPickDay: (d: Date) => void }) {
  const { data, projectById } = useStore();
  const now = useNow(60_000);
  const todayKey = dayKey(now);

  const view = useMemo(() => {
    const from = new Date(month.getFullYear(), month.getMonth(), 1);
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    const gridStart = startOfWeek(from);
    const gridEnd = addDays(startOfWeek(addDays(to, -1)), 7);
    const stats = rangeStats(data.entries, gridStart, gridEnd, now);
    const cells: Date[] = [];
    for (let d = gridStart; d < gridEnd; d = addDays(d, 1)) cells.push(d);
    const totals = projectTotals(data.entries, from, to, now);
    const monthTotal = totals.reduce((s, t) => s + t.ms, 0);
    const activeDays = new Set<string>();
    for (const [k, m] of stats.byDay) if (k >= dayKey(from) && k < dayKey(to) && [...m.values()].some((v) => v > 0)) activeDays.add(k);
    const maxDay = Math.max(1, ...[...stats.byDay.values()].map((m) => [...m.values()].reduce((s, v) => s + v, 0)));
    return { from, stats, cells, totals, monthTotal, activeDays: activeDays.size, maxDay };
  }, [data.entries, month, now]);

  const { stats, cells, totals, monthTotal, activeDays, maxDay } = view;
  const top = totals[0] ? projectById(totals[0].projectId) : undefined;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Month total" value={formatHM(monthTotal)} />
        <Kpi label="Days worked" value={String(activeDays)} hint={activeDays ? `avg ${formatHM(monthTotal / activeDays)} per day worked` : undefined} />
        <Kpi label="Projects" value={String(totals.length)} />
        <Kpi label="Top project" value={totals[0] ? top?.name ?? "No project" : "None"} dot={totals[0] ? top?.color ?? NO_PROJECT_COLOR : undefined} hint={totals[0] ? formatHM(totals[0].ms) : undefined} />
      </div>

      <div className="mt-6 space-y-4">
        <div className="card overflow-x-auto">
          <div className="grid min-w-[700px] grid-cols-7">
            {WEEKDAYS.map((w) => (
              <div key={w} className="border-b border-border bg-surface-2/60 px-2 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted">{w}</div>
            ))}
            {cells.map((d, i) => {
              const k = dayKey(d);
              const inMonth = d.getMonth() === month.getMonth();
              const projects = [...(stats.byDay.get(k) ?? new Map<string | null, number>()).entries()].filter(([, ms]) => ms > 0).sort((a, b) => b[1] - a[1]);
              const dayTotal = projects.reduce((s, [, ms]) => s + ms, 0);
              return (
                <button
                  key={k}
                  onClick={() => onPickDay(d)}
                  className={`relative flex min-h-[112px] flex-col gap-1 border-b border-border p-1.5 text-left transition hover:bg-surface-2/60 ${i % 7 ? "border-l" : ""} ${inMonth ? "" : "opacity-40"}`}
                >
                  <div className="flex items-center justify-between px-1">
                    <span className={`grid h-6 min-w-6 place-items-center rounded-full text-xs font-semibold ${k === todayKey ? "bg-accent px-1.5 text-white dark:text-[#140f1f]" : ""}`}>{d.getDate()}</span>
                    {dayTotal > 0 && <span className="tabular text-xs font-semibold">{formatHM(dayTotal)}</span>}
                  </div>
                  {dayTotal > 0 && (
                    // Bar length shows how full the day was compared with your longest day.
                    <div className="mx-1 h-1 rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${(dayTotal / maxDay) * 100}%` }} />
                    </div>
                  )}
                  {projects.slice(0, 3).map(([pid, ms]) => {
                    const p = projectById(pid);
                    return (
                      <div key={String(pid)} className="flex items-center gap-1.5 rounded-md px-1 text-[11px]" style={{ background: `color-mix(in srgb, ${p?.color ?? NO_PROJECT_COLOR} 12%, transparent)` }}>
                        <ProjectDot color={p?.color ?? NO_PROJECT_COLOR} size={6} />
                        <span className="min-w-0 flex-1 truncate">{p?.name ?? "No project"}</span>
                        <span className="tabular shrink-0 text-muted">{formatHM(ms)}</span>
                      </div>
                    );
                  })}
                  {projects.length > 3 && <span className="px-1 text-[11px] text-muted">+{projects.length - 3} more</span>}
                </button>
              );
            })}
          </div>
        </div>
        <ProjectSummary
          title="Projects this month"
          wide
          total={monthTotal}
          rows={totals.map((t) => {
            const p = projectById(t.projectId);
            return {
              key: t.projectId ?? "none",
              name: p?.name ?? "No project",
              client: p?.client,
              code: p?.code,
              color: p?.color ?? NO_PROJECT_COLOR,
              ms: t.ms,
              billableMs: t.billableMs,
              detail: `worked on ${t.days} ${t.days === 1 ? "day" : "days"}`,
              tasks: t.tasks,
            };
          })}
        />
      </div>
      <p className="mt-3 text-xs text-muted">Tip: click any day to open it in the Day view.</p>
    </>
  );
}
