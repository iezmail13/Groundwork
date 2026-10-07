import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Redirects to a short-lived signed URL. RLS decides whether the row is visible. */
export async function GET(request: NextRequest, ctx: RouteContext<"/[orgSlug]/documents/[documentId]/download">) {
  const { documentId } = await ctx.params;
  if (!UUID.test(documentId)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("name, storage_path").eq("id", documentId).maybeSingle();
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const inline = request.nextUrl.searchParams.get("inline") === "1";
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(doc.storage_path, 60, inline ? undefined : { download: doc.name });
  if (error || !data) return new NextResponse("Couldn't create a download link.", { status: 502 });
  return NextResponse.redirect(data.signedUrl, { status: 303 });
}
