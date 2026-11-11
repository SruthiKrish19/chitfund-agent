import { runCycle, type SimulateOptions } from "@/lib/engine";
import { body, fail, ok } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = await body<Partial<SimulateOptions> & { payCount?: number }>(req);
  try {
    // payCount: convenience for the UI slider ("4 of 6 pay this month")
    let paid: SimulateOptions["paid"] = b.paid ?? "all";
    if (typeof b.payCount === "number") {
      const { getStore } = await import("@/lib/store");
      const c = await (await getStore()).getCircle(id);
      if (!c) return fail("not found", 404);
      paid = c.members.slice(0, Math.max(0, Math.min(b.payCount, c.members.length))).map((m) => m.id);
    }
    const circle = await runCycle(id, { paid, nudge: b.nudge ?? true, forceDraw: b.forceDraw ?? false });
    return ok(circle);
  } catch (e) {
    return fail(e, 500);
  }
}
