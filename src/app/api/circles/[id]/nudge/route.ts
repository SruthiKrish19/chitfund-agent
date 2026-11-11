import { nudgeCircle } from "@/lib/engine";
import { fail, ok } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    return ok(await nudgeCircle(id));
  } catch (e) {
    return fail(e, 500);
  }
}
