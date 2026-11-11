import Anthropic from "@anthropic-ai/sdk";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/openai";
import { env, hasPayPal } from "./env";
import { anthropicClient } from "./ai";
import { summarize } from "./engine";
import type { Circle } from "./types";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** PayPal Agent Toolkit tools, limited to read + reminder actions so the model can't move money. */
function toolkit() {
  return new PayPalAgentToolkit({
    clientId: env.paypalClientId,
    clientSecret: env.paypalClientSecret,
    configuration: {
      actions: {
        invoices: { list: true, get: true, search: true, sendReminder: true, generateQRC: true, getRecurringSeries: true },
        transactions: { list: true },
      },
      context: { sandbox: env.paypalEnv !== "live" },
    },
  });
}

const LOCAL_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_circle_state",
    description: "Current state of this chit circle: members, who has won, contribution, cycles run, current cycle collection status, unpaid members, payout status.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "simulate_dropout",
    description: "Explain what happens if a given member drops out now: remaining cycles, pot size, who is affected. Pure calculation, changes nothing.",
    input_schema: {
      type: "object",
      properties: { memberName: { type: "string", description: "Name of the member who might drop out" } },
      required: ["memberName"],
      additionalProperties: false,
    },
  },
];

function runLocalTool(circle: Circle, name: string, input: Record<string, unknown>): string {
  if (name === "get_circle_state") return JSON.stringify(summarize(circle));
  if (name === "simulate_dropout") {
    const who = String(input.memberName ?? "").toLowerCase();
    const m = circle.members.find((x) => x.name.toLowerCase() === who);
    if (!m) return `No member named ${input.memberName}.`;
    const remaining = circle.members.length - circle.cycles.length;
    const newPot = (circle.members.length - 1) * circle.contribution;
    return JSON.stringify({
      member: m.name,
      alreadyWon: Boolean(m.wonCycle),
      remainingCycles: remaining,
      potBefore: circle.members.length * circle.contribution,
      potAfterDropout: newPot,
      note: m.wonCycle
        ? "They have already received a pot, so dropping out means the others lose their contribution to that pot. Classic chit rules require the foreman to cover or recover it."
        : "They have not yet received a pot; their paid contributions are owed back to them at the end, and remaining pots shrink by one share.",
    });
  }
  return `Unknown tool ${name}`;
}

export async function answer(circle: Circle, history: ChatTurn[], question: string): Promise<{ reply: string; toolsUsed: string[]; mode: "claude" | "fallback" }> {
  const client = anthropicClient();
  if (!client) return { reply: fallbackAnswer(circle, question), toolsUsed: [], mode: "fallback" };

  const kit = hasPayPal() ? toolkit() : null;
  const paypalTools: Anthropic.Tool[] = (kit?.getTools() ?? []).map((t) => ({
    name: t.function.name,
    description: t.function.description ?? "",
    input_schema: (t.function.parameters ?? { type: "object", properties: {} }) as Anthropic.Tool.InputSchema,
  }));
  const tools = [...LOCAL_TOOLS, ...paypalTools];
  const toolsUsed: string[] = [];

  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-10).map((h) => ({ role: h.role, content: h.content }) as Anthropic.MessageParam),
    { role: "user", content: question },
  ];
  const system =
    `You are ChitCircle's assistant for the savings circle "${circle.name}". Members ask what they owe, when their turn is, and what the rules mean. ` +
    `Rules: every member pays ${circle.currency} ${circle.contribution} per ${circle.cadence.toLowerCase()}; each cycle one member who hasn't won yet receives the pot by ${circle.drawMode}` +
    (circle.drawMode === "auction" ? " (lowest bid wins; the discount is shared as a dividend next cycle)" : " (random draw)") +
    `. Always call get_circle_state first for anything about who paid, who won, or amounts. PayPal tools are read-only except send_invoice_reminder. ` +
    `You can propose actions but you cannot move money; say so if asked to pay someone. Keep answers short and concrete.`;

  for (let i = 0; i < 6; i++) {
    const res = await client.messages.create({
      model: env.anthropicModel,
      max_tokens: 1500,
      system,
      tools,
      messages,
    });
    if (res.stop_reason !== "tool_use") {
      const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      return { reply: text || "(no answer)", toolsUsed, mode: "claude" };
    }
    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      toolsUsed.push(block.name);
      let content: string;
      if (LOCAL_TOOLS.some((t) => t.name === block.name)) {
        content = runLocalTool(circle, block.name, block.input as Record<string, unknown>);
      } else if (kit) {
        const r = await kit.handleToolCall({
          id: block.id,
          type: "function",
          function: { name: block.name, arguments: JSON.stringify(block.input) },
        });
        content = typeof r.content === "string" ? r.content : JSON.stringify(r.content);
      } else {
        content = "PayPal is not configured.";
      }
      results.push({ type: "tool_result", tool_use_id: block.id, content: content.slice(0, 20_000) });
    }
    messages.push({ role: "user", content: results });
  }
  return { reply: "I ran out of steps answering that. Try a narrower question.", toolsUsed, mode: "claude" };
}

/** Keyword answers so the chat is useful with no AI key configured. */
function fallbackAnswer(circle: Circle, q: string): string {
  const s = summarize(circle);
  const t = q.toLowerCase();
  const cur = s.currentCycle;
  if (/owe|due|pay/.test(t)) {
    if (!cur) return `No cycle has run yet. Each member will owe ${s.currency} ${s.contribution.toFixed(2)} per ${s.cadence.toLowerCase()} starting ${s.startDate}.`;
    return cur.unpaid.length
      ? `Still open for ${cur.label}: ${cur.unpaid.join(", ")} (${s.currency} ${s.contribution.toFixed(2)} each). Collected ${s.currency} ${cur.collected.toFixed(2)} of ${cur.target.toFixed(2)}.`
      : `Everyone has paid for ${cur.label}. Pot: ${s.currency} ${cur.collected.toFixed(2)}.`;
  }
  if (/turn|win|won|next/.test(t)) {
    const winners = s.members.filter((m) => m.wonCycle).map((m) => `${m.name} (cycle ${m.wonCycle})`);
    const pending = s.members.filter((m) => !m.wonCycle).map((m) => m.name);
    return `${winners.length ? "Pots so far: " + winners.join(", ") + ". " : ""}Still to receive a pot: ${pending.join(", ") || "nobody, the circle is complete"}. ${s.drawMode === "lottery" ? "Winners are drawn at random each cycle." : "The lowest bid wins each cycle."}`;
  }
  if (/drop|leave|quit/.test(t)) {
    return `If a member drops out, the remaining ${s.cyclesTotal - s.cyclesRun} pots shrink by one share (${s.currency} ${s.contribution.toFixed(2)}). A member who already received a pot owes the circle; one who hasn't is refunded their contributions at the end.`;
  }
  if (/payout|paid out|batch/.test(t) && cur?.payout) {
    return `Latest payout: ${cur.payout.status}${cur.payout.batchId ? " (PayPal batch " + cur.payout.batchId + ")" : ""}${cur.payout.message ? ": " + cur.payout.message : ""}.`;
  }
  return `${s.name}: ${s.members.length} members, ${s.currency} ${s.contribution.toFixed(2)} per ${s.cadence.toLowerCase()}, ${s.drawMode} draw, ${s.cyclesRun}/${s.cyclesTotal} cycles run. Ask me what you owe, whose turn is next, or what happens if someone drops out. (AI assistant is offline: set ANTHROPIC_API_KEY for full answers.)`;
}
