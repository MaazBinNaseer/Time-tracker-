import { NextResponse } from "next/server";
import { getBackend } from "@/lib/server/backends";
import { authEnabled, currentUser, signupMode, toPublic } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** Tells the page whether login is needed and who is logged in. */
export async function GET() {
  const backend = getBackend();
  if (!authEnabled(backend)) return NextResponse.json({ backend: backend.kind, authEnabled: false, user: null });
  try {
    const user = await currentUser(backend);
    return NextResponse.json({
      backend: backend.kind,
      authEnabled: true,
      user: user ? toPublic(user) : null,
      signupOpen: user ? false : await signupMode(backend),
    });
  } catch (err) {
    return NextResponse.json({ backend: backend.kind, error: String(err) }, { status: 500 });
  }
}
