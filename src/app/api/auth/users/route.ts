import { NextResponse } from "next/server";
import { getBackend } from "@/lib/server/backends";
import {
  authEnabled, createUser, currentUser, deleteUser, listUsers, normalizeUsername, resetPassword, setRole, toPublic,
  type Role,
} from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** Admin-only user management: list, add, reset password / change role, remove. */
async function requireAdmin() {
  const backend = getBackend();
  if (!authEnabled(backend)) return { error: NextResponse.json({ error: "Login is not enabled." }, { status: 400 }) };
  const user = await currentUser(backend);
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  if (user.role !== "admin") return { error: NextResponse.json({ error: "Only an admin can manage users." }, { status: 403 }) };
  return { backend, user };
}

type Body = { username?: string; password?: string; role?: Role };
const read = async (req: Request) => (await req.json().catch(() => ({}))) as Body;

export async function GET() {
  const a = await requireAdmin();
  if ("error" in a) return a.error;
  return NextResponse.json({ users: await listUsers(a.backend) });
}

export async function POST(req: Request) {
  const a = await requireAdmin();
  if ("error" in a) return a.error;
  const { username, password, role } = await read(req);
  const result = await createUser(a.backend, normalizeUsername(String(username ?? "")), String(password ?? ""), {
    byAdmin: true,
    role: role === "admin" ? "admin" : "member",
  });
  if (typeof result === "string") return NextResponse.json({ error: result }, { status: 400 });
  return NextResponse.json({ user: toPublic(result) });
}

export async function PATCH(req: Request) {
  const a = await requireAdmin();
  if ("error" in a) return a.error;
  const { username, password, role } = await read(req);
  const name = normalizeUsername(String(username ?? ""));
  const err = password ? await resetPassword(a.backend, name, password) : role ? await setRole(a.backend, name, role) : "Nothing to change.";
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const a = await requireAdmin();
  if ("error" in a) return a.error;
  const { username } = await read(req);
  const err = await deleteUser(a.backend, a.user, normalizeUsername(String(username ?? "")));
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  return NextResponse.json({ ok: true });
}
