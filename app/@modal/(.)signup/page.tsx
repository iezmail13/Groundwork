import { redirect } from "next/navigation";
import { RouteModal } from "@/components/auth/route-modal";
import { SignInPanel } from "@/components/auth/sign-in-panel";
import { createClient } from "@/lib/supabase/server";

/** "Start free" from a public page: the same form as /signup, in a modal over the page (D117). */
export default async function SignupModal() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user && !data.user.is_anonymous) redirect("/");

  return (
    <RouteModal labelledBy="signup-modal-title">
      <SignInPanel mode="signup" titleId="signup-modal-title" heading="h2" inModal />
    </RouteModal>
  );
}
