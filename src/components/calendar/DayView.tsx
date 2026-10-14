"use client";

import { useEffect, useMemo, useRef } from "react";
import { useEntryDialog } from "@/components/EntryDialog";
import { Kpi } from "@/components/Kpi";
import { useNow, useStore } from "@/components/StoreProvider";
import { addDays, dayKey, formatHM, formatTime, projectTotals, toSegments } from "@/lib/time";
import { NO_PROJECT_COLOR } from "@/lib/types";
import { ProjectSummary } from "./ProjectSummary";

const HOUR_PX = 56;

/** Calendar-style day: sessions as blocks on an hour grid, plus the day's project totals. */
export function DayView({ day }: { day: Date }) {
  const { data, projectById } = useStore();
  const now = useNow(30_000);
  const openDialog = useEntryDialog();
  const scroller = useRef<HTMLDivElement>(null);
  const key = dayKey(day);
  const isToday = key === dayKey(now);

  const { blocks, totals, total, first, last } = useMemo(() => {
    const segs = toSegments(data.entries, now)
      .filter((s) => s.day === key)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    // Overlapping sessions (possible with manual entries) sit side by side in lanes.
    // Lanes are counted per group of overlapping sessions, so others keep full width.
    const placed: { s: (typeof segs)[number]; lane: number; lanes: number }[] = [];
    let group: typeof placed = [];
    let laneEnds: number[] = [];
    let groupEnd = 0;
    const flush = () => {
      group.forEach((g) => (g.lanes = laneEnds.length));
      placed.push(...group);
      group = [];
      laneEnds = [];
    };
    for (const s of segs) {
      if (group.length && s.start.getTime() >= groupEnd) flush();
      let lane = laneEnds.findIndex((end) => end <= s.start.getTime());
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = s.end.getTime();
      groupEnd = Math.max(groupEnd, s.end.getTime());
      group.push({ s, lane, lanes: 1 });
    }
    flush();
    const totals = projectTotals(data.entries, day, addDays(day, 1), now);
    return {
      blocks: placed,
      totals,
      total: totals.reduce((sum, t) => sum + t.ms, 0),
      first: segs[0]?.start,
      last: segs.at(-1)?.end,
    };
  }, [data.entries, now, key, day]);

  // Open the grid near the first session (or 8am) instead of at midnight.
  useEffect(() => {
    const h = first ? Math.max(0, first.getHours() - 1) : 8;
    scroller.current?.scrollTo({ top: h * HOUR_PX });
  }, [key, first]);

  const minutesOf = (d: Date) => (d.getTime() - day.getTime()) / 60000;
  const summaryRows = totals.map((t) => {
    const p = projectById(t.projectId);
    return {
      key: t.projectId ?? "none",
      name: p?.name ?? "No project",
      client: p?.client,
      code: p?.code,
      color: p?.color ?? NO_PROJECT_COLOR,
      ms: t.ms,
      billableMs: t.billableMs,
      detail: `${t.sessions} ${t.sessions === 1 ? "session" : "sessions"}`,
      tasks: t.tasks,
    };
  });

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Day total" value={formatHM(total)} />
        <Kpi label="Projects" value={String(totals.length)} hint={summaryRows.slice(0, 3).map((r) => r.name).join(", ") || "None"} />
        <Kpi label="Started" value={first ? formatTime(first) : "—"} />
        <Kpi label="Finished" value={last ? (isToday && blocks.some((b) => b.s.entry.end === null) ? "Still going" : formatTime(last)) : "—"} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card overflow-hidden lg:col-span-2">
          <div ref={scroller} className="relative h-[620px] overflow-y-auto">
            <div className="relative" style={{ height: 24 * HOUR_PX }}>
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="absolute inset-x-0 flex border-t border-border/70" style={{ top: h * HOUR_PX }}>
                  <span className="tabular -mt-2.5 w-14 bg-surface pr-2 text-right text-[11px] text-muted">{h === 0 ? "" : `${h}:00`}</span>
                </div>
              ))}
              {isToday && (
                <div className="absolute left-14 right-0 z-10 border-t-2 border-rose-500" style={{ top: (minutesOf(now) / 60) * HOUR_PX }}>
                  <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-rose-500" />
                </div>
              )}
              <div className="absolute bottom-0 left-16 right-3 top-0">
                {blocks.map(({ s, lane, lanes }) => {
                  const p = projectById(s.entry.projectId);
                  const color = p?.color ?? NO_PROJECT_COLOR;
                  const top = (minutesOf(s.start) / 60) * HOUR_PX;
                  const height = Math.max(18, (s.ms / 3_600_000) * HOUR_PX - 2);
                  return (
                    <button
                      key={s.entry.id}
                      onClick={() => openDialog({ mode: "edit", entry: s.entry })}
                      className="absolute overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left text-xs transition hover:brightness-95"
                      style={{
                        top,
                        height,
                        left: `${(lane / lanes) * 100}%`,
                        width: `calc(${100 / lanes}% - 4px)`,
                        borderColor: color,
                        background: `color-mix(in srgb, ${color} 18%, var(--surface))`,
                      }}
                      title={`${p?.name ?? "No project"} · ${s.entry.description}`}
                    >
                      <div className="truncate font-semibold">{p?.name ?? "No project"}</div>
                      {height > 34 && <div className="truncate text-muted">{s.entry.description || "No description"}</div>}
                      {height > 50 && (
                        <div className="tabular truncate text-muted">
                          {formatTime(s.start)} – {s.entry.end === null ? "now" : formatTime(s.end)} · {formatHM(s.ms)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        <ProjectSummary title="Projects this day" rows={summaryRows} total={total} />
      </div>
    </>
  );
}
