import { answer, type ChatTurn } from "@/lib/chat";
import { getStore } from "@/lib/store";
import { body, fail, ok } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { question, history } = await body<{ question?: string; history?: ChatTurn[] }>(req);
  if (!question?.trim()) return fail("question required");
  const circle = await (await getStore()).getCircle(id);
  if (!circle) return fail("not found", 404);
  try {
    return ok(await answer(circle, history ?? [], question.trim()));
  } catch (e) {
    return fail(e, 500);
  }
}
