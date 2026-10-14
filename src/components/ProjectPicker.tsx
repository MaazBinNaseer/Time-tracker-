"use client";

import { useEffect, useRef, useState } from "react";
import { Check, FolderPlus, Plus } from "lucide-react";
import { NO_PROJECT_COLOR } from "@/lib/types";
import { useStore } from "./StoreProvider";

export function ProjectDot({ color, size = 10 }: { color: string; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ background: color, width: size, height: size }} />;
}

export function ProjectPicker({
  value,
  onChange,
  compact = false,
  wide = false,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  compact?: boolean;
  wide?: boolean; // fill the parent width (used inside forms)
}) {
  const { data, projectById, addProject } = useStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const current = projectById(value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const q = query.trim().toLowerCase();
  const options = data.projects.filter((p) => !p.archived && p.name.toLowerCase().includes(q));
  const exact = data.projects.some((p) => p.name.toLowerCase() === q);

  const pick = (id: string | null) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-surface-2 ${wide ? "w-full" : "max-w-[220px]"} ${
          current ? "" : "text-accent"
        }`}
        title="Choose project"
      >
        {current ? (
          <>
            <ProjectDot color={current.color} />
            <span className="truncate" style={{ color: current.color }}>{current.name}</span>
            {current.code && <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted">{current.code}</span>}
          </>
        ) : (
          <>
            <FolderPlus size={18} />
            {!compact && <span>{wide ? "Choose a project" : "Project"}</span>}
          </>
        )}
      </button>
      {open && (
        <div className={`card absolute z-40 mt-2 w-72 p-2 shadow-xl ${wide ? "left-0" : "right-0"}`}>
          <input
            autoFocus
            className="input w-full"
            placeholder="Find or create a project…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (options[0]) pick(options[0].id);
                else if (q) pick(addProject({ name: query.trim() }).id);
              }
              if (e.key === "Escape") setOpen(false);
            }}
          />
          <div className="mt-2 max-h-64 overflow-y-auto">
            <button type="button" onClick={() => pick(null)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-2">
              <ProjectDot color={NO_PROJECT_COLOR} />
              <span className="flex-1 text-muted">No project</span>
              {value === null && <Check size={14} />}
            </button>
            {options.map((p) => (
              <button key={p.id} type="button" onClick={() => pick(p.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-2">
                <ProjectDot color={p.color} />
                <span className="flex-1 truncate">{p.name}</span>
                {(p.code || p.client) && <span className="truncate text-xs text-muted">{p.code ?? p.client}</span>}
                {value === p.id && <Check size={14} />}
              </button>
            ))}
            {q && !exact && (
              <button type="button" onClick={() => pick(addProject({ name: query.trim() }).id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium text-accent hover:bg-accent-soft">
                <Plus size={14} /> Create “{query.trim()}”
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function CodeBadge({ code }: { code?: string }) {
  if (!code) return null;
  return <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted">{code}</span>;
}

/** Green "$" marker; `partial` when only some of the time is billable. */
export function BillableBadge({ partial = false }: { partial?: boolean }) {
  return (
    <span
      title={partial ? "Partly billable" : "Billable"}
      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${partial ? "bg-emerald-500/10 text-emerald-600/70" : "bg-emerald-500/15 text-emerald-600"} dark:text-emerald-400`}
    >
      $
    </span>
  );
}
