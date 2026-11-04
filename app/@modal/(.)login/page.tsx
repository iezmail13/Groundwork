import { redirect } from "next/navigation";
import { RouteModal } from "@/components/auth/route-modal";
import { SignInPanel, signInError } from "@/components/auth/sign-in-panel";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

/** "Log in" from a public page: the same sign-in as /login, in a modal over the page (D117). */
export default async function LoginModal({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : undefined);
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user && !data.user.is_anonymous) redirect(next);

  return (
    <RouteModal labelledBy="signin-modal-title">
      <SignInPanel mode="login" next={next} error={signInError(params.error)} titleId="signin-modal-title" heading="h2" inModal />
    </RouteModal>
  );
}
