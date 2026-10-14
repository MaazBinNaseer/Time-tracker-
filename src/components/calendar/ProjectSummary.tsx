"use client";

import { formatHM } from "@/lib/time";
import { CodeBadge, ProjectDot } from "../ProjectPicker";

export interface ProjectTotal {
  key: string;
  name: string;
  client?: string;
  code?: string;
  color: string;
  ms: number;
  billableMs?: number;
  detail?: string; // e.g. "3 sessions" or "worked on 5 days"
  tasks?: [string, number][];
}

/** "Tell me about the projects": one row per project with total, share and what was done. */
export function ProjectSummary({ title, rows, total, wide = false }: { title: string; rows: ProjectTotal[]; total: number; wide?: boolean }) {
  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">{title}</h2>
        <span className="tabular text-sm font-semibold">{formatHM(total)}</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted">Nothing tracked.</p>
      ) : (
        <ul className={`mt-4 grid gap-x-10 gap-y-4 ${wide ? "md:grid-cols-2" : ""}`}>
          {rows.map((r) => {
            const pct = total ? (r.ms / total) * 100 : 0;
            return (
              <li key={r.key}>
                <div className="flex items-center gap-2 text-sm">
                  <ProjectDot color={r.color} />
                  <span className="min-w-0 truncate font-medium">{r.name}</span>
                  <CodeBadge code={r.code} />
                  <span className="flex-1" />
                  <span className="tabular text-xs text-muted">{Math.round(pct)}%</span>
                  <span className="tabular w-16 text-right font-semibold">{formatHM(r.ms)}</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-surface-2">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: r.color }} />
                </div>
                <div className="mt-1.5 text-xs text-muted">
                  {[r.client, r.detail, r.billableMs ? `${formatHM(r.billableMs)} billable` : null].filter(Boolean).join(" · ")}
                </div>
                {r.tasks && r.tasks.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {r.tasks.slice(0, 4).map(([desc, ms]) => (
                      <li key={desc} className="flex justify-between gap-2 pl-4">
                        <span className="truncate">{desc}</span>
                        <span className="tabular shrink-0 text-muted">{formatHM(ms)}</span>
                      </li>
                    ))}
                    {r.tasks.length > 4 && <li className="pl-4 text-muted">+{r.tasks.length - 4} more</li>}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
