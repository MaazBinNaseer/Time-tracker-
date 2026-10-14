"use client";

import { useMemo, useState } from "react";
import { Archive, ArchiveRestore, Plus, Trash2 } from "lucide-react";
import { useNow, useStore } from "@/components/StoreProvider";
import { addDays, formatHM, rangeStats, startOfDay, startOfWeek } from "@/lib/time";
import { PROJECT_COLORS, type Project } from "@/lib/types";

export default function ProjectsPage() {
  const { data, addProject } = useStore();
  const now = useNow(60_000);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [code, setCode] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const totals = useMemo(() => {
    const all = rangeStats(data.entries, new Date(0), addDays(startOfDay(now), 1), now).byProject;
    const week = rangeStats(data.entries, startOfWeek(now), addDays(startOfWeek(now), 7), now).byProject;
    return { all, week };
  }, [data.entries, now]);

  const projects = data.projects
    .filter((p) => showArchived || !p.archived)
    .sort((a, b) => (totals.all.get(b.id) ?? 0) - (totals.all.get(a.id) ?? 0));
  const archivedCount = data.projects.filter((p) => p.archived).length;

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    addProject({ name: name.trim(), client: client.trim() || undefined, code: code.trim().toUpperCase() || undefined });
    setName("");
    setClient("");
    setCode("");
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
      <p className="mt-1 text-sm text-muted">Group your work. Colours carry through to the timer and charts.</p>

      <form onSubmit={create} className="card mt-6 flex flex-wrap items-center gap-2 p-3">
        <input className="input min-w-0 flex-[2]" placeholder="New project name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input w-32 min-w-0 uppercase placeholder:normal-case" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
        <input className="input min-w-0 flex-1" placeholder="Client (optional)" value={client} onChange={(e) => setClient(e.target.value)} />
        <button className="btn-primary" disabled={!name.trim()}><Plus size={16} /> Create</button>
      </form>

      <div className="card mt-4 overflow-hidden">
        <div className="hidden md:grid-cols-[1fr_100px_130px_84px_96px_96px_88px] gap-4 border-b border-border bg-surface-2/60 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted md:grid">
          <span>Project</span><span>Code</span><span>Client</span><span title="Default for new sessions">Billable</span><span className="text-right">This week</span><span className="text-right">All time</span><span />
        </div>
        {projects.length === 0 && <div className="px-4 py-10 text-center text-sm text-muted">No projects yet. Create one above, or straight from the timer bar.</div>}
        <ul className="divide-y divide-border">
          {projects.map((p) => (
            <ProjectRow key={p.id} project={p} week={totals.week.get(p.id) ?? 0} all={totals.all.get(p.id) ?? 0} />
          ))}
        </ul>
      </div>
      {archivedCount > 0 && (
        <button className="btn-ghost mt-3" onClick={() => setShowArchived((s) => !s)}>
          {showArchived ? "Hide" : "Show"} archived ({archivedCount})
        </button>
      )}
    </div>
  );
}

function ProjectRow({ project: p, week, all }: { project: Project; week: number; all: number }) {
  const { updateProject, deleteProject } = useStore();
  const [picking, setPicking] = useState(false);

  return (
    <li className={`grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[1fr_100px_130px_84px_96px_96px_88px] ${p.archived ? "opacity-60" : ""}`}>
      <div className="relative flex min-w-0 items-center gap-3">
        <button className="h-5 w-5 shrink-0 rounded-md ring-2 ring-surface ring-offset-1 ring-offset-border" style={{ background: p.color }} onClick={() => setPicking((x) => !x)} title="Change colour" />
        {picking && (
          <div className="card absolute left-0 top-8 z-30 grid grid-cols-4 gap-2 p-2.5 shadow-xl">
            {PROJECT_COLORS.map((c) => (
              <button key={c} className={`h-7 w-7 rounded-md ${c === p.color ? "ring-2 ring-text ring-offset-2 ring-offset-surface" : ""}`} style={{ background: c }} onClick={() => { updateProject(p.id, { color: c }); setPicking(false); }} />
            ))}
            <label className="col-span-4 flex items-center gap-2 text-xs text-muted">
              Custom <input type="color" value={p.color} onChange={(e) => updateProject(p.id, { color: e.target.value })} />
            </label>
          </div>
        )}
        <input className="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-1 font-medium outline-none focus:bg-surface-2" value={p.name} onChange={(e) => updateProject(p.id, { name: e.target.value })} />
      </div>
      <input className="hidden min-w-0 rounded-lg bg-transparent px-1 py-1 text-sm font-semibold uppercase text-muted outline-none placeholder:font-normal placeholder:normal-case placeholder:text-muted/60 focus:bg-surface-2 md:block" placeholder="Add code" value={p.code ?? ""} onChange={(e) => updateProject(p.id, { code: e.target.value.toUpperCase() || undefined })} />
      <input className="hidden min-w-0 rounded-lg bg-transparent px-1 py-1 text-sm text-muted outline-none placeholder:text-muted/60 focus:bg-surface-2 md:block" placeholder="Add client" value={p.client ?? ""} onChange={(e) => updateProject(p.id, { client: e.target.value || undefined })} />
      <label className="hidden cursor-pointer items-center gap-2 text-sm md:flex" title="New sessions on this project start as billable">
        <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={!!p.billable} onChange={(e) => updateProject(p.id, { billable: e.target.checked })} />
        <span className="text-muted">{p.billable ? "Yes" : "No"}</span>
      </label>
      <span className="tabular hidden text-right text-sm md:block">{formatHM(week)}</span>
      <span className="tabular text-right text-sm font-semibold">{formatHM(all)}</span>
      <div className="col-span-2 flex justify-end gap-1 md:col-span-1">
        <button className="btn-ghost p-2" title={p.archived ? "Restore" : "Archive"} onClick={() => updateProject(p.id, { archived: !p.archived })}>
          {p.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
        </button>
        <button
          className="btn-ghost p-2 hover:text-danger"
          title="Delete"
          onClick={() => confirm(`Delete “${p.name}”? Its tracked time is kept under “No project”.`) && deleteProject(p.id)}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </li>
  );
}
