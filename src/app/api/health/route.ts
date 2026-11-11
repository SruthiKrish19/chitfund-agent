import { hasAi, hasPayPal, env } from "@/lib/env";
import { ok } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  return ok({
    paypal: hasPayPal(),
    paypalEnv: env.paypalEnv,
    ai: hasAi(),
    aiMode: hasAi() ? "claude" : "fallback (no ANTHROPIC_API_KEY on this instance)",
    model: env.anthropicModel,
    storage: env.upstashUrl ? "upstash" : "file",
  });
}
