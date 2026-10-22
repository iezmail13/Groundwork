import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth/auth-frame";
import { DemoForm } from "@/components/demo/demo-form";
import { createClient } from "@/lib/supabase/server";
import { turnstileSiteKey } from "@/lib/demo";
import { createTranslator, lower } from "@/lib/terminology/t";

export const metadata: Metadata = { title: "Try the demo" };

/**
 * The public demo (D115): no account or email. Each visitor gets their own
 * private copy of a sample organization for two hours; nobody else sees it,
 * and it's deleted, with the temporary sign-in, when it ends.
 */
export default async function DemoPage({ searchParams }: PageProps<"/demo">) {
  const params = await searchParams;
  const t = createTranslator();
  const ended = params.ended === "1";
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user && !data.user.is_anonymous) redirect("/");
  if (data.user?.is_anonymous && !ended) {
    const { data: live } = await supabase.from("organizations").select("slug").not("demo_expires_at", "is", null).maybeSingle();
    if (live) redirect(`/${live.slug}/dashboard`);
  }

  return (
    <AuthFrame
      title={ended ? "Your demo has ended" : "Try Groundwork"}
      subtitle={
        ended
          ? "Everything in it has been deleted. Start another whenever you like."
          : `Look around a sample organization as its ${lower(t("role.owner"))}. No account or email needed.`
      }
    >
      {ended ? null : (
        <ul className="mb-6 flex list-disc flex-col gap-1.5 pl-5 text-ink-muted">
          <li>You get your own private copy. Nobody else can see it or change it.</li>
          <li>It lasts two hours. When it ends, everything in it is deleted.</li>
          <li>Inviting people, uploading files and sharing links are off in the demo.</li>
        </ul>
      )}
      <DemoForm siteKey={turnstileSiteKey()} again={ended} />
      <p className="mt-6 text-sm text-ink-muted">
        Ready to use it with your team?{" "}
        <Link href="/signup" className="font-semibold text-accent underline underline-offset-2">
          Start free
        </Link>
      </p>
    </AuthFrame>
  );
}
