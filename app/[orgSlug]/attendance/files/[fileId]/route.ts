import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Opens a participant file (D102): the database records the view (or, with
 * ?download=1, the download) and only then lets storage sign a one-minute
 * link. Someone who can't see the participant gets a 404 and nothing is
 * recorded.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/[orgSlug]/attendance/files/[fileId]">) {
  const { fileId } = await ctx.params;
  if (!UUID.test(fileId)) return new NextResponse("Not found", { status: 404 });
  const download = request.nextUrl.searchParams.get("download") === "1";

  const supabase = await createClient();
  const { data } = await supabase.rpc("open_participant_file", { file_id: fileId, download });
  const file = data?.[0];
  if (!file) return new NextResponse("Not found", { status: 404 });

  const { data: signed, error } = await supabase.storage
    .from("participant-files")
    .createSignedUrl(file.storage_path, 60, download ? { download: file.name } : undefined);
  if (error || !signed) return new NextResponse("Couldn't open the file.", { status: 502 });
  return NextResponse.redirect(signed.signedUrl, { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
