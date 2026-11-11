import { markPaid } from "@/lib/engine";
import { body, fail, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { memberId } = await body<{ memberId?: string }>(req);
  if (!memberId) return fail("memberId required");
  try {
    return ok(await markPaid(id, memberId));
  } catch (e) {
    return fail(e, 500);
  }
}
