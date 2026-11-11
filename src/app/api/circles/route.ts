import { createCircle } from "@/lib/engine";
import { getStore } from "@/lib/store";
import { body, fail, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  const store = await getStore();
  const circles = await store.listCircles();
  return ok(
    circles.map((c) => ({
      id: c.id,
      name: c.name,
      sample: c.sample ?? false,
      members: c.members.length,
      cyclesRun: c.cycles.length,
      cyclesTotal: c.members.length,
      contribution: c.contribution,
      currency: c.currency,
      cadence: c.cadence,
      drawMode: c.drawMode,
      parsedBy: c.parsedBy,
      createdAt: c.createdAt,
      url: `/circles/${c.id}`,
    })),
  );
}

export async function POST(req: Request) {
  const { description } = await body<{ description?: string }>(req);
  if (!description || description.trim().length < 10) return fail("Describe the circle in a sentence or two.");
  try {
    const circle = await createCircle(description.trim());
    return ok(circle, 201);
  } catch (e) {
    return fail(e, 500);
  }
}
