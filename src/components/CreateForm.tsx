"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const EXAMPLES = [
  "Call it Anna Nagar Friends Circle. Six of us: Priya, Ravi, Meena, Arjun, Lakshmi and Karthik. $50 a month each starting next month, winner picked by lottery.",
  "8 colleagues, 100 dollars a month, auction style so whoever needs it most bids lowest, 2% foreman commission, start in January.",
  "Five of us saving 20 bucks a week, lottery draw, call it Weekend Warriors.",
];

export default function CreateForm() {
  const [text, setText] = useState(EXAMPLES[0]);
  const [busy, setBusy] = useState<"create" | "seed" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(kind: "create" | "seed") {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(kind === "seed" ? "/api/seed" : "/api/circles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: kind === "seed" ? undefined : JSON.stringify({ description: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      router.push(`/circles/${data.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <label className="block text-sm font-medium text-stone-700">Describe your circle in plain language</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="mt-2 w-full rounded-lg border border-stone-300 p-3 text-sm focus:border-amber-500 focus:outline-none"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {EXAMPLES.map((ex, i) => (
          <button key={i} onClick={() => setText(ex)} className="rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-600 hover:bg-stone-100">
            Example {i + 1}
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => submit("create")}
          disabled={busy !== null}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {busy === "create" ? "Setting up invoices…" : "Create circle"}
        </button>
        <button
          onClick={() => submit("seed")}
          disabled={busy !== null}
          className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100 disabled:opacity-50"
        >
          {busy === "seed" ? "Seeding…" : "Seed demo circle"}
        </button>
        {error && <span className="text-sm text-rose-600">{error}</span>}
      </div>
      <p className="mt-3 text-xs text-stone-500">
        The agent parses this into members, amount, cadence and draw rules, then creates a PayPal recurring invoice series for the circle. Money only moves through PayPal invoices and payouts; the AI never touches it.
      </p>
    </div>
  );
}
