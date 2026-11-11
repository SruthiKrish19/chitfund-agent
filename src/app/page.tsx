import Link from "next/link";
import CreateForm from "@/components/CreateForm";
import SampleBadge from "@/components/SampleBadge";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const circles = await (await getStore()).listCircles();
  return (
    <div className="space-y-8">
      <section className="grid gap-6 md:grid-cols-5">
        <div className="md:col-span-2">
          <h1 className="text-3xl font-semibold tracking-tight">Run a chit fund with an agent, not a notebook.</h1>
          <p className="mt-3 text-stone-600">
            A chit fund is a rotating savings circle: everyone pays in each month, and one member takes the pot. ChitCircle&apos;s agent sends the PayPal invoices, records payments, nudges late members, runs the draw, and pays the winner through PayPal Payouts.
          </p>
          <ul className="mt-4 space-y-1 text-sm text-stone-600">
            <li>• PayPal Invoicing v2 + recurring series for contributions</li>
            <li>• PayPal Payouts for the winner, Transaction Search for the ledger</li>
            <li>• Claude parses the rules and writes the reminders</li>
          </ul>
        </div>
        <div className="md:col-span-3">
          <CreateForm />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Your circles</h2>
        {circles.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">No circles yet. Create one above or seed the demo.</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {circles.map((c) => (
              <Link key={c.id} href={`/circles/${c.id}`} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm hover:border-amber-400">
                <div className="flex items-center gap-2 font-medium">
                  <span className="truncate">{c.name}</span>
                  {c.sample && <SampleBadge />}
                </div>
                <div className="mt-1 text-sm text-stone-600">
                  {c.members.length} members · {c.currency} {c.contribution.toFixed(2)} / {c.cadence.toLowerCase()} · {c.drawMode}
                </div>
                <div className="mt-2 text-xs text-stone-500">
                  {c.cycles.length}/{c.members.length} cycles run
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
