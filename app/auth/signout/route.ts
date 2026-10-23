import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  // signing out of a demo ends it: its organization and temporary account are deleted (D115)
  const { data } = await supabase.auth.getUser();
  if (data.user?.is_anonymous) await supabase.rpc("end_demo");
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.nextUrl.origin), { status: 303 });
}
