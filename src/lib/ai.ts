import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { env, hasAi } from "./env";
import { parseCircleFallback, validateSpec } from "./parser";
import type { Circle, CircleSpec, Member } from "./types";

export function anthropicClient(): Anthropic | null {
  if (!hasAi()) return null;
  return new Anthropic({
    apiKey: env.anthropicApiKey,
    baseURL: env.anthropicBaseUrl || undefined, // e.g. https://ai-gateway.vercel.sh
  });
}

const MODEL = () => env.anthropicModel;

const SpecSchema = z.object({
  name: z.string(),
  memberCount: z.number().int(),
  memberNames: z.array(z.string()).nullable(),
  contribution: z.number(),
  cadence: z.enum(["MONTH", "WEEK"]),
  drawMode: z.enum(["lottery", "auction"]),
  startDate: z.string(),
  foremanCommissionPct: z.number(),
});

/** Parse the organiser's description into a CircleSpec. Claude when available, deterministic fallback otherwise. */
export async function parseCircle(text: string): Promise<{ spec: CircleSpec; parsedBy: "claude" | "fallback" }> {
  const fallback = validateSpec(parseCircleFallback(text));
  const client = anthropicClient();
  if (!client) return { spec: fallback, parsedBy: "fallback" };
  try {
    const today = new Date().toISOString().slice(0, 10);
    const res = await client.messages.parse({
      model: MODEL(),
      max_tokens: 2000,
      system:
        "You extract the rules of a chit fund (rotating savings circle) from an organiser's plain-language description. " +
        "Return only the structured contract. Amounts are per-member per-cycle contributions. The PayPal sandbox only supports USD, so if the user writes rupees or another currency, convert to a sensible USD amount and keep it round. " +
        `Today is ${today}; startDate must be today or later in yyyy-MM-dd. memberNames is null unless names are given. foremanCommissionPct is 0 unless stated.`,
      messages: [{ role: "user", content: text }],
      output_config: { format: zodOutputFormat(SpecSchema) },
    });
    const parsed = res.parsed_output;
    if (!parsed) return { spec: fallback, parsedBy: "fallback" };
    return {
      spec: validateSpec({ ...parsed, memberNames: parsed.memberNames ?? undefined }),
      parsedBy: "claude",
    };
  } catch (e) {
    console.warn("[ai] parseCircle failed, using fallback:", (e as Error).message);
    return { spec: fallback, parsedBy: "fallback" };
  }
}

/** Personalised reminder text for a late member. */
export async function writeReminder(circle: Circle, member: Member, cycleIndex: number, timesReminded: number): Promise<string> {
  const history = circle.cycles
    .filter((c) => c.index < cycleIndex)
    .map((c) => {
      const inv = c.invoices.find((i) => i.memberId === member.id);
      return `${c.label}: ${inv?.status === "PAID" ? "paid on time" : "late"}`;
    })
    .join("; ");
  const base =
    `Hi ${member.name}, a gentle reminder that your ${circle.currency} ${circle.contribution.toFixed(2)} contribution for ${circle.name} ` +
    `(${circle.cycles[cycleIndex - 1]?.label ?? "this cycle"}) is still open. The pot is paid out as soon as everyone is in. Thank you!`;
  const client = anthropicClient();
  if (!client) return base;
  try {
    const res = await client.messages.create({
      model: MODEL(),
      max_tokens: 300,
      system:
        "You write short, warm, culturally neutral payment reminders for members of a chit fund (rotating savings circle). " +
        "Two to three sentences, no emojis, no guilt-tripping, mention the amount and the circle name. Escalate firmness slightly with each reminder count.",
      messages: [
        {
          role: "user",
          content: `Member: ${member.name}. Circle: ${circle.name}. Amount: ${circle.currency} ${circle.contribution.toFixed(2)}. Cycle: ${circle.cycles[cycleIndex - 1]?.label}. Reminder number: ${timesReminded + 1}. Payment history: ${history || "first cycle"}.`,
        },
      ],
    });
    const text = res.content.find((b) => b.type === "text")?.text?.trim();
    return text || base;
  } catch {
    return base;
  }
}
