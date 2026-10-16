"use client";

import { RichText } from "@/components/RichText";
import { toPlain } from "@/lib/richtext";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Printer } from "lucide-react";
import { useNow, useStore } from "@/components/StoreProvider";
import { addDays, dayKey, formatHM, formatTime, parseDayKey, rollupByDay, startOfDay, startOfWeek } from "@/lib/time";
import { entryTypeId, NO_PROJECT_COLOR, workTypesOf } from "@/lib/types";

/**
 * Activity report: what you worked on, day by day, with the hours. Made to be handed to someone
 * (a manager, a client) to show what the time was spent on. "Save as PDF" uses the browser's
 * print dialog, which lays the report out as clean pages.
 */

type Period = "day" | "week" | "custom";
const PREFS_KEY = "tempo:report";

interface Prefs {
  name: string;
  times: boolean;
  decimals: boolean;
  signoff: boolean;
  /** How much of each Activity to show: all of it, the first two lines, or none (hours only). */
  text: "full" | "short" | "none";
}

const toInput = (d: Date) => dayKey(d);
const longDate = (d: Date) => d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDate = (d: Date) => d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });

export default function ReportsPage() {
  const { data, projectById, user } = useStore();
  const now = useNow(60_000);
  const [period, setPeriod] = useState<Period>("week");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [custom, setCustom] = useState(() => ({ from: toInput(startOfWeek(new Date())), to: toInput(new Date()) }));
  const [project, setProject] = useState<string>("all");
  const [prefs, setPrefs] = useState<Prefs>({ name: "", times: true, decimals: false, signoff: false, text: "full" });
  const [copied, setCopied] = useState(false);

  // Remember the report options on this browser.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Partial<Prefs> | null;
      setPrefs((p) => ({ ...p, name: user?.username ?? "", ...saved }));
    } catch {
      setPrefs((p) => ({ ...p, name: user?.username ?? "" }));
    }
  }, [user]);
  const change = (patch: Partial<Prefs>) =>
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  // [from, to): the days the report covers.
  const [from, to] = useMemo((): [Date, Date] => {
    if (period === "day") return [anchor, addDays(anchor, 1)];
    if (period === "week") {
      const s = startOfWeek(anchor);
      return [s, addDays(s, 7)];
    }
    const a = custom.from ? parseDayKey(custom.from) : anchor;
    const b = custom.to ? parseDayKey(custom.to) : anchor;
    return a <= b ? [a, addDays(b, 1)] : [b, addDays(a, 1)];
  }, [period, anchor, custom]);

  const types = workTypesOf(data);
  const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? "Removed type";
  const hours = (ms: number) => (prefs.decimals ? `${(ms / 3_600_000).toFixed(2)} h` : formatHM(ms));

  const report = useMemo(() => {
    const fromKey = dayKey(from);
    const toKey = dayKey(to);
    const wanted = (pid: string | null) => project === "all" || (project === "none" ? pid === null : pid === project);
    // Same rule as everywhere else: one row per project per day, sessions summed.
    const days = rollupByDay(data.entries, now)
      .filter((d) => d.day >= fromKey && d.day < toKey)
      .map((d) => {
        const projects = d.projects
          .filter((p) => wanted(p.projectId))
          .map((p) => {
            const byType = new Map<string, number>();
            for (const s of p.sessions) byType.set(entryTypeId(s.entry), (byType.get(entryTypeId(s.entry)) ?? 0) + s.ms);
            return { ...p, byType: [...byType.entries()].sort((a, b) => b[1] - a[1]) };
          });
        // Every session of the day in time order, for the log table.
        const sessions = projects
          .flatMap((p) => p.sessions)
          .sort((a, b) => a.start.getTime() - b.start.getTime());
        return { day: d.day, projects, sessions, ms: projects.reduce((s, p) => s + p.ms, 0) };
      })
      .filter((d) => d.projects.length > 0)
      .sort((a, b) => (a.day < b.day ? -1 : 1));

    const byProject = new Map<string | null, { ms: number; billable: number; days: Set<string>; types: Map<string, number> }>();
    for (const d of days)
      for (const p of d.projects) {
        let t = byProject.get(p.projectId);
        if (!t) byProject.set(p.projectId, (t = { ms: 0, billable: 0, days: new Set(), types: new Map() }));
        t.ms += p.ms;
        t.billable += p.billableMs;
        t.days.add(d.day);
        for (const [id, ms] of p.byType) t.types.set(id, (t.types.get(id) ?? 0) + ms);
      }
    const total = days.reduce((s, d) => s + d.ms, 0);
    const billable = [...byProject.values()].reduce((s, t) => s + t.billable, 0);
    return {
      days,
      total,
      billable,
      projects: [...byProject.entries()].sort((a, b) => b[1].ms - a[1].ms),
    };
  }, [data.entries, now, from, to, project]);

  const lastDay = addDays(to, -1);
  const periodText = dayKey(from) === dayKey(lastDay) ? longDate(from) : `${shortDate(from)} – ${shortDate(lastDay)}`;
  const projectLabel = (pid: string | null) => {
    const p = projectById(pid);
    return p ? `${p.name}${p.code ? ` (${p.code})` : ""}` : "No project";
  };
  const typeSplit = (list: [string, number][]) => list.map(([id, ms]) => `${typeName(id)} ${hours(ms)}`).join(" · ");

  const step = (dir: 1 | -1) => setAnchor((a) => addDays(a, period === "day" ? dir : 7 * dir));

  /** Plain-text version, for pasting into an email or a timesheet system. */
  const asText = () => {
    const lines = [`Activity report: ${periodText}`];
    if (prefs.name) lines.push(`Prepared by: ${prefs.name}`);
    lines.push(`Total: ${hours(report.total)} (billable ${hours(report.billable)})`, "");
    for (const d of report.days) {
      lines.push(`${longDate(parseDayKey(d.day))}: ${hours(d.ms)}`);
      lines.push(`  ${d.projects.map((p) => `${projectLabel(p.projectId)} ${hours(p.ms)}`).join(" · ")}`);
      if (prefs.text !== "none")
        for (const s of d.sessions) {
          const when = prefs.times ? `${formatTime(s.start)}–${s.entry.end === null ? "now" : formatTime(s.end)}, ` : "";
          lines.push(`  - [${when}${hours(s.ms)}, ${projectLabel(s.entry.projectId)}, ${typeName(entryTypeId(s.entry))}]`);
          lines.push(`    ${(toPlain(s.entry.description) || "No description").replace(/\n/g, "\n    ")}`);
        }
      lines.push("");
    }
    return lines.join("\n");
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Your browser blocked copying. Use Save as PDF instead.");
    }
  };

  const used = new Set(data.entries.map((e) => e.projectId));
  const projectOptions = data.projects.filter((p) => !p.archived || used.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      {/* ---- controls (not printed) ---- */}
      <div className="print:hidden">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Activity report</h1>
            <p className="mt-1 text-sm text-muted">What you worked on and for how long, from the Activity you write on each session. Save it as a PDF to send or print.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-outline" onClick={copy}><Copy size={16} /> {copied ? "Copied" : "Copy as text"}</button>
            <button className="btn-primary" onClick={() => window.print()} disabled={report.days.length === 0}><Printer size={16} /> Save as PDF / Print</button>
          </div>
        </div>

        <div className="card mb-5 flex flex-wrap items-center gap-3 p-4 text-sm">
          <div className="flex rounded-xl border border-border p-1">
            {(["day", "week", "custom"] as Period[]).map((p) => (
              <button key={p} onClick={() => setPeriod(p)} className={`rounded-lg px-3 py-1.5 font-medium capitalize transition ${period === p ? "bg-accent text-white dark:text-[#140f1f]" : "text-muted hover:text-text"}`}>
                {p === "custom" ? "Dates" : p}
              </button>
            ))}
          </div>
          {period === "custom" ? (
            <span className="flex items-center gap-2">
              <input type="date" className="input py-1.5" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="From" />
              to
              <input type="date" className="input py-1.5" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="To" />
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-xl border border-border p-1">
              <button className="btn-ghost p-1.5" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft size={16} /></button>
              <span className="min-w-[190px] text-center font-medium">{periodText}</span>
              <button className="btn-ghost p-1.5" onClick={() => step(1)} aria-label="Next"><ChevronRight size={16} /></button>
            </span>
          )}
          <select className="input py-1.5" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project">
            <option value="all">All projects</option>
            <option value="none">No project</option>
            {projectOptions.map((p) => <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ""}</option>)}
          </select>
          <label className="flex items-center gap-2">
            Prepared by
            <input className="input w-40 py-1.5" value={prefs.name} onChange={(e) => change({ name: e.target.value })} placeholder="Your name" />
          </label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={prefs.times} onChange={(e) => change({ times: e.target.checked })} /> Start and end times</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={prefs.decimals} onChange={(e) => change({ decimals: e.target.checked })} /> Hours as decimals (4.50 h)</label>
          <label className="flex items-center gap-2">
            Activity text
            <select className="input py-1.5" value={prefs.text} onChange={(e) => change({ text: e.target.value as Prefs["text"] })}>
              <option value="full">Full</option>
              <option value="short">First 2 lines</option>
              <option value="none">Hide (hours only)</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={prefs.signoff} onChange={(e) => change({ signoff: e.target.checked })} /> Signature lines</label>
        </div>
      </div>

      {/* ---- the report itself: always light, like paper, so the PDF looks the same in dark mode ---- */}
      <article className="report mx-auto max-w-4xl rounded-2xl border border-border bg-white p-8 text-[#1c1a24] shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#1c1a24] pb-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Activity report</h2>
            <p className="mt-1 text-[15px]">{periodText}</p>
            {project !== "all" && <p className="text-sm text-[#5b5670]">Project: {project === "none" ? "No project" : projectLabel(project)}</p>}
          </div>
          <div className="text-right text-sm text-[#5b5670]">
            {prefs.name && <div>Prepared by <span className="font-semibold text-[#1c1a24]">{prefs.name}</span></div>}
            <div>Generated {shortDate(now)}</div>
          </div>
        </header>

        {report.days.length === 0 ? (
          <p className="py-16 text-center text-[#5b5670]">Nothing tracked in this period.</p>
        ) : (
          <>
            <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Total time" value={hours(report.total)} />
              <Stat label="Billable" value={hours(report.billable)} hint={report.total ? `${Math.round((report.billable / report.total) * 100)}% of total` : undefined} />
              <Stat label="Days worked" value={String(report.days.length)} />
              <Stat label="Projects" value={String(report.projects.length)} />
            </section>

            <section className="mt-6 break-inside-avoid">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#5b5670]">Summary by project</h3>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#d9d5e3] text-left text-xs uppercase tracking-wide text-[#5b5670]">
                    <th className="py-1.5 pr-2">Project</th>
                    <th className="py-1.5 pr-2">Types of work</th>
                    <th className="whitespace-nowrap py-1.5 pr-2 text-right">Days</th>
                    <th className="whitespace-nowrap py-1.5 pr-2 text-right">Billable</th>
                    <th className="whitespace-nowrap py-1.5 text-right">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {report.projects.map(([pid, t]) => (
                    <tr key={pid ?? "none"} className="border-b border-[#ece9f2] align-top">
                      <td className="py-1.5 pr-2">
                        <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: projectById(pid)?.color ?? NO_PROJECT_COLOR }} />
                        <span className="font-medium">{projectLabel(pid)}</span>
                        {projectById(pid)?.client && <span className="text-[#5b5670]"> · {projectById(pid)?.client}</span>}
                      </td>
                      <td className="py-1.5 pr-2 text-[#5b5670]">{typeSplit([...t.types.entries()].sort((a, b) => b[1] - a[1]))}</td>
                      <td className="tabular whitespace-nowrap py-1.5 pr-2 text-right">{t.days.size}</td>
                      <td className="tabular whitespace-nowrap py-1.5 pr-2 text-right">{t.billable ? hours(t.billable) : "–"}</td>
                      <td className="tabular whitespace-nowrap py-1.5 text-right font-semibold">{hours(t.ms)}</td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="py-2" colSpan={3}>Total</td>
                    <td className="tabular whitespace-nowrap py-2 pr-2 text-right">{hours(report.billable)}</td>
                    <td className="tabular whitespace-nowrap py-2 text-right">{hours(report.total)}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section className="mt-6">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#5b5670]">Daily log</h3>
              <div className="space-y-7">
                {report.days.map((d) => (
                  <div key={d.day}>
                    {/* Day header, then the day's split by project (one line each), then the sessions. */}
                    <div className="flex break-after-avoid items-baseline justify-between border-b-2 border-[#1c1a24] pb-1">
                      <span className="text-[15px] font-bold">{longDate(parseDayKey(d.day))}</span>
                      <span className="tabular whitespace-nowrap text-[15px] font-bold">{hours(d.ms)}</span>
                    </div>
                    <div className="mt-1.5 flex break-after-avoid flex-wrap gap-x-4 gap-y-1 text-xs text-[#5b5670]">
                      {d.projects.map((p) => (
                        <span key={String(p.projectId)} className="whitespace-nowrap">
                          <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: projectById(p.projectId)?.color ?? NO_PROJECT_COLOR }} />
                          <span className="font-semibold text-[#1c1a24]">{projectLabel(p.projectId)}</span> {hours(p.ms)}
                          {p.billableMs > 0 && <span className="text-[#047857]"> · {p.billableMs < p.ms ? "partly billable" : "billable"}</span>}
                        </span>
                      ))}
                    </div>
                    {prefs.text !== "none" && (
                      <table className="mt-2 w-full table-fixed border-collapse text-sm">
                        <colgroup>
                          {prefs.times && <col className="w-[92px]" />}
                          <col className="w-[150px]" />
                          <col />
                          <col className="w-[64px]" />
                        </colgroup>
                        <thead>
                          <tr className="text-left text-[11px] uppercase tracking-wide text-[#5b5670]">
                            {prefs.times && <th className="py-1 pr-3 font-semibold">Time</th>}
                            <th className="py-1 pr-3 font-semibold">Project</th>
                            <th className="py-1 pr-3 font-semibold">Activity</th>
                            <th className="py-1 text-right font-semibold">Hours</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.sessions.map((s) => {
                            const p = projectById(s.entry.projectId);
                            return (
                              <tr key={s.entry.id + s.day} className="break-inside-avoid border-t border-[#ece9f2] align-top">
                                {prefs.times && (
                                  <td className="tabular whitespace-nowrap py-2 pr-3 text-[#5b5670]">
                                    {formatTime(s.start)}
                                    <br />
                                    {s.entry.end === null ? "now" : formatTime(s.end)}
                                  </td>
                                )}
                                <td className="py-2 pr-3">
                                  <div className="flex items-start gap-1.5 font-medium leading-snug">
                                    <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: p?.color ?? NO_PROJECT_COLOR }} />
                                    <span className="break-words">{p?.name ?? "No project"}</span>
                                  </div>
                                  <div className="pl-3.5 text-xs text-[#5b5670]">
                                    {[p?.code, typeName(entryTypeId(s.entry))].filter(Boolean).join(" · ")}
                                  </div>
                                </td>
                                <td className="py-2 pr-3 leading-relaxed">
                                  {/* Full text wraps across the wide column and keeps your line breaks. */}
                                  {s.entry.description.trim() ? (
                                    <RichText text={s.entry.description.trim()} className={prefs.text === "short" ? "line-clamp-2" : ""} />
                                  ) : (
                                    <span className="text-[#5b5670]">No description</span>
                                  )}
                                </td>
                                <td className="tabular whitespace-nowrap py-2 text-right font-semibold">{hours(s.ms)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {prefs.signoff && (
              <section className="mt-12 grid break-inside-avoid grid-cols-2 gap-10 text-sm">
                {["Employee", "Supervisor"].map((who) => (
                  <div key={who}>
                    <div className="h-10 border-b border-[#1c1a24]" />
                    <div className="mt-1 flex justify-between text-[#5b5670]"><span>{who} signature</span><span>Date</span></div>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </article>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-[#e3e0ea] px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#5b5670]">{label}</div>
      <div className="tabular text-lg font-bold">{value}</div>
      {hint && <div className="text-xs text-[#5b5670]">{hint}</div>}
    </div>
  );
}
