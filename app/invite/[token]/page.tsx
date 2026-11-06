import type { Metadata } from "next";
import Link from "next/link";
import { AuthFrame } from "@/components/auth/auth-frame";
import { LoginForm } from "@/components/auth/login-form";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { isPast } from "@/lib/dates";
import { googleSignInEnabled } from "@/lib/demo";
import { createTranslator } from "@/lib/terminology/t";

export const metadata: Metadata = { title: "Invitation" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const supabase = await createClient();
  const [{ data: invites }, { data: auth }] = await Promise.all([
    supabase.rpc("get_invitation", { token }),
    supabase.auth.getUser(),
  ]);
  const invite = invites?.[0];
  // the organization's own labels aren't readable before joining, so the defaults
  const t = createTranslator();

  if (!invite) {
    return (
      <AuthFrame title="Invitation not found" subtitle="This link is invalid or the invitation was withdrawn.">
        <p className="text-ink-muted">Ask the person who invited you to send a new link.</p>
      </AuthFrame>
    );
  }

  const expired = isPast(invite.expires_at);
  const title = `Join ${invite.organization_name}`;
  const user = auth.user;

  if (invite.accepted_at) {
    return (
      <AuthFrame title={title} subtitle="This invitation has already been accepted.">
        <Link className="text-accent underline underline-offset-4" href={user ? `/${invite.organization_slug}/dashboard` : "/login"}>
          {user ? `Go to ${invite.organization_name}` : "Sign in"}
        </Link>
      </AuthFrame>
    );
  }

  if (expired) {
    return (
      <AuthFrame title={title} subtitle="This invitation has expired.">
        <p className="text-ink-muted">Ask the person who invited you to {invite.organization_name} to send a new invitation.</p>
      </AuthFrame>
    );
  }

  if (!user) {
    return (
      <AuthFrame
        title={title}
        subtitle={`You've been invited with the ${t(`role.${invite.role}`)} role. Sign in with ${invite.email} to accept.`}
      >
        <LoginForm next={`/invite/${token}`} defaultEmail={invite.email} google={googleSignInEnabled()} />
      </AuthFrame>
    );
  }

  if ((user.email ?? "").toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <AuthFrame title={title} subtitle={`This invitation was sent to ${invite.email}, but you're signed in as ${user.email}.`}>
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="secondary">
            Sign out and switch account
          </Button>
        </form>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title={title} subtitle={`You're signed in as ${user.email}.`}>
      <AcceptInviteForm token={token} orgName={invite.organization_name} />
    </AuthFrame>
  );
}
