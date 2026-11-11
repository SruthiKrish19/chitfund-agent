import { seedDemo } from "@/lib/seed";
import { fail, ok } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    return ok(await seedDemo(), 201);
  } catch (e) {
    return fail(e, 500);
  }
}
