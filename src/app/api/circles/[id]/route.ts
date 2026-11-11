import { getStore } from "@/lib/store";
import { fail, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const circle = await (await getStore()).getCircle(id);
  return circle ? ok(circle) : fail("not found", 404);
}
