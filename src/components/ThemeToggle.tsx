"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { effectiveTheme, getTheme, setTheme, type Theme } from "@/lib/theme";

/** Sun/moon button: switches between light and dark. Settings > Appearance can go back to "match my computer". */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setLocal] = useState<Theme>("system");
  const [shown, setShown] = useState<"light" | "dark">("light");

  useEffect(() => {
    const sync = () => {
      const t = getTheme();
      setLocal(t);
      setShown(effectiveTheme(t));
    };
    sync();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", sync);
    window.addEventListener("tempo:theme", sync);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("tempo:theme", sync);
    };
  }, []);

  const next = shown === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-text ${className}`}
      title={`Switch to ${next} mode${theme === "system" ? " (now matching your computer)" : ""}`}
      aria-label={`Switch to ${next} mode`}
    >
      {shown === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
