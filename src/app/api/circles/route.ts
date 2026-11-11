import { createCircle } from "@/lib/engine";
import { getStore } from "@/lib/store";
import { body, fail, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  const store = await getStore();
  const circles = await store.listCircles();
  return ok(circles.map((c) => ({ id: c.id, name: c.name, members: c.members.length, cyclesRun: c.cycles.length, contribution: c.contribution, drawMode: c.drawMode, createdAt: c.createdAt })));
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
