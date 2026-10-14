import type { Metadata } from "next";
import { MarketingShell, ProsePage, ProseSection } from "@/components/marketing/shell";
import { CONTACT_EMAIL } from "@/lib/maintenance";
import { createTranslator, lower } from "@/lib/terminology/t";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Groundwork collects, why, who can see it, how long it's kept and how to have it deleted.",
};

const mail = (
  <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold underline underline-offset-4">
    {CONTACT_EMAIL}
  </a>
);

/** A plain-language privacy policy written for Canada's PIPEDA. */
export default function PrivacyPage() {
  const t = createTranslator();
  const owners = lower(t("role.owner", "other"));
  return (
    <MarketingShell>
      <ProsePage
        title="Privacy"
        lead="What Groundwork collects, why, who can see it, how long it's kept, and how to have it deleted. Written for Canada's federal private-sector privacy law (PIPEDA)."
        updated="October 14, 2026"
      >
        <ProseSection id="who-we-are" title="Who we are">
          <p>
            Groundwork is a workplace tool for youth and community organizations. In this policy, &ldquo;we&rdquo; means Groundwork, and
            &ldquo;you&rdquo; means anyone who uses it. Questions about privacy go to {mail}.
          </p>
          <p>
            Organizations decide what they put into Groundwork. For information an organization enters about the people it serves, that
            organization is responsible for having their consent; we store and protect it on the organization&apos;s behalf.
          </p>
        </ProseSection>

        <ProseSection id="collect" title="What we collect">
          <ul>
            <li>
              <strong>Your account:</strong> your email address and your name. If you sign in with Google, Google tells us your email address
              and name.
            </li>
            <li>
              <strong>What your organization puts in:</strong> the work, dates, files and notes your team adds, and who added or changed them.
            </li>
            <li>
              <strong>Information about the people your organization serves</strong>, if your organization records it: names, contact details,
              date of birth, parent or guardian, emergency contact, medical and accessibility notes, and {lower(t("section.attendance"))}.
            </li>
            <li>
              <strong>A few small cookies</strong> that make the site work: one that keeps you signed in, and others that remember your time
              zone, your last-used organization and whether the sidebar is collapsed. We don&apos;t use advertising or tracking cookies.
            </li>
            <li>
              <strong>Technical records</strong> our hosting providers keep, such as IP addresses and request logs, to run and protect the service.
            </li>
          </ul>
        </ProseSection>

        <ProseSection id="why" title="Why we use it">
          <p>
            Only to provide Groundwork: to sign you in, show your organization its own information, send sign-in emails, keep the service
            secure, and answer you when you contact us. We don&apos;t sell personal information, and we don&apos;t use it for advertising.
          </p>
        </ProseSection>

        <ProseSection id="who-sees" title="Who can see it">
          <p>
            Inside your organization, people see what their role and the {lower(t("project", "other"))} they&apos;re on allow, as described on
            our Security page. Information about the people your organization serves is limited to the organization&apos;s {owners} and the{" "}
            {lower(t("project_role.admin", "other"))} and {lower(t("project_role.lead", "other"))} of the {lower(t("project", "other"))} those
            people are in.
          </p>
          <p>We use these service providers to run Groundwork:</p>
          <ul>
            <li>Supabase stores the data and files and handles sign-in, in its US East region in the United States.</li>
            <li>Vercel serves the website and app.</li>
            <li>Google provides Google sign-in, and its email service sends our sign-in emails.</li>
          </ul>
          <p>
            Because these providers are in the United States, your information is stored and processed there and may be accessible to
            authorities under United States law.
          </p>
        </ProseSection>

        <ProseSection id="retention" title="How long we keep it, and deleting it">
          <ul>
            <li>We keep your organization&apos;s information while it uses Groundwork.</li>
            <li>
              When someone leaves an organization, their account stays theirs, and the organization keeps the record of the work they did.
            </li>
            <li>
              An organization can archive a person it serves, which hides them but keeps their history, or delete them permanently, which
              erases their details and notes and keeps their past {lower(t("section.attendance"))} only as anonymous counts.
            </li>
            <li>To delete your account, or all of your organization&apos;s information, email us at {mail} and we&apos;ll confirm when it&apos;s done.</li>
          </ul>
        </ProseSection>

        <ProseSection id="rights" title="Your rights">
          <p>
            You can ask to see the personal information we hold about you, to have it corrected, or to withdraw your consent, by emailing{" "}
            {mail}. If the information was entered by an organization, we&apos;ll work with that organization to answer you. If you&apos;re not
            satisfied with our answer, you can complain to the Office of the Privacy Commissioner of Canada.
          </p>
        </ProseSection>

        <ProseSection id="changes" title="Changes to this policy">
          <p>
            If we change this policy, we&apos;ll update the date at the top. For significant changes, we&apos;ll tell organization {owners} before
            they take effect.
          </p>
        </ProseSection>
      </ProsePage>
    </MarketingShell>
  );
}
