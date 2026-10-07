import { describe, expect, it } from "vitest";
import {
  buildAuthConfig,
  checkLoginPage,
  isAttachedDomain,
  normalizeAppUrl,
  pickProductionDomain,
  pickPublishableKey,
  productionRedirects,
} from "@/scripts/deploy/lib";

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
    expect(isAttachedDomain(domains, "www.northside.org")).toBe(true);
    expect(isAttachedDomain(domains, "https://typo.northside.org")).toBe(false);
  });
});

describe("buildAuthConfig", () => {
  it("allows redirects only back to this app", () => {
    const body = buildAuthConfig("https://groundwork.vercel.app/");
    expect(body.site_url).toBe("https://groundwork.vercel.app");
    expect(body.uri_allow_list).toBe("https://groundwork.vercel.app/**");
    expect(body).not.toHaveProperty("smtp_host");
  });

  it("adds custom SMTP when fully configured", () => {
    const body = buildAuthConfig("https://a.example", {
      host: "smtp.resend.com",
      port: "465",
      user: "resend",
      pass: "re_secret",
      from: "hello@a.example",
    });
    expect(body).toMatchObject({ smtp_host: "smtp.resend.com", smtp_port: "465", smtp_admin_email: "hello@a.example", smtp_sender_name: "Groundwork" });
  });

  it("refuses half-configured SMTP and bad ports", () => {
    expect(() => buildAuthConfig("https://a.example", { host: "smtp.x" })).toThrow(/missing/);
    expect(() =>
      buildAuthConfig("https://a.example", { host: "h", port: "abc", user: "u", pass: "p", from: "f@x.y" }),
    ).toThrow(/port/);
  });

  it("installs the sign-in email templates", () => {
    const html = '<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Sign in</a>';
    const body = buildAuthConfig("https://a.example", {}, [], {
      magicLink: { subject: "Sign in", html },
      confirmation: { subject: "Confirm", html },
    });
    expect(body).toMatchObject({
      mailer_subjects_magic_link: "Sign in",
      mailer_templates_magic_link_content: html,
      mailer_subjects_confirmation: "Confirm",
      mailer_templates_confirmation_content: html,
    });
  });

  it("rejects a template that doesn't carry the token hash", () => {
    expect(() => buildAuthConfig("https://a.example", {}, [], { magicLink: { subject: "x", html: "{{ .ConfirmationURL }}" } })).toThrow(
      /TokenHash/,
    );
  });

  it("ships templates that point at /auth/confirm through the redirect URL", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of ["magic_link.html", "confirmation.html"]) {
      const html = readFileSync(`supabase/templates/${file}`, "utf8");
      expect(html).toContain("{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email");
      expect(html).not.toContain("ConfirmationURL");
    }
  });

  it("dedupes extra redirect URLs", () => {
    const body = buildAuthConfig("https://a.example", {}, ["https://a.example/**", "https://staging.a.example/**", ""]);
    expect(body.uri_allow_list).toBe("https://a.example/**,https://staging.a.example/**");
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
