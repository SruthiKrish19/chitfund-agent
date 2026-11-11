import { randomUUID } from "node:crypto";
import { createCircle, runCycle } from "./engine";
import { getStore } from "./store";
import type { Circle } from "./types";

export const DEMO_DESCRIPTION =
  "Call it Anna Nagar Friends Circle. Six of us: Priya, Ravi, Meena, Arjun, Lakshmi and Karthik. $50 a month each starting next month, winner picked by lottery.";

/**
 * Seed the reviewer sample circle. Idempotent: returns the existing SAMPLE circle if one exists.
 * On first run it also advances two cycles so the ledger is populated (real sandbox invoices,
 * recorded payments, reminders, draws and payouts). Any failure inside a cycle is written to the
 * ledger as a NOTE instead of aborting the seed.
 */
export async function seedDemo(): Promise<{ circle: Circle; created: boolean }> {
  const store = await getStore();
  const existing = (await store.listCircles()).find((c) => c.sample);
  if (existing) return { circle: existing, created: false };

  let circle = await createCircle(DEMO_DESCRIPTION, { sample: true });

  // Cycle 1: four of six pay on time, two get nudged, then the pot is completed and paid out.
  // Cycle 2: everyone pays, draw and payout run straight away.
  const plans = [
    { paid: circle.members.slice(0, 4).map((m) => m.id), nudge: true, forceDraw: true },
    { paid: "all" as const, nudge: false, forceDraw: false },
  ];
  for (const plan of plans) {
    try {
      circle = await runCycle(circle.id, plan);
    } catch (e) {
      const fresh = (await store.getCircle(circle.id)) ?? circle;
      fresh.ledger.unshift({
        id: randomUUID(),
        at: new Date().toISOString(),
        kind: "NOTE",
        detail: `Sample cycle could not be completed: ${(e as Error).message.slice(0, 240)}`,
      });
      await store.putCircle(fresh);
      circle = fresh;
      break;
    }
  }
  return { circle, created: true };
}
