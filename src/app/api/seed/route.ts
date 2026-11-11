import { seedDemo } from "@/lib/seed";
import { fail, ok } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Idempotent: creates the SAMPLE circle (with two populated cycles) or returns the existing one. */
export async function POST() {
  try {
    const { circle, created } = await seedDemo();
    return ok({ ...circle, created }, created ? 201 : 200);
  } catch (e) {
    return fail(e, 500);
  }
}
