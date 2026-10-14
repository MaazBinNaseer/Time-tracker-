"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Play, Square } from "lucide-react";
import { entryDuration, formatClock, formatHM } from "@/lib/time";
import { useEntryDialog } from "./EntryDialog";
import { ProjectPicker } from "./ProjectPicker";
import { useNow, useStore } from "./StoreProvider";

export function TimerBar() {
  const { running, updateRunning, projectById, data } = useStore();
  const openDialog = useEntryDialog();
  const now = useNow();
  // While stopped, these hold what the *next* timer will be for.
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);

  const elapsed = running ? entryDuration(running, now) : 0;

  // "Did you forget to stop?" Shown once a timer passes the limit set in Settings (default 10h).
  const limitHours = data.settings?.longTimerHours ?? 10;
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try {
      return localStorage.getItem("timetrack:dismissedLongTimer");
    } catch {
      return null;
    }
  });
  const tooLong = !!running && limitHours > 0 && elapsed > limitHours * 3_600_000 && dismissed !== running.id;
  const keepRunning = () => {
    if (!running) return;
    setDismissed(running.id);
    try {
      localStorage.setItem("timetrack:dismissedLongTimer", running.id);
    } catch {}
  };

  useEffect(() => {
    const base = "Tempo · Time Tracker";
    if (!running) {
      document.title = base;
      return;
    }
    const name = projectById(running.projectId)?.name ?? "No project";
    document.title = `${tooLong ? "⚠ " : ""}${formatClock(elapsed)} · ${name}`;
  }, [running, elapsed, projectById, tooLong]);

  // Both start and stop go through the pop-up form, so times can be corrected before saving.
  const toggle = () => {
    if (running) {
      openDialog({ mode: "stop", entry: running });
      setDescription("");
      setProjectId(null);
    } else {
      openDialog({ mode: "start", preset: { projectId, description: description.trim() } });
    }
  };

  return (
    <div className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3 md:flex-nowrap md:px-8">
        <input
          className="min-w-0 basis-full bg-transparent px-2 py-2 md:flex-1 md:basis-auto text-[15px] outline-none placeholder:text-muted"
          placeholder="What are you working on?"
          value={running ? running.description : description}
          onChange={(e) => (running ? updateRunning({ description: e.target.value }) : setDescription(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && !running && toggle()}
        />
        <ProjectPicker
          value={running ? running.projectId : projectId}
          onChange={(id) => (running ? updateRunning({ projectId: id }) : setProjectId(id))}
          compact
        />
        <span className="flex-1 md:hidden" />
        <span className={`tabular w-[86px] text-right text-lg font-semibold ${running ? "text-text" : "text-muted"}`}>
          {formatClock(elapsed)}
        </span>
        <button
          onClick={toggle}
          aria-label={running ? "Stop timer" : "Start timer"}
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-white shadow-lg transition active:scale-95 ${
            running ? "bg-rose-500 shadow-rose-500/30 hover:bg-rose-600" : "bg-accent shadow-violet-500/30 hover:bg-accent-strong"
          }`}
        >
          {running ? <Square size={16} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
        </button>
      </div>
      {tooLong && running && (
        <div className="border-t border-amber-500/30 bg-amber-500/10">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-sm md:px-8">
            <AlertTriangle size={16} className="shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="min-w-0 flex-1">
              This timer has been running for <strong>{formatHM(elapsed)}</strong>. Did you forget to stop it?
            </span>
            <button className="btn-outline px-3 py-1" onClick={() => openDialog({ mode: "stop", entry: running })}>
              Fix the end time
            </button>
            <button className="btn-ghost px-3 py-1" onClick={keepRunning}>Keep running</button>
          </div>
        </div>
      )}
    </div>
  );
}