import { addDays, startOfDay } from "./time";
import type { AppData, Project, TimeEntry } from "./types";

/** Two weeks of believable sample data, so the dashboard has something to show. */
export function demoData(): AppData {
  const projects: Project[] = [
    { id: "p-web", name: "Website redesign", client: "Acme", code: "ACM-WEB", billable: true, color: "#2a78d6", createdAt: new Date().toISOString() },
    { id: "p-app", name: "Mobile app", client: "Acme", code: "ACM-APP", billable: true, color: "#eb6834", createdAt: new Date().toISOString() },
    { id: "p-learn", name: "Learning", code: "LRN", color: "#1baf7a", createdAt: new Date().toISOString() },
    { id: "p-admin", name: "Admin & email", code: "ADM", color: "#eda100", createdAt: new Date().toISOString() },
  ];
  const plan: [string, string, number, number][] = [
    // projectId, description, start hour, length in minutes
    ["p-admin", "Inbox", 9, 30],
    ["p-web", "Homepage layout", 9.5, 110],
    ["p-app", "Login screen", 11.5, 70],
    ["p-web", "Review with client", 14, 45],
    ["p-learn", "Next.js course", 15, 50],
    ["p-web", "Fix navbar bugs", 16, 75],
  ];
  const entries: TimeEntry[] = [];
  const today = startOfDay(new Date());
  for (let d = 13; d >= 1; d--) {
    const day = addDays(today, -d);
    if (day.getDay() === 0) continue; // Sundays off
    plan.forEach(([projectId, description, hour, mins], i) => {
      if ((d + i) % 4 === 0) return; // vary the days a bit
      const start = new Date(day.getTime() + hour * 3_600_000 + ((d * 7) % 20) * 60_000);
      const end = new Date(start.getTime() + (mins + ((d * 13 + i * 7) % 30) - 15) * 60_000);
      entries.push({ id: `demo-${d}-${i}`, projectId, description, billable: projectId === "p-web" || projectId === "p-app", start: start.toISOString(), end: end.toISOString() });
    });
  }
  return { version: 1, projects, entries, updatedAt: new Date().toISOString() };
}
