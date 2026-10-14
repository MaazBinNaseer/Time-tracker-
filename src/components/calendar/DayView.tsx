"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEntryDialog } from "@/components/EntryDialog";
import { Kpi } from "@/components/Kpi";
import { useNow, useStore } from "@/components/StoreProvider";
import { addDays, dayKey, formatHM, formatTime, projectTotals, toSegments } from "@/lib/time";
import { NO_PROJECT_COLOR } from "@/lib/types";
import { ProjectSummary } from "./ProjectSummary";

const HOUR_PX = 56;
const SNAP = 15; // minutes: dragged times snap to the quarter hour

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

  // Drag on an empty part of the grid to mark a time span, then the "Add time" form opens with it.
  // A plain click (or a tap on a phone) marks one hour from that point.
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const minuteAt = (e: React.PointerEvent | React.MouseEvent, el: HTMLElement) => {
    const y = e.clientY - el.getBoundingClientRect().top;
    return Math.max(0, Math.min(24 * 60, Math.round(((y / HOUR_PX) * 60) / SNAP) * SNAP));
  };
  const at = (minute: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minute);
  const openSlot = (a: number, b: number) => {
    let [from, to] = a <= b ? [a, b] : [b, a];
    if (to - from < SNAP) to = Math.min(24 * 60, from + 60);
    if (to - from < SNAP) from = to - 60; // clicked at the very end of the day
    openDialog({ mode: "add", preset: { start: at(from), end: at(to) } });
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch" || e.button !== 0 || e.target !== e.currentTarget) return; // touch scrolls; blocks handle their own clicks
    e.currentTarget.setPointerCapture(e.pointerId);
    const m = minuteAt(e, e.currentTarget);
    setDrag({ from: m, to: m });
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const m = minuteAt(e, e.currentTarget);
    if (m !== drag.to) setDrag({ ...drag, to: m });
    // Keep the grid scrolling when dragging past its top or bottom edge.
    const box = scroller.current?.getBoundingClientRect();
    if (box && e.clientY > box.bottom - 24) scroller.current!.scrollBy({ top: 16 });
    if (box && e.clientY < box.top + 24) scroller.current!.scrollBy({ top: -16 });
  };
  const onPointerUp = () => {
    if (!drag) return;
    setDrag(null);
    openSlot(drag.from, drag.to);
  };
  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    // Phones: a tap on an empty spot opens one hour from there (dragging would fight scrolling).
    if ((e.nativeEvent as PointerEvent).pointerType !== "touch" || e.target !== e.currentTarget) return;
    const m = Math.floor(minuteAt(e, e.currentTarget) / 60) * 60;
    openSlot(m, m + 60);
  };
  const ghost = drag && { top: (Math.min(drag.from, drag.to) / 60) * HOUR_PX, height: (Math.abs(drag.to - drag.from) / 60) * HOUR_PX };
  const clock = (m: number) => formatTime(at(m));
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

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card overflow-hidden">
          <p className="border-b border-border px-4 py-2 text-xs text-muted">Drag on an empty part of the day to add time. Click a block to edit it.</p>
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
              <div
                className="absolute bottom-0 left-16 right-3 top-0 cursor-crosshair select-none"
                title="Drag to add time"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDrag(null)}
                onClick={onTap}
              >
                {ghost && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-20 rounded-lg border-2 border-dashed border-accent bg-accent-soft/70 px-2 py-1 text-xs font-medium text-accent"
                    style={{ top: ghost.top, height: Math.max(ghost.height, 4) }}
                  >
                    {ghost.height >= 18 && <>{clock(Math.min(drag!.from, drag!.to))} – {clock(Math.max(drag!.from, drag!.to))} · {formatHM(Math.abs(drag!.to - drag!.from) * 60000)}</>}
                  </div>
                )}
                {blocks.map(({ s, lane, lanes }) => {
                  const p = projectById(s.entry.projectId);
                  const color = p?.color ?? NO_PROJECT_COLOR;
                  const top = (minutesOf(s.start) / 60) * HOUR_PX;
                  const height = Math.max(18, (s.ms / 3_600_000) * HOUR_PX - 2);
                  return (
                    <button
                      key={s.entry.id}
                      onClick={() => openDialog({ mode: "edit", entry: s.entry })}
                      className="absolute cursor-pointer overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left text-xs transition hover:brightness-95"
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
