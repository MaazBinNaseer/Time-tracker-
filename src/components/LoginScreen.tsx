"use client";

import { useState } from "react";
import { Clock, FolderOpen, Loader2 } from "lucide-react";
import { login, signup } from "@/lib/storage";
import { chooseFolder, folderSupported } from "@/lib/storage/folder";

/**
 * Shown instead of the app when the server has login turned on and nobody is signed in.
 * The very first visit (no accounts yet) opens on "Create account"; after that, on "Sign in".
 */
export function LoginScreen({ signupOpen, onDone }: { signupOpen: false | "first" | "open"; onDone: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">(signupOpen === "first" ? "signup" : "signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSignup = mode === "signup";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSignup && password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    setError(null);
    const err = await (isSignup ? signup : login)(username, password);
    setBusy(false);
    if (err) setError(err);
    else onDone();
  };

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-sm">
      <form className="card w-full p-6" onSubmit={submit}>
        <div className="mb-5 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
            <Clock size={18} strokeWidth={2.5} />
          </span>
          <span className="text-lg font-semibold tracking-tight">Tempo</span>
        </div>
        <h1 className="text-lg font-semibold">{isSignup ? (signupOpen === "first" ? "Create the admin account" : "Create your account") : "Sign in"}</h1>
        <p className="mt-1 text-sm text-muted">
          {isSignup
            ? signupOpen === "first"
              ? "This is the first account, so it becomes the admin. You can add other people later in Settings."
              : "Your time data is kept separate from everyone else's."
            : "Each person signs in with their own username and sees only their own time."}
        </p>

        <label className="mt-5 block text-sm font-medium" htmlFor="username">Username</label>
        <input id="username" className="input mt-1 w-full" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus
          value={username} onChange={(e) => setUsername(e.target.value)} />

        <label className="mt-3 block text-sm font-medium" htmlFor="password">Password</label>
        <input id="password" className="input mt-1 w-full" type="password" required minLength={isSignup ? 8 : undefined}
          autoComplete={isSignup ? "new-password" : "current-password"}
          value={password} onChange={(e) => setPassword(e.target.value)} />
        {isSignup && <p className="mt-1 text-xs text-muted">At least 8 characters.</p>}

        {isSignup && (
          <>
            <label className="mt-3 block text-sm font-medium" htmlFor="confirm">Repeat password</label>
            <input id="confirm" className="input mt-1 w-full" type="password" required autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </>
        )}

        {!isSignup && !signupOpen && (
          <p className="mt-3 text-xs text-muted">No account yet? Ask the admin to add you in Settings, Users.</p>
        )}

        {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}

        <button className="btn-primary mt-5 w-full justify-center" type="submit" disabled={busy}>
          {busy && <Loader2 size={16} className="animate-spin" />}
          {isSignup ? "Create account" : "Sign in"}
        </button>

        {signupOpen === "open" && (
          <p className="mt-4 text-center text-sm text-muted">
            {isSignup ? "Already have an account? " : "New here? "}
            <button type="button" className="font-medium text-accent hover:underline"
              onClick={() => { setMode(isSignup ? "signin" : "signup"); setError(null); }}>
              {isSignup ? "Sign in" : "Create an account"}
            </button>
          </p>
        )}
      </form>
      <FolderChoice onDone={onDone} />
      </div>
    </div>
  );
}

/**
 * The alternative to an account: keep everything in a folder on this computer (nothing is sent
 * to the server). Picking a folder that OneDrive, Google Drive or Dropbox syncs gives syncing too.
 */
function FolderChoice({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const supported = folderSupported();
  return (
    <div className="card mt-4 p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><FolderOpen size={18} /></span>
        <div className="text-sm">
          <div className="font-medium">Or keep your data on this computer</div>
          <p className="mt-0.5 text-muted">
            No account needed. Your time is saved as a file in a folder you choose and never leaves this computer.
            To sync between computers, choose a folder inside OneDrive, Google Drive or Dropbox.
          </p>
        </div>
      </div>
      {supported ? (
        <button
          type="button"
          className="btn-outline mt-4 w-full justify-center"
          onClick={async () => {
            setError(null);
            const err = await chooseFolder();
            if (err) setError(err);
            else onDone();
          }}
        >
          <FolderOpen size={16} /> Use a folder on this computer
        </button>
      ) : (
        <p className="mt-3 text-xs text-muted">This needs Edge or Chrome on a computer. Phones, Safari and Firefox can&apos;t save to a folder.</p>
      )}
      {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}

/** After a browser restart the folder permission must be granted again, which needs a click. */
export function FolderReconnect({ name, reconnect, onDone }: { name: string; reconnect: () => Promise<boolean>; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
            <Clock size={18} strokeWidth={2.5} />
          </span>
          <span className="text-lg font-semibold tracking-tight">Tempo</span>
        </div>
        <h1 className="text-lg font-semibold">Open your Tempo folder</h1>
        <p className="mt-1 text-sm text-muted">
          Your data is in the folder <span className="font-medium text-text">{name}</span>. For your safety the browser asks once
          after it restarts before Tempo may use it again. Click below, then choose <span className="font-medium text-text">Allow</span>.
        </p>
        <button
          className="btn-primary mt-5 w-full justify-center"
          onClick={async () => {
            if (await reconnect()) onDone();
            else setError("The browser didn't allow it. Click again and choose Allow (or \"Allow on every visit\").");
          }}
        >
          <FolderOpen size={16} /> Open {name}
        </button>
        <button
          className="mt-3 w-full text-center text-sm text-muted hover:underline"
          onClick={async () => {
            if (!(await chooseFolder())) onDone();
          }}
        >
          Use a different folder
        </button>
        {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
      </div>
    </div>
  );
}
