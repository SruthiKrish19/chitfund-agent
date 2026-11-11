import { randomUUID } from "node:crypto";
import { env, hasPayPal } from "./env";
import {
  createInvoice,
  createRecurringSeries,
  recordInvoicePayment,
  sendInvoice,
  sendInvoiceReminder,
  sendPayout,
} from "./paypal";
import { parseCircle, writeReminder } from "./ai";
import { getStore } from "./store";
import type { Circle, Cycle, LedgerEntry, Member, MemberInvoice } from "./types";

const DEMO_NAMES = ["Priya", "Ravi", "Meena", "Arjun", "Lakshmi", "Karthik", "Divya", "Suresh", "Anita", "Vikram", "Kavya", "Rahul"];

function log(circle: Circle, e: Omit<LedgerEntry, "id" | "at">) {
  circle.ledger.unshift({ id: randomUUID(), at: new Date().toISOString(), ...e });
}

function cycleLabel(startDate: string, index: number, cadence: Circle["cadence"]) {
  const d = new Date(startDate + "T00:00:00Z");
  if (cadence === "WEEK") d.setUTCDate(d.getUTCDate() + 7 * (index - 1));
  else d.setUTCMonth(d.getUTCMonth() + (index - 1));
  return cadence === "WEEK"
    ? `Week of ${d.toISOString().slice(0, 10)}`
    : d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

export async function createCircle(description: string, opts: { buyerEmail?: string; sample?: boolean } = {}): Promise<Circle> {
  const { spec, parsedBy } = await parseCircle(description);
  const members: Member[] = Array.from({ length: spec.memberCount }, (_, i) => {
    const name = spec.memberNames?.[i] ?? DEMO_NAMES[i % DEMO_NAMES.length] + (i >= DEMO_NAMES.length ? ` ${i}` : "");
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    // First member gets a real sandbox account so a real PayPal payment can be demoed.
    const demo = opts.buyerEmail || env.demoPayerEmail;
    const email = i === 0 && demo ? demo : `${slug}@example.com`;
    return { id: randomUUID().slice(0, 8), name, email };
  });
  const circle: Circle = {
    id: randomUUID().slice(0, 10),
    name: spec.name,
    description,
    currency: "USD",
    contribution: spec.contribution,
    cadence: spec.cadence,
    drawMode: spec.drawMode,
    startDate: spec.startDate,
    foremanCommissionPct: spec.foremanCommissionPct,
    members,
    cycles: [],
    ledger: [],
    createdAt: new Date().toISOString(),
    parsedBy,
    ...(opts.sample ? { sample: true } : {}),
  };
  log(circle, {
    kind: "CIRCLE_CREATED",
    detail: `${members.length} members, ${circle.currency} ${circle.contribution} per ${circle.cadence.toLowerCase()}, ${circle.drawMode} draw, starts ${circle.startDate} (parsed by ${parsedBy})`,
  });

  if (hasPayPal()) {
    let created = 0;
    for (const m of members) {
      try {
        const series = await createRecurringSeries({
          recipientEmail: m.email,
          recipientName: m.name,
          amount: circle.contribution,
          currency: circle.currency,
          itemName: `${circle.name} contribution`,
          intervalUnit: circle.cadence,
          startDate: circle.startDate,
          totalCycles: members.length,
          note: `Recurring contribution for ${circle.name}. One member receives the pot each cycle.`,
        });
        m.recurringSeriesId = series.id;
        created += 1;
      } catch (e) {
        log(circle, { kind: "NOTE", memberId: m.id, detail: `Recurring series not created for ${m.name}: ${(e as Error).message.slice(0, 220)}` });
      }
    }
    if (created) {
      log(circle, {
        kind: "SERIES_CREATED",
        paypalId: members.find((m) => m.recurringSeriesId)?.recurringSeriesId,
        detail: `${created} PayPal recurring invoice series created (one per member, ${members.length} cycles each, draft until activated)`,
      });
    }
  }
  const store = await getStore();
  await store.putCircle(circle);
  return circle;
}

export interface SimulateOptions {
  /** member ids that pay this cycle; "all" pays everyone */
  paid: string[] | "all";
  /** send PayPal reminders to the unpaid members */
  nudge?: boolean;
  /** run the draw + payout even if not fully collected (demo convenience) */
  forceDraw?: boolean;
}

/** Advance the circle by one cycle: invoice everyone, record payments, nudge, draw, pay out. */
export async function runCycle(circleId: string, opts: SimulateOptions): Promise<Circle> {
  const store = await getStore();
  const circle = await store.getCircle(circleId);
  if (!circle) throw new Error("circle not found");
  if (circle.cycles.length >= circle.members.length) throw new Error("All cycles complete: every member has received the pot.");

  const index = circle.cycles.length + 1;
  const prev = circle.cycles[index - 2];
  const dividend = prev?.dividendPerMember ?? 0;
  const due = Math.max(0, Math.round((circle.contribution - dividend) * 100) / 100);
  const cycle: Cycle = {
    index,
    label: cycleLabel(circle.startDate, index, circle.cadence),
    startedAt: new Date().toISOString(),
    invoices: [],
    pot: 0,
    collected: 0,
    drawMode: circle.drawMode,
    payout: { status: "NOT_RUN", amount: 0 },
  };
  circle.cycles.push(cycle);

  // 1. Invoice every member for this cycle.
  for (const m of circle.members) {
    const inv: MemberInvoice = { memberId: m.id, status: "DRAFT", amount: due, reminders: 0 };
    cycle.invoices.push(inv);
    if (!hasPayPal()) {
      inv.status = "SENT";
      continue;
    }
    try {
      const created = await createInvoice({
        recipientEmail: m.email,
        recipientName: m.name,
        amount: due,
        currency: circle.currency,
        itemName: `${circle.name}: ${cycle.label} contribution`,
        note: dividend ? `Includes ${circle.currency} ${dividend.toFixed(2)} dividend from last cycle's auction.` : undefined,
        reference: `${circle.id}-${index}-${m.id}`,
      });
      inv.invoiceId = created.id;
      await sendInvoice(created.id);
      inv.status = "SENT";
      log(circle, { kind: "INVOICE_SENT", cycle: index, memberId: m.id, amount: due, paypalId: created.id, detail: `Invoice sent to ${m.name} (${m.email})` });
    } catch (e) {
      inv.status = "FAILED";
      inv.error = (e as Error).message.slice(0, 300);
      log(circle, { kind: "NOTE", cycle: index, memberId: m.id, detail: `Invoice failed for ${m.name}: ${inv.error}` });
    }
  }
  await store.putCircle(circle);

  // 2. Record payments.
  const payers = opts.paid === "all" ? circle.members.map((m) => m.id) : opts.paid;
  for (const inv of cycle.invoices) {
    if (!payers.includes(inv.memberId) || inv.status === "FAILED") continue;
    const m = circle.members.find((x) => x.id === inv.memberId)!;
    try {
      if (inv.invoiceId) await recordInvoicePayment(inv.invoiceId, inv.amount, circle.currency, `Paid by ${m.name}`);
      inv.status = "PAID";
      inv.paidAt = new Date().toISOString();
      cycle.collected = Math.round((cycle.collected + inv.amount) * 100) / 100;
      log(circle, { kind: "PAYMENT_RECORDED", cycle: index, memberId: m.id, amount: inv.amount, paypalId: inv.invoiceId, detail: `${m.name} paid ${circle.currency} ${inv.amount.toFixed(2)}` });
    } catch (e) {
      log(circle, { kind: "NOTE", cycle: index, memberId: m.id, detail: `Could not record payment for ${m.name}: ${(e as Error).message.slice(0, 200)}` });
    }
  }
  await store.putCircle(circle);

  // 3. Nudge the stragglers.
  if (opts.nudge) await nudgeUnpaid(circle, cycle);

  // 4. Draw + payout when the pot is full (or forced for demo).
  const fullyCollected = cycle.invoices.every((i) => i.status === "PAID");
  if (fullyCollected || opts.forceDraw) await drawAndPay(circle, cycle);

  await store.putCircle(circle);
  return circle;
}

export async function nudgeUnpaid(circle: Circle, cycle: Cycle) {
  for (const inv of cycle.invoices) {
    if (inv.status === "PAID" || inv.status === "FAILED") continue;
    const m = circle.members.find((x) => x.id === inv.memberId)!;
    const note = await writeReminder(circle, m, cycle.index, inv.reminders);
    try {
      if (inv.invoiceId && hasPayPal()) await sendInvoiceReminder(inv.invoiceId, note);
      inv.reminders += 1;
      inv.status = "REMINDED";
      log(circle, { kind: "REMINDER_SENT", cycle: cycle.index, memberId: m.id, paypalId: inv.invoiceId, detail: note });
    } catch (e) {
      log(circle, { kind: "NOTE", cycle: cycle.index, memberId: m.id, detail: `Reminder failed for ${m.name}: ${(e as Error).message.slice(0, 200)}` });
    }
  }
}

export async function nudgeCircle(circleId: string): Promise<Circle> {
  const store = await getStore();
  const circle = await store.getCircle(circleId);
  if (!circle) throw new Error("circle not found");
  const cycle = circle.cycles[circle.cycles.length - 1];
  if (!cycle) throw new Error("No cycle yet. Run a cycle first.");
  await nudgeUnpaid(circle, cycle);
  await store.putCircle(circle);
  return circle;
}

/** Record a payment that arrived later (e.g. from the PayPal webhook or a manual "mark paid"). */
export async function markPaid(circleId: string, memberId: string): Promise<Circle> {
  const store = await getStore();
  const circle = await store.getCircle(circleId);
  if (!circle) throw new Error("circle not found");
  const cycle = circle.cycles[circle.cycles.length - 1];
  const inv = cycle?.invoices.find((i) => i.memberId === memberId);
  if (!cycle || !inv) throw new Error("no open invoice for member");
  if (inv.status === "PAID") return circle;
  const m = circle.members.find((x) => x.id === memberId)!;
  if (inv.invoiceId && hasPayPal() && inv.status !== "FAILED") {
    try {
      await recordInvoicePayment(inv.invoiceId, inv.amount, circle.currency, `Paid by ${m.name}`);
    } catch (e) {
      // Already paid in PayPal (e.g. via the real checkout) is fine; surface anything else.
      const msg = (e as Error).message;
      if (!/INVOICE_ALREADY_PAID|UNPROCESSABLE/.test(msg)) throw e;
    }
  }
  inv.status = "PAID";
  inv.paidAt = new Date().toISOString();
  cycle.collected = Math.round((cycle.collected + inv.amount) * 100) / 100;
  log(circle, {
    kind: "PAYMENT_RECORDED",
    cycle: cycle.index,
    memberId,
    amount: inv.amount,
    paypalId: inv.invoiceId,
    detail: `${m.name} paid ${circle.currency} ${inv.amount.toFixed(2)}${inv.error ? " (recorded locally; PayPal invoice could not be sent)" : ""}`,
  });
  if (cycle.invoices.every((i) => i.status === "PAID") && !cycle.winnerId) await drawAndPay(circle, cycle);
  await store.putCircle(circle);
  return circle;
}

/** Lottery: random among members who haven't won. Auction: lowest bid (highest discount) wins; discount becomes next cycle's dividend. */
export async function drawAndPay(circle: Circle, cycle: Cycle) {
  if (cycle.winnerId) return;
  const eligible = circle.members.filter((m) => !m.wonCycle);
  if (!eligible.length) return;
  const gross = cycle.collected;
  const commission = Math.round(gross * (circle.foremanCommissionPct / 100) * 100) / 100;
  let winner: Member;
  let payoutAmount = Math.round((gross - commission) * 100) / 100;

  if (circle.drawMode === "auction") {
    // Simulated sealed bids: each eligible member offers a discount between 5% and 25% of the pot.
    const bids = eligible.map((m) => ({ m, discount: Math.round(gross * (0.05 + Math.random() * 0.2) * 100) / 100 }));
    bids.sort((a, b) => b.discount - a.discount);
    winner = bids[0].m;
    cycle.auctionDiscount = bids[0].discount;
    cycle.dividendPerMember = Math.round((bids[0].discount / circle.members.length) * 100) / 100;
    payoutAmount = Math.round((payoutAmount - bids[0].discount) * 100) / 100;
    log(circle, {
      kind: "DRAW",
      cycle: cycle.index,
      memberId: winner.id,
      amount: payoutAmount,
      detail: `Auction: ${winner.name} bid the largest discount (${circle.currency} ${bids[0].discount.toFixed(2)}); each member gets a ${circle.currency} ${cycle.dividendPerMember.toFixed(2)} dividend next cycle`,
    });
  } else {
    winner = eligible[Math.floor(Math.random() * eligible.length)];
    log(circle, { kind: "DRAW", cycle: cycle.index, memberId: winner.id, amount: payoutAmount, detail: `Lottery draw: ${winner.name} wins the ${cycle.label} pot of ${circle.currency} ${payoutAmount.toFixed(2)}` });
  }
  winner.wonCycle = cycle.index;
  cycle.winnerId = winner.id;
  cycle.pot = gross;
  cycle.payout.amount = payoutAmount;

  if (!hasPayPal()) {
    cycle.payout = { status: "FAILED", amount: payoutAmount, message: "PayPal not configured" };
  } else {
    const result = await sendPayout({
      receiverEmail: winner.email,
      amount: payoutAmount,
      currency: circle.currency,
      note: `${circle.name}: ${cycle.label} pot`,
      senderItemId: `${circle.id}-${cycle.index}`,
    });
    cycle.payout =
      result.status === "PAID"
        ? { status: "PAID", amount: payoutAmount, batchId: result.batchId }
        : { status: result.status, amount: payoutAmount, message: result.message };
  }
  log(circle, {
    kind: "PAYOUT",
    cycle: cycle.index,
    memberId: winner.id,
    amount: payoutAmount,
    paypalId: cycle.payout.batchId,
    detail:
      cycle.payout.status === "PAID"
        ? `PayPal Payout sent to ${winner.name} (${winner.email})`
        : `Payout to ${winner.name} ${cycle.payout.status === "PENDING_REGION" ? "queued" : "failed"}: ${cycle.payout.message}`,
  });
  cycle.closedAt = new Date().toISOString();
}

/** Summary used by the chat assistant and the dashboard header. */
export function summarize(circle: Circle) {
  const current = circle.cycles[circle.cycles.length - 1];
  return {
    id: circle.id,
    name: circle.name,
    members: circle.members.map((m) => ({ id: m.id, name: m.name, email: m.email, wonCycle: m.wonCycle ?? null })),
    contribution: circle.contribution,
    currency: circle.currency,
    cadence: circle.cadence,
    drawMode: circle.drawMode,
    startDate: circle.startDate,
    cyclesRun: circle.cycles.length,
    cyclesTotal: circle.members.length,
    currentCycle: current
      ? {
          index: current.index,
          label: current.label,
          collected: current.collected,
          target: current.invoices.reduce((s, i) => s + i.amount, 0),
          unpaid: current.invoices.filter((i) => i.status !== "PAID").map((i) => circle.members.find((m) => m.id === i.memberId)?.name),
          winner: current.winnerId ? circle.members.find((m) => m.id === current.winnerId)?.name : null,
          payout: current.payout,
        }
      : null,
    recurringSeries: circle.members.filter((m) => m.recurringSeriesId).length,
  };
}
