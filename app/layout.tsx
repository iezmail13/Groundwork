import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Archivo, Source_Sans_3 } from "next/font/google";
import { THEME_COOKIE, parseThemeMode } from "@/lib/theme/mode";
import { deriveTokens } from "@/lib/theme/theme";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap" });
const sourceSans = Source_Sans_3({ subsets: ["latin"], variable: "--font-source-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Groundwork", template: "%s · Groundwork" },
  description: "One central place for your team's work, files and calendar.",
  icons: {
    icon: [
      { url: "/brand/icon-light.png", type: "image/png", media: "(prefers-color-scheme: light)" },
      { url: "/brand/icon-dark.png", type: "image/png", media: "(prefers-color-scheme: dark)" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: deriveTokens("light").canvas },
    { media: "(prefers-color-scheme: dark)", color: deriveTokens("dark").canvas },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // light, dark or system, from the cookie, so the first paint is already right (D84)
  const theme = parseThemeMode((await cookies()).get(THEME_COOKIE)?.value);
  return (
    // the theme toggle changes data-theme on the client, so React mustn't fight it
    <html lang="en" data-theme={theme} className={`${archivo.variable} ${sourceSans.variable}`} suppressHydrationWarning>
      <body className="min-h-full bg-canvas text-ink">{children}</body>
    </html>
  );
}
