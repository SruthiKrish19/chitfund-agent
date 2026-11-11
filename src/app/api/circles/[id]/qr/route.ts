import { invoiceQrDataUrl } from "@/lib/paypal";
import { fail, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const invoiceId = new URL(req.url).searchParams.get("invoiceId");
  if (!invoiceId) return fail("invoiceId required");
  try {
    return ok({ dataUrl: await invoiceQrDataUrl(invoiceId) });
  } catch (e) {
    return fail(e, 500);
  }
}
