import { getStore } from "@/lib/store";
import { markPaid } from "@/lib/engine";
import { ok } from "@/lib/http";

export const runtime = "nodejs";

/**
 * PayPal webhook listener. Subscribe to INVOICING.INVOICE.PAID in the developer dashboard.
 * The invoice reference is "<circleId>-<cycle>-<memberId>", so we can mark the right member paid.
 * Signature verification is skipped in the sandbox demo; see README for the production note.
 */
export async function POST(req: Request) {
  let event: { event_type?: string; resource?: { invoice?: { detail?: { reference?: string } }; detail?: { reference?: string } } } = {};
  try {
    event = await req.json();
  } catch {
    return ok({ ignored: true });
  }
  if (event.event_type !== "INVOICING.INVOICE.PAID") return ok({ ignored: event.event_type });
  const ref = event.resource?.invoice?.detail?.reference ?? event.resource?.detail?.reference ?? "";
  const [circleId, , memberId] = ref.split("-");
  if (!circleId || !memberId) return ok({ ignored: "no reference" });
  const circle = await (await getStore()).getCircle(circleId);
  if (!circle) return ok({ ignored: "unknown circle" });
  try {
    await markPaid(circleId, memberId);
  } catch (e) {
    return ok({ error: (e as Error).message });
  }
  return ok({ handled: true });
}
