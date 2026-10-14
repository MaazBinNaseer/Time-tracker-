import type { WorkType } from "@/lib/types";

/** Small "● Fieldwork" label for a session's type of work. */
export function TypeTag({ type }: { type: WorkType | undefined }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: type?.color ?? "#94a3b8" }} />
      {type?.name ?? "Removed type"}
    </span>
  );
}
