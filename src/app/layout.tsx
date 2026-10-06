import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
