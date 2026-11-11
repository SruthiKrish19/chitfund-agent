import { hasAi } from "@/lib/env";

const REPO = "https://github.com/SruthiKrish19/chitfund-agent";

/** Server component. Renders only when no Anthropic key is configured (the hosted reviewer demo). */
export default function DemoNotice() {
  if (hasAi()) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 text-amber-950">
      <div className="mx-auto flex max-w-6xl flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2 text-xs leading-relaxed sm:text-[13px]">
        <span className="mt-0.5 shrink-0 rounded bg-amber-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Hosted demo</span>
        <p className="min-w-0 flex-1">
          AI API credits aren&apos;t available on this hosted instance, so circle parsing, reminder text and the assistant run in{" "}
          <b>sample / fallback mode</b>. Circles marked <b>SAMPLE</b> are seeded for reviewers. PayPal sandbox invoices, reminders and payouts are real.
          To run with live Claude: clone the{" "}
          <a href={`${REPO}#hosted-demo-vs-running-locally`} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2 hover:text-amber-700">
            repo
          </a>
          , add <code className="rounded bg-amber-100 px-1">ANTHROPIC_API_KEY</code> and PayPal sandbox keys to <code className="rounded bg-amber-100 px-1">.env.local</code>, then{" "}
          <code className="rounded bg-amber-100 px-1">npm run dev</code>.
        </p>
      </div>
    </div>
  );
}
