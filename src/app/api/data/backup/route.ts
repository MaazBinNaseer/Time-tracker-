import { NextResponse } from "next/server";
import { getBackend } from "@/lib/server/backends";
import { requestDataKey } from "@/lib/server/auth";
import { readCloudBackup } from "@/lib/server/backup";

export const dynamic = "force-dynamic";

/** Download one of your own daily cloud backups: /api/data/backup?day=YYYY-MM-DD */
export async function GET(req: Request) {
  const backend = getBackend();
  if (backend.kind !== "redis") return NextResponse.json({ error: "Only for the cloud database." }, { status: 400 });
  const key = await requestDataKey(backend);
  if (!key) return NextResponse.json({ error: "login required" }, { status: 401 });
  const day = new URL(req.url).searchParams.get("day") ?? "";
  const data = await readCloudBackup(backend, key, day);
  if (!data) return NextResponse.json({ error: "No backup for that day." }, { status: 404 });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="tempo-backup-${day}.json"`,
    },
  });
}
