/** A thing you spend time on (a client project, a course, "Admin", ...). */
export interface Project {
  id: string;
  name: string;
  color: string; // hex colour used in the UI and charts
  client?: string;
  code?: string; // short project/job code, e.g. "ACME-001"
  billable?: boolean; // default for new sessions on this project
  archived?: boolean;
  createdAt: string; // ISO timestamp
  updatedAt?: string; // last change, used to merge edits made in two windows
}

/**
 * One continuous work session. A running timer is an entry whose `end` is null.
 * Several entries on the same project and day are rolled up into one daily
 * total by the aggregation helpers in `lib/time.ts`.
 */
export interface TimeEntry {
  id: string;
  projectId: string | null; // null = "No project"
  description: string; // the "Activity" text
  billable?: boolean;
  start: string; // ISO timestamp
  end: string | null; // ISO timestamp, null while running
  updatedAt?: string; // last change, used to merge edits made in two windows
}

/** Everything the app stores. Saved and loaded as one JSON document. */
export interface AppData {
  version: 1;
  projects: Project[];
  entries: TimeEntry[];
  /** ids of deleted projects/entries -> when, so a merge doesn't bring them back */
  deleted?: Record<string, string>;
  settings?: Settings;
  updatedAt: string;
}

export interface Settings {
  /** Warn when a running timer passes this many hours (0 = never). Default 10. */
  longTimerHours?: number;
}

export const emptyData = (): AppData => ({
  version: 1,
  projects: [],
  entries: [],
  updatedAt: new Date(0).toISOString(),
});

// Colourblind-checked categorical order: neighbouring projects stay distinguishable.
export const PROJECT_COLORS = [
  "#2a78d6", "#eb6834", "#1baf7a", "#eda100",
  "#e87ba4", "#008300", "#6250d6", "#e34948",
];

export const NO_PROJECT_COLOR = "#94a3b8";
