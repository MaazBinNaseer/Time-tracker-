"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayView } from "@/components/calendar/DayView";
import { MonthView } from "@/components/calendar/MonthView";
import { WeekView } from "@/components/calendar/WeekView";
import { addDays, dayKey, startOfDay, startOfWeek } from "@/lib/time";

type View = "day" | "week" | "month";
const VIEWS: { key: View; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];
const VIEW_KEY = "timetrack:calendarView";

export default function CalendarPage() {
  const [view, setView] = useState<View>("week");
  // Any date inside the period being shown; each view snaps it to its own start.
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("view");
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(VIEW_KEY);
    } catch {}
    const v = fromUrl ?? saved;
    if (v === "day" || v === "week" || v === "month") setView(v);
  }, []);

  const choose = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  const step = (dir: 1 | -1) =>
    setAnchor((a) =>
      view === "day" ? addDays(a, dir) : view === "week" ? addDays(a, 7 * dir) : new Date(a.getFullYear(), a.getMonth() + dir, 1),
    );

  const today = startOfDay(new Date());
  const weekStart = startOfWeek(anchor);
  const weekEnd = addDays(weekStart, 6);
  const label =
    view === "day"
      ? dayKey(anchor) === dayKey(today)
        ? "Today"
        : anchor.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : view === "week"
        ? `${weekStart.toLocaleDateString([], { day: "numeric", month: "short" })} – ${weekEnd.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}`
        : anchor.toLocaleDateString([], { month: "long", year: "numeric" });
  const isCurrent =
    view === "day"
      ? dayKey(anchor) === dayKey(today)
      : view === "week"
        ? dayKey(weekStart) === dayKey(startOfWeek(today))
        : anchor.getMonth() === today.getMonth() && anchor.getFullYear() === today.getFullYear();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          <p className="mt-1 text-sm text-muted">See your projects by day, week or month. Each project is one total per day.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-border bg-surface p-1">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => choose(v.key)}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${view === v.key ? "bg-accent text-white dark:text-[#140f1f]" : "text-muted hover:text-text"}`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="flex items-center rounded-xl border border-border bg-surface p-1">
            <button className="btn-ghost p-1.5" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft size={18} /></button>
            <span className="min-w-[180px] px-2 text-center text-sm font-medium">{label}</span>
            <button className="btn-ghost p-1.5" onClick={() => step(1)} aria-label="Next"><ChevronRight size={18} /></button>
          </div>
          {!isCurrent && <button className="btn-outline" onClick={() => setAnchor(today)}>Today</button>}
        </div>
      </div>

      {view === "day" && <DayView day={anchor} />}
      {view === "week" && <WeekView from={weekStart} />}
      {view === "month" && (
        <MonthView
          month={anchor}
          onPickDay={(d) => {
            setAnchor(d);
            choose("day");
          }}
        />
      )}
    </div>
  );
}
