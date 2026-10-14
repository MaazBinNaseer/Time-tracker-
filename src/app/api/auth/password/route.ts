import { NextResponse } from "next/server";
import { getBackend } from "@/lib/server/backends";
import { changePassword, currentUser, startSession } from "@/lib/server/auth";

/** Change password. Signs out every other device; this one gets a fresh cookie. */
export async function POST(req: Request) {
  const backend = getBackend();
  const user = await currentUser(backend);
  if (!user) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  const { current, next } = (await req.json().catch(() => ({}))) as { current?: string; next?: string };
  const result = await changePassword(backend, user, String(current ?? ""), String(next ?? ""));
  if (typeof result === "string") return NextResponse.json({ error: result }, { status: 400 });
  await startSession(backend, result);
  return NextResponse.json({ ok: true });
}
