"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, Clock, Cloud, FileText, FolderKanban, FolderOpen, HardDrive, Loader2, LogOut, Monitor, Settings } from "lucide-react";
import { useStore } from "./StoreProvider";
import { EntryDialogProvider } from "./EntryDialog";
import { TimerBar } from "./TimerBar";

const NAV = [
  { href: "/", label: "Timer", icon: Clock },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { ready, adapter, saveState, user, signOut } = useStore();
  const StorageIcon = adapter?.kind === "redis" ? Cloud : adapter?.kind === "folder" ? FolderOpen : adapter?.kind === "file" ? HardDrive : Monitor;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen print:!hidden w-60 shrink-0 flex-col bg-sidebar px-3 py-5 text-sidebar-text md:flex">
        <Link href="/" className="mb-8 flex items-center gap-2.5 px-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
            <Clock size={18} strokeWidth={2.5} />
          </span>
          <span className="text-lg font-semibold tracking-tight text-white">Tempo</span>
        </Link>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-xl bg-white/5 px-3 py-3 text-xs">
          <div className="flex items-center gap-2 font-medium text-white">
            <StorageIcon size={14} />
            {adapter?.kind === "redis" ? "Cloud sync" : adapter?.kind === "folder" ? `Folder: ${adapter.folderName}` : adapter?.kind === "file" ? "Local folder" : "This browser"}
          </div>
          <div className="mt-1 flex items-center gap-1.5 opacity-80">
            {saveState === "saving" && <Loader2 size={12} className="animate-spin" />}
            {saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed, will retry on next change" : "All changes saved"}
          </div>
          {user && (
            <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
              <span className="min-w-0 flex-1 truncate" title={user.username}>{user.username}{user.role === "admin" && <span className="ml-1.5 rounded bg-white/10 px-1 py-px text-[10px] uppercase tracking-wide">admin</span>}</span>
              <button onClick={signOut} title="Sign out" aria-label="Sign out" className="rounded-md p-1 hover:bg-white/10 hover:text-white">
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        {ready ? (
          <EntryDialogProvider>
            <TimerBar />
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 print:max-w-none print:p-0">{children}</main>
          </EntryDialogProvider>
        ) : (
          <div className="grid flex-1 place-items-center text-muted">
            <Loader2 className="animate-spin" />
          </div>
        )}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex print:hidden border-t border-border bg-surface md:hidden">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${active ? "text-accent" : "text-muted"}`}
            >
              <Icon size={20} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
