import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, ProsePage, ProseSection } from "@/components/marketing/shell";
import { CONTACT_EMAIL } from "@/lib/maintenance";
import { createTranslator, lower } from "@/lib/terminology/t";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using Groundwork, in plain language.",
};

/** Plain-language terms of use. */
export default function TermsPage() {
  const owners = lower(createTranslator()("role.owner", "other"));
  return (
    <MarketingShell>
      <ProsePage title="Terms" lead="The terms for using Groundwork, in plain language." updated="October 14, 2026">
        <ProseSection id="agreement" title="Using Groundwork">
          <p>
            By creating an account or using Groundwork, you agree to these terms. If you use Groundwork for an organization, you&apos;re
            agreeing on its behalf, so make sure you&apos;re allowed to.
          </p>
        </ProseSection>

        <ProseSection id="accounts" title="Accounts and organizations">
          <ul>
            <li>Keep access to your email or Google account secure: that&apos;s how you sign in.</li>
            <li>An organization&apos;s {owners} decide who joins it and what each person can see, and are responsible for how their team uses it.</li>
            <li>
              If your organization records information about the people it serves, it&apos;s responsible for having their consent (or a parent
              or guardian&apos;s, for children) and for keeping that information accurate.
            </li>
          </ul>
        </ProseSection>

        <ProseSection id="content" title="Your content">
          <p>
            What you put into Groundwork stays yours. You let us store it, process it and show it to the people your organization allows, only
            so we can provide the service. How we handle personal information is explained in our{" "}
            <Link href="/privacy" className="font-semibold underline underline-offset-4">
              Privacy
            </Link>{" "}
            page.
          </p>
        </ProseSection>

        <ProseSection id="acceptable" title="Acceptable use">
          <p>Don&apos;t use Groundwork to:</p>
          <ul>
            <li>break the law or anyone else&apos;s rights, including privacy rights;</li>
            <li>upload malware, or try to get into data or accounts that aren&apos;t yours;</li>
            <li>overload, disrupt or reverse-engineer the service.</li>
          </ul>
          <p>We may suspend accounts that do, and we&apos;ll tell you why unless the law or safety prevents it.</p>
        </ProseSection>

        <ProseSection id="service" title="The service">
          <ul>
            <li>Groundwork is free to start. If we introduce paid plans, we&apos;ll tell you before anything is charged.</li>
            <li>
              We work to keep Groundwork running, but it may sometimes be unavailable, for example during maintenance, which we&apos;ll announce
              ahead of time when we can.
            </li>
            <li>Groundwork doesn&apos;t yet offer restorable backups, so keep your own copies of files you can&apos;t afford to lose.</li>
            <li>We may change or improve features over time.</li>
          </ul>
        </ProseSection>

        <ProseSection id="ending" title="Ending">
          <p>
            You can stop using Groundwork at any time, and ask us to delete your account or your organization&apos;s information by emailing{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold underline underline-offset-4">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </ProseSection>

        <ProseSection id="liability" title="Responsibility">
          <p>
            Groundwork is provided as it is. To the extent the law allows, we&apos;re not responsible for indirect losses, such as lost data,
            time or funding, from using it or not being able to use it. Nothing in these terms limits rights you have under the law that
            can&apos;t be limited.
          </p>
        </ProseSection>

        <ProseSection id="changes" title="Changes and questions">
          <p>
            If we change these terms, we&apos;ll update the date at the top and tell organization {owners} about significant changes before they
            take effect. These terms are governed by the laws that apply in Canada. Questions go to{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold underline underline-offset-4">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </ProseSection>
      </ProsePage>
    </MarketingShell>
  );
}
