import "server-only";
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { getBackend, PREFIX, type Backend } from "./backends";

/**
 * Username + password accounts for the offline (local folder) app. Several people can share one
 * computer or one local server: each signs in with their own credentials and sees only their own data.
 *
 * - Passwords are never stored. We store a scrypt hash with a random salt; signing in re-hashes
 *   what you typed and compares the two.
 * - Being "signed in" is a cookie holding your username, an expiry date and a signature. The
 *   signature (HMAC) uses a secret that only the server knows, so nobody can forge or edit it.
 * - Changing or resetting a password bumps `sessionVersion`, which signs out that user's other devices.
 * - The first account is the admin. The admin adds the other users from Settings.
 */

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const COOKIE = "tempo_session";
const SESSION_DAYS = 30;
const MAX_FAILS = 10; // wrong passwords allowed per username...
const FAIL_WINDOW_MS = 15 * 60 * 1000; // ...within 15 minutes

export type Role = "admin" | "member";

export interface User {
  id: string;
  username: string;
  role: Role;
  hash: string; // hex
  salt: string; // hex
  sessionVersion: number;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  username: string;
  role: Role;
  createdAt: string;
}

const userKey = (username: string) => `${PREFIX}:user:${username}`;
const INDEX_KEY = `${PREFIX}:users`;
export const dataKey = (userId: string) => `${PREFIX}:user-data:${userId}`;

export const normalizeUsername = (name: string) => name.trim().toLowerCase();

/**
 * Login is on by default. Set AUTH=off to go back to a single shared, password-free tracker
 * (handy if you are the only person who ever uses this computer).
 */
export function authEnabled(backend: Backend = getBackend()): boolean {
  if (backend.kind === "redis") return true;
  return backend.kind === "file" && process.env.AUTH !== "off";
}

/**
 * Whether the login screen may create accounts: "first" when no account exists yet (that one becomes
 * the admin), "open" when ALLOW_SIGNUP=true lets anyone register, otherwise false (the admin adds people).
 */
export async function signupMode(backend: Backend = getBackend()): Promise<false | "first" | "open"> {
  if ((await backend.get(`${PREFIX}:first-user`)) === null) return "first";
  return process.env.ALLOW_SIGNUP === "true" ? "open" : false;
}

// ---- secret used to sign cookies -------------------------------------------------------

let cachedSecret: string | null = null;

/** AUTH_SECRET if set; otherwise a random secret generated once and kept in the data folder. */
async function getSecret(backend: Backend): Promise<string> {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (cachedSecret) return cachedSecret;
  const key = `${PREFIX}:auth-secret`;
  await backend.setIfMissing(key, randomBytes(32).toString("hex"));
  cachedSecret = (await backend.get<string>(key))!;
  return cachedSecret;
}

const b64url = (s: string) => Buffer.from(s).toString("base64url");
const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ---- passwords --------------------------------------------------------------------------

async function hashPassword(password: string, saltHex?: string) {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return { hash: hash.toString("hex"), salt: salt.toString("hex") };
}

async function checkPassword(user: User, password: string) {
  const { hash } = await hashPassword(password, user.salt);
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(user.hash, "hex"));
}

export function validateUsername(username: string): string | null {
  if (!/^[a-z0-9._@-]{3,40}$/.test(username))
    return "Username must be 3 to 40 characters: letters, numbers, dots, dashes, underscores or @.";
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 200) return "Password is too long.";
  return null;
}

// ---- sessions ---------------------------------------------------------------------------

async function makeCookieValue(backend: Backend, user: User) {
  const payload = b64url(
    JSON.stringify({ u: user.username, v: user.sessionVersion, exp: Date.now() + SESSION_DAYS * 864e5 }),
  );
  return `${payload}.${sign(payload, await getSecret(backend))}`;
}

export async function startSession(backend: Backend, user: User) {
  (await cookies()).set(COOKIE, await makeCookieValue(backend, user), {
    httpOnly: true, // page scripts can't read it
    sameSite: "lax", // other websites can't send it along with their requests
    // HTTPS-only on Vercel (always https). A local server is plain http, so there it's opt-in.
    secure: !!process.env.VERCEL || process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in user for this request, or null. */
export async function currentUser(backend: Backend = getBackend()): Promise<User | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload, await getSecret(backend)))) return null;
  try {
    const { u, v, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { u: string; v: number; exp: number };
    if (Date.now() > exp) return null;
    const user = await backend.get<User>(userKey(u));
    return user && user.sessionVersion === v ? user : null;
  } catch {
    return null;
  }
}

/**
 * Which key holds this request's time data. With login on, every account has its own key;
 * with AUTH=off (own computer) there is one shared file. Null when login is required but missing.
 */
export async function requestDataKey(backend: Backend): Promise<string | null> {
  if (!authEnabled(backend)) return PREFIX;
  const user = await currentUser(backend);
  return user ? dataKey(user.id) : null;
}

export const toPublic = (u: User): PublicUser => ({ id: u.id, username: u.username, role: u.role, createdAt: u.createdAt });

// ---- account actions --------------------------------------------------------------------

async function readIndex(backend: Backend) {
  return (await backend.get<string[]>(INDEX_KEY)) ?? [];
}

/**
 * Create an account. `byAdmin` skips the sign-up rule (admins can always add people).
 * The very first account becomes the admin and takes over any data saved before logins existed.
 */
export async function createUser(
  backend: Backend,
  username: string,
  password: string,
  opts: { byAdmin?: boolean; role?: Role } = {},
): Promise<User | string> {
  const err = validateUsername(username) ?? validatePassword(password);
  if (err) return err;
  if (!opts.byAdmin && !(await signupMode(backend))) return "Sign-up is closed. Ask the admin to add you in Settings.";

  const first = (await backend.get(`${PREFIX}:first-user`)) === null;
  const user: User = {
    id: randomBytes(12).toString("hex"),
    username,
    role: first ? "admin" : (opts.role ?? "member"),
    ...(await hashPassword(password)),
    sessionVersion: 1,
    createdAt: new Date().toISOString(),
  };
  if (!(await backend.setIfMissing(userKey(username), user))) return "That username is already taken.";
  const index = await readIndex(backend);
  if (!index.includes(username)) await backend.set(INDEX_KEY, [...index, username]);

  if (await backend.setIfMissing(`${PREFIX}:first-user`, user.id)) {
    const legacy = await backend.get(PREFIX); // the old single-user data/timetrack.json
    if (legacy) await backend.set(dataKey(user.id), legacy);
  }
  return user;
}

export async function verifyLogin(backend: Backend, username: string, password: string): Promise<User | string> {
  const failKey = `${PREFIX}:fails:${username}`;
  const fails = await backend.get<{ count: number; since: number }>(failKey);
  const recent = fails && Date.now() - fails.since < FAIL_WINDOW_MS ? fails : null;
  if (recent && recent.count >= MAX_FAILS) return "Too many wrong attempts. Wait 15 minutes and try again.";

  const user = await backend.get<User>(userKey(username));
  if (user && (await checkPassword(user, password))) {
    if (fails) await backend.del(failKey);
    return user;
  }
  if (!user) await hashPassword(password); // take the same time either way
  await backend.set(failKey, { count: (recent?.count ?? 0) + 1, since: recent?.since ?? Date.now() });
  // Same message whether the username exists or not, so the form can't be used to discover accounts.
  return "Wrong username or password.";
}

export async function changePassword(backend: Backend, user: User, current: string, next: string): Promise<User | string> {
  if (!(await checkPassword(user, current))) return "Your current password is wrong.";
  const err = validatePassword(next);
  if (err) return err;
  const updated: User = { ...user, ...(await hashPassword(next)), sessionVersion: user.sessionVersion + 1 };
  await backend.set(userKey(user.username), updated);
  return updated;
}

// ---- admin: manage other people ----------------------------------------------------------

export async function listUsers(backend: Backend): Promise<PublicUser[]> {
  const users = await Promise.all((await readIndex(backend)).map((n) => backend.get<User>(userKey(n))));
  return users.filter((u): u is User => !!u).map(toPublic);
}

/** Set a new password for someone who forgot theirs. Signs them out everywhere. */
export async function resetPassword(backend: Backend, username: string, next: string): Promise<string | null> {
  const user = await backend.get<User>(userKey(username));
  if (!user) return "No such user.";
  const err = validatePassword(next);
  if (err) return err;
  await backend.set(userKey(username), { ...user, ...(await hashPassword(next)), sessionVersion: user.sessionVersion + 1 });
  await backend.del(`${PREFIX}:fails:${username}`);
  return null;
}

export async function setRole(backend: Backend, username: string, role: Role): Promise<string | null> {
  const user = await backend.get<User>(userKey(username));
  if (!user) return "No such user.";
  if (user.role === "admin" && role !== "admin" && (await adminCount(backend)) <= 1) return "There must be at least one admin.";
  await backend.set(userKey(username), { ...user, role });
  return null;
}

async function adminCount(backend: Backend) {
  return (await listUsers(backend)).filter((u) => u.role === "admin").length;
}

/** Remove an account and its time data. */
export async function deleteUser(backend: Backend, actor: User, username: string): Promise<string | null> {
  if (username === actor.username) return "You can't remove your own account.";
  const user = await backend.get<User>(userKey(username));
  if (!user) return "No such user.";
  if (user.role === "admin" && (await adminCount(backend)) <= 1) return "There must be at least one admin.";
  await backend.del(userKey(username));
  await backend.del(dataKey(user.id));
  // Their daily cloud backups too (none exist in local-folder mode).
  const days = (await backend.get<string[]>(`${dataKey(user.id)}:backups`)) ?? [];
  await Promise.all([...days.map((d) => backend.del(`${dataKey(user.id)}:backup:${d}`)), backend.del(`${dataKey(user.id)}:backups`), backend.del(`${dataKey(user.id)}:ver`)]);
  await backend.set(INDEX_KEY, (await readIndex(backend)).filter((n) => n !== username));
  return null;
}
