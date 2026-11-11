import type { CircleSpec, DrawMode, Cadence } from "./types";

const NUMBER_WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
};
const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];

function nextMonthStart(from = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  return d.toISOString().slice(0, 10);
}

/** Deterministic parser used when no AI key is configured (and as a validator for AI output). */
export function parseCircleFallback(text: string, now = new Date()): CircleSpec {
  const t = text.toLowerCase();

  // member count: "10 of us", "six members", "8 people", "ten friends"
  let memberCount = 0;
  const m1 = t.match(/(\d+|[a-z]+)\s+(of us|members?|people|friends|colleagues|families|participants)/);
  if (m1) memberCount = Number(m1[1]) || NUMBER_WORDS[m1[1]] || 0;
  const names = extractNames(text);
  if (!memberCount && names.length) memberCount = names.length;
  if (!memberCount) memberCount = 6;

  // contribution: "$50", "50 dollars", "5,000 rupees", "50 usd a month"
  let contribution = 50;
  const money = t.match(/(?:\$|usd\s*|rs\.?\s*|₹\s*)?(\d[\d,]*(?:\.\d+)?)\s*(usd|dollars?|bucks|rupees?|rs|inr|₹)?/g) ?? [];
  for (const chunk of money) {
    const hasCurrency = /\$|usd|dollar|buck|rupee|rs|inr|₹/.test(chunk);
    const n = Number(chunk.replace(/[^\d.]/g, ""));
    if (hasCurrency && n > 0) {
      contribution = n;
      break;
    }
  }
  // Sandbox is USD only; rupee amounts get scaled so the demo stays sensible.
  if (/rupee|rs\b|inr|₹/.test(t) && contribution > 500) contribution = Math.round(contribution / 100);

  const cadence: Cadence = /week/.test(t) ? "WEEK" : "MONTH";
  const drawMode: DrawMode = /auction|bid/.test(t) ? "auction" : "lottery";

  let startDate = nextMonthStart(now);
  for (let i = 0; i < 12; i++) {
    if (t.includes(MONTHS[i])) {
      let year = now.getUTCFullYear();
      if (i < now.getUTCMonth()) year += 1;
      startDate = new Date(Date.UTC(year, i, 1)).toISOString().slice(0, 10);
      break;
    }
  }
  const commission = t.match(/(\d+(?:\.\d+)?)\s*%\s*(commission|foreman|fee)/);
  const foremanCommissionPct = commission ? Number(commission[1]) : 0;

  const nameMatch = text.match(/(?:[Cc]all(?:ed)?|[Nn]amed?)\s+(?:it\s+)?["“']?([A-Z][\w' ]{2,40}?)["”']?(?=[.,;!]|$)/m);
  const name = nameMatch?.[1]?.trim() || `${memberCount}-member ${drawMode} circle`;

  return {
    name,
    memberCount,
    memberNames: names.length ? names : undefined,
    contribution,
    cadence,
    drawMode,
    startDate,
    foremanCommissionPct,
  };
}

/** Pull capitalised comma/and-separated names after "members:" / "with" / "between". */
function extractNames(text: string): string[] {
  const m = text.match(/(?:members?|with|between|including|:)\s*([A-Z][a-z]+(?:\s*(?:,|and|&)\s*[A-Z][a-z]+){1,19})/);
  if (!m) return [];
  return m[1].split(/\s*(?:,|and|&)\s*/).map((s) => s.trim()).filter(Boolean);
}

export function validateSpec(spec: CircleSpec): CircleSpec {
  const memberCount = Math.min(Math.max(Math.round(spec.memberCount || 0), 2), 50);
  const contribution = Math.min(Math.max(Number(spec.contribution) || 1, 1), 10_000);
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(spec.startDate) ? spec.startDate : nextMonthStart();
  return {
    name: (spec.name || "Savings circle").slice(0, 60),
    memberCount,
    memberNames: spec.memberNames?.slice(0, memberCount),
    contribution: Math.round(contribution * 100) / 100,
    cadence: spec.cadence === "WEEK" ? "WEEK" : "MONTH",
    drawMode: spec.drawMode === "auction" ? "auction" : "lottery",
    startDate,
    foremanCommissionPct: Math.min(Math.max(spec.foremanCommissionPct || 0, 0), 10),
  };
}
