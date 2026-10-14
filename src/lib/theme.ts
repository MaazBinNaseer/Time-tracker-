/**
 * Light / dark switch. "system" follows the computer's setting. The choice is kept per browser
 * (localStorage) and applied as data-theme on <html>; globals.css does the rest.
 */
export type Theme = "system" | "light" | "dark";
const KEY = "tempo:theme";

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function setTheme(t: Theme) {
  try {
    if (t === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {}
  if (t === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  window.dispatchEvent(new Event("tempo:theme"));
}

/** What is showing right now, after "system" is resolved. */
export const effectiveTheme = (t: Theme): "light" | "dark" =>
  t !== "system" ? t : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

/** Runs before the page paints, so a saved choice doesn't flash the other theme first. */
export const themeBootScript = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
