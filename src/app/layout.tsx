import type { Metadata } from "next";
import Link from "next/link";
import DemoNotice from "@/components/DemoNotice";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChitCircle",
  description: "An AI agent that runs rotating savings circles (chit funds) on PayPal invoices and payouts.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="inline-block h-6 w-6 rounded-full bg-gradient-to-br from-amber-400 to-rose-500" />
              ChitCircle
            </Link>
            <nav className="flex items-center gap-4 text-sm text-stone-600">
              <Link href="/" className="hover:text-stone-900">Circles</Link>
              <a href="https://github.com/SruthiKrish19/chitfund-agent" className="hover:text-stone-900" target="_blank" rel="noreferrer">GitHub</a>
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">PayPal sandbox</span>
            </nav>
          </div>
        </header>
        <DemoNotice />
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
