import { NextResponse } from "next/server";
import { getBackend } from "@/lib/server/backends";
import { authEnabled, normalizeUsername, startSession, toPublic, verifyLogin } from "@/lib/server/auth";

export async function POST(req: Request) {
  const backend = getBackend();
  if (!authEnabled(backend)) return NextResponse.json({ error: "Login is not enabled." }, { status: 400 });
  const { username, password } = (await req.json().catch(() => ({}))) as { username?: string; password?: string };
  const result = await verifyLogin(backend, normalizeUsername(String(username ?? "")), String(password ?? ""));
  if (typeof result === "string") return NextResponse.json({ error: result }, { status: 401 });
  await startSession(backend, result);
  return NextResponse.json({ user: toPublic(result) });
}
