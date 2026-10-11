import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildAuthSettings,
  buildTemplateConfig,
  checkLandingPage,
  checkLoginPage,
  isAttachedDomain,
  isSkippableTemplateRefusal,
  normalizeAppUrl,
  pickProductionDomain,
  pickPublishableKey,
  pickVercelScope,
  productionRedirects,
} from "@/scripts/deploy/lib";
import { buildCsp, canonicalRedirect } from "@/lib/security";

describe("pickPublishableKey", () => {
  it("prefers the new publishable key", () => {
    const keys = [
      { name: "anon", api_key: "eyJ.anon" },
      { name: "service_role", api_key: "eyJ.service" },
      { name: "default", type: "publishable", api_key: "sb_publishable_abc" },
      { name: "default", type: "secret", api_key: "sb_secret_xyz" },
    ];
    expect(pickPublishableKey(keys)).toBe("sb_publishable_abc");
  });

  it("falls back to the legacy anon key", () => {
    expect(pickPublishableKey([{ name: "service_role", api_key: "eyJ.s" }, { name: "anon", api_key: "eyJ.a" }])).toBe("eyJ.a");
  });

  it("never returns a secret key", () => {
    expect(() => pickPublishableKey([{ name: "service_role", api_key: "eyJ.s" }])).toThrow();
    expect(() => pickPublishableKey([{ name: "anon", api_key: "sb_secret_oops" }])).toThrow(/secret/);
    expect(() => pickPublishableKey({})).toThrow();
  });
});

describe("normalizeAppUrl", () => {
  it("keeps only the https origin", () => {
    expect(normalizeAppUrl("groundwork.vercel.app")).toBe("https://groundwork.vercel.app");
    expect(normalizeAppUrl(" https://app.example.org/some/path/ ")).toBe("https://app.example.org");
  });
  it("rejects plain http", () => {
    expect(() => normalizeAppUrl("http://app.example.org")).toThrow(/https/);
  });
});

describe("Vercel domains", () => {
  const domains = [
    { name: "app.northside.org", verified: true },
    { name: "www.northside.org", verified: true, redirect: "app.northside.org" },
    { name: "groundwork-team.vercel.app", verified: true },
    { name: "groundwork-git-dev-team.vercel.app", verified: true, gitBranch: "dev" },
    { name: "dev.northside.org", verified: true, gitBranch: "dev" },
    { name: "staging.northside.org", verified: true, customEnvironmentId: "env_1" },
  ];

  it("reports the vercel.app domain, which works before custom DNS does", () => {
    expect(pickProductionDomain(domains)).toBe("groundwork-team.vercel.app");
  });

  it("falls back to a custom domain, never a branch or redirect domain", () => {
    expect(
      pickProductionDomain([
        { name: "a.example", verified: true, gitBranch: "dev" },
        { name: "b.example", verified: true, redirect: "c.example" },
        { name: "longer.example.org", verified: true },
      ]),
    ).toBe("longer.example.org");
    expect(pickProductionDomain([{ name: "x.example", verified: false }])).toBeNull();
  });

  it("allow-lists every production domain for sign-in redirects", () => {
    expect(productionRedirects(domains)).toEqual(["https://app.northside.org/**", "https://groundwork-team.vercel.app/**"]);
  });

  it("checks that APP_URL is attached to the project", () => {
    expect(isAttachedDomain(domains, "https://app.northside.org")).toBe(true);
    expect(isAttachedDomain(domains, "app.northside.org")).toBe(true);
    // www redirects to the app domain, so it can't be APP_URL
    expect(isAttachedDomain(domains, "www.northside.org")).toBe(false);
    expect(isAttachedDomain(domains, "https://typo.northside.org")).toBe(false);
  });
});

describe("buildAuthSettings: Google", () => {
  const id = "1234-abc.apps.googleusercontent.com";

  it("leaves Google alone when it isn't configured", () => {
    expect(buildAuthSettings("https://a.example")).not.toHaveProperty("external_google_enabled");
  });

  it("turns Google on with both halves of the OAuth client", () => {
    const body = buildAuthSettings("https://a.example", {}, [], { clientId: ` ${id} `, secret: "s3cret" });
    expect(body).toMatchObject({ external_google_enabled: true, external_google_client_id: id, external_google_secret: "s3cret" });
  });

  it("refuses half a configuration or a malformed client id", () => {
    expect(() => buildAuthSettings("https://a.example", {}, [], { clientId: id })).toThrow(/missing: GOOGLE_CLIENT_SECRET/);
    expect(() => buildAuthSettings("https://a.example", {}, [], { secret: "s3cret" })).toThrow(/missing: GOOGLE_CLIENT_ID/);
    expect(() => buildAuthSettings("https://a.example", {}, [], { clientId: "not-a-client", secret: "s" })).toThrow(/apps\.googleusercontent\.com/);
  });
});

describe("buildAuthSettings", () => {
  it("allows redirects only back to this app", () => {
    const body = buildAuthSettings("https://groundwork.vercel.app/");
    expect(body.site_url).toBe("https://groundwork.vercel.app");
    expect(body.uri_allow_list).toBe("https://groundwork.vercel.app/**");
    expect(body).not.toHaveProperty("smtp_host");
  });

  it("normalizes a bare domain", () => {
    expect(buildAuthSettings("app.example.org").site_url).toBe("https://app.example.org");
  });

  it("adds custom SMTP when fully configured", () => {
    const body = buildAuthSettings("https://a.example", {
      host: "smtp.resend.com",
      port: "465",
      user: "resend",
      pass: "re_secret",
      from: "hello@a.example",
    });
    expect(body).toMatchObject({ smtp_host: "smtp.resend.com", smtp_port: "465", smtp_admin_email: "hello@a.example", smtp_sender_name: "Groundwork" });
  });

  it("refuses half-configured SMTP, bad ports and a sender that isn't a plain address", () => {
    expect(() => buildAuthSettings("https://a.example", { host: "smtp.x" })).toThrow(/missing/);
    expect(() =>
      buildAuthSettings("https://a.example", { host: "h", port: "abc", user: "u", pass: "p", from: "f@x.y" }),
    ).toThrow(/port/);
    expect(() =>
      buildAuthSettings("https://a.example", { host: "h", port: "465", user: "u", pass: "p", from: "Groundwork <f@x.y>" }),
    ).toThrow(/plain email/);
  });

  it("never carries the email templates, which Supabase may refuse on their own", () => {
    const body = buildAuthSettings("https://a.example", { host: "h", port: "465", user: "u", pass: "p", from: "f@x.y" });
    expect(Object.keys(body).filter((k) => k.startsWith("mailer_") && k !== "mailer_otp_exp")).toEqual([]);
  });

  it("dedupes extra redirect URLs", () => {
    const body = buildAuthSettings("https://a.example", {}, ["https://a.example/**", "https://staging.a.example/**", ""]);
    expect(body.uri_allow_list).toBe("https://a.example/**,https://staging.a.example/**");
  });
});

describe("buildTemplateConfig", () => {
  it("installs the sign-in email templates", () => {
    const html = '<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Sign in</a>';
    const body = buildTemplateConfig({
      magicLink: { subject: "Sign in", html },
      confirmation: { subject: "Confirm", html },
    });
    expect(body).toEqual({
      mailer_subjects_magic_link: "Sign in",
      mailer_templates_magic_link_content: html,
      mailer_subjects_confirmation: "Confirm",
      mailer_templates_confirmation_content: html,
    });
  });

  it("rejects a template that doesn't carry the token hash", () => {
    expect(() => buildTemplateConfig({ magicLink: { subject: "x", html: "{{ .ConfirmationURL }}" } })).toThrow(/TokenHash/);
  });

  it("ships templates that point at /auth/confirm, on the requesting host or the Site URL", () => {
    for (const file of ["magic_link.html", "confirmation.html"]) {
      const html = readFileSync(`supabase/templates/${file}`, "utf8");
      // allow-listed redirect: back to the host the person asked from, keeping ?next=
      expect(html).toContain('<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email"');
      // Supabase swapped in the bare Site URL: link to /auth/confirm there instead
      expect(html).toContain("{{ if eq .RedirectTo .SiteURL }}");
      expect(html).toContain('<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email"');
      expect(html).not.toContain("ConfirmationURL");
    }
  });
});

describe("isSkippableTemplateRefusal", () => {
  it("skips the Free-plan refusal when Supabase's own mailer is in use", () => {
    expect(isSkippableTemplateRefusal(400, null)).toBe(true);
    expect(isSkippableTemplateRefusal(403, "")).toBe(true);
  });
  it("fails on server errors and whenever custom SMTP is in effect", () => {
    expect(isSkippableTemplateRefusal(500, null)).toBe(false);
    expect(isSkippableTemplateRefusal(400, "smtp.resend.com")).toBe(false);
  });
});

describe("pickVercelScope", () => {
  it("uses the default team, or the username on older accounts", () => {
    expect(pickVercelScope({ username: "sam", defaultTeamId: "team_abc" })).toBe("team_abc");
    expect(pickVercelScope({ username: "sam", defaultTeamId: null })).toBe("sam");
  });
  it("asks for VERCEL_SCOPE when it can't tell", () => {
    expect(() => pickVercelScope({})).toThrow(/VERCEL_SCOPE/);
    expect(() => pickVercelScope(undefined)).toThrow(/VERCEL_SCOPE/);
  });
});

describe("checkLoginPage", () => {
  it("passes a production login page", () => {
    expect(checkLoginPage(200, "<button>Email me a sign-in link</button>").ok).toBe(true);
  });
  it("fails if the dev shortcut leaked into production", () => {
    const r = checkLoginPage(200, "Email me a sign-in link <h2>Development shortcut</h2>");
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/shortcut/);
  });
});

describe("security headers", () => {
  it("allows only this app, Supabase and Stripe, with a per-request nonce", () => {
    const csp = buildCsp({ nonce: "abc123", supabaseUrl: "https://ref.supabase.co", dev: false, https: true });
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic' https://js.stripe.com");
    expect(csp).toContain("connect-src 'self' https://ref.supabase.co wss://ref.supabase.co https://api.stripe.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("unsafe-eval");
  });
  it("allows eval only in development, and upgrades requests only over https", () => {
    const csp = buildCsp({ nonce: "n", supabaseUrl: "http://127.0.0.1:54321", dev: true, https: false });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("ws://127.0.0.1:54321");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
  it("forwards only vercel.app hosts to the custom domain", () => {
    expect(canonicalRedirect("groundwork-nine-black.vercel.app", "https://yourgroundwork.ca", "/login?next=%2F")).toBe(
      "https://yourgroundwork.ca/login?next=%2F",
    );
    expect(canonicalRedirect("yourgroundwork.ca", "https://yourgroundwork.ca", "/")).toBeNull();
    expect(canonicalRedirect("www.yourgroundwork.ca", "https://yourgroundwork.ca", "/")).toBeNull();
    expect(canonicalRedirect("groundwork-nine-black.vercel.app", undefined, "/")).toBeNull();
    expect(canonicalRedirect("a.vercel.app", "https://groundwork-nine-black.vercel.app", "/")).toBeNull();
    expect(canonicalRedirect("localhost:3000", "http://localhost:3000", "/")).toBeNull();
  });
});

describe("checkLandingPage", () => {
  it("passes the landing page", () => {
    expect(checkLandingPage(200, '<h1>Run your organization on solid ground.</h1><a href="/login">Get started</a>').ok).toBe(true);
  });
  it("fails when / redirects or lost its content", () => {
    expect(checkLandingPage(307, "").problems).toHaveLength(3);
  });
});
