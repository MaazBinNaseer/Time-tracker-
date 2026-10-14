import { ProjectDot } from "./ProjectPicker";

export function Kpi({ label, value, hint, dot }: { label: string; value: string; hint?: string; dot?: string }) {
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
