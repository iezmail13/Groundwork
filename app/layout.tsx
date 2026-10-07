import type { Metadata, Viewport } from "next";
import { Archivo, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap" });
const sourceSans = Source_Sans_3({ subsets: ["latin"], variable: "--font-source-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Groundwork", template: "%s · Groundwork" },
  description: "One central place for your team's work, files and calendar.",
  icons: { icon: [{ url: "/logo.svg", type: "image/svg+xml" }] },
};

export const viewport: Viewport = {
  themeColor: "#FBF9F4",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${sourceSans.variable}`}>
      <body className="min-h-full bg-canvas text-ink">{children}</body>
    </html>
  );
}
