import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Gateway Gas Enterprises — Stock & Sales",
    template: "%s — Gateway Gas Enterprises",
  },
  description:
    "Internal staff portal for Gateway Gas Enterprises: LPG cylinder stock levels, daily sales counts and takings.",
  applicationName: "Gateway Gas Portal",
  keywords: ["LPG", "gas stock", "cylinder sales", "Kenya", "Gateway Gas"],
};

export const viewport: Viewport = {
  themeColor: "#1c1917",
};

/**
 * The font stack is the platform's own sans (see --font-sans in globals.css).
 *
 * This used to pull Geist from Google Fonts at build time, which made the
 * build fail with no network - including in CI sandboxes and on an air-gapped
 * deploy host. A staff portal on Kenyan mobile connections gains nothing from
 * a downloaded webfont, so the system stack wins on reliability.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      {/* Runs before first paint — prevents flash of wrong theme.
          Reads localStorage and sets data-theme on <html> immediately. */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');else if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
