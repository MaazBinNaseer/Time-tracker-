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
  typeId?: string; // kind of work (see WorkType); missing = the default type, Office work
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
  /** Your list of work types. Missing until you first edit it, then DEFAULT_WORK_TYPES is used. */
  workTypes?: WorkType[];
  /** ids of deleted projects/entries -> when, so a merge doesn't bring them back */
  deleted?: Record<string, string>;
  settings?: Settings;
  updatedAt: string;
}

/**
 * The kind of work a session was (Office work, Fieldwork, Meeting, ...). Separate from the project:
 * the project says who the time is for, the type says what you were doing.
 */
export interface WorkType {
  id: string;
  name: string;
  color: string;
  /** Short examples shown when hovering the type, e.g. "Site inspection, surveying". */
  hint?: string;
  /** What picking this type does to the Billable switch: always yes, always no, or follow the project. */
  billable: "yes" | "no" | "project";
  updatedAt?: string;
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

/** Starter list, modelled on what Harvest, Jibble and engineering timesheets offer. Editable in Settings. */
export const DEFAULT_TYPE_ID = "type-office";
export const DEFAULT_WORK_TYPES: WorkType[] = [
  { id: DEFAULT_TYPE_ID, name: "Office work", color: PROJECT_COLORS[0], hint: "Drafting, calculations, reports", billable: "project" },
  { id: "type-field", name: "Fieldwork", color: PROJECT_COLORS[1], hint: "Site inspection, surveying, sampling", billable: "project" },
  { id: "type-travel", name: "Travel", color: PROJECT_COLORS[2], hint: "Driving to and from site", billable: "project" },
  { id: "type-meeting", name: "Meeting", color: PROJECT_COLORS[3], hint: "Client call, HR meeting, team meeting", billable: "project" },
  { id: "type-admin", name: "Admin", color: PROJECT_COLORS[4], hint: "Timesheets, email, filing", billable: "no" },
  { id: "type-training", name: "Training", color: PROJECT_COLORS[5], hint: "Courses, safety induction", billable: "no" },
  { id: "type-leave", name: "Leave / Time off", color: PROJECT_COLORS[6], hint: "Holiday, sick day", billable: "no" },
  { id: "type-other", name: "Other", color: PROJECT_COLORS[7], hint: "Anything else", billable: "no" },
];

export const workTypesOf = (d: Pick<AppData, "workTypes">): WorkType[] => d.workTypes ?? DEFAULT_WORK_TYPES;
export const entryTypeId = (e: Pick<TimeEntry, "typeId">) => e.typeId ?? DEFAULT_TYPE_ID;
