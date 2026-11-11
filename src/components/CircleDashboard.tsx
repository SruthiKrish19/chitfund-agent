"use client";
import { useCallback, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import type { Circle, Cycle, LedgerEntry } from "@/lib/types";

ModuleRegistry.registerModules([AllCommunityModule]);
const theme = themeQuartz.withParams({ accentColor: "#d97706", borderRadius: 8, fontSize: 13 });

type ChatMsg = { role: "user" | "assistant"; content: string; tools?: string[] };

export default function CircleDashboard({ initial }: { initial: Circle }) {
  const [circle, setCircle] = useState<Circle>(initial);
  const [payCount, setPayCount] = useState(initial.members.length);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<{ memberName: string; dataUrl: string } | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [question, setQuestion] = useState("");

  const current = circle.cycles[circle.cycles.length - 1];
  const memberName = useCallback((id?: string) => circle.members.find((m) => m.id === id)?.name ?? "", [circle.members]);
  const done = circle.cycles.length >= circle.members.length;

  async function call(path: string, body?: unknown, label = path) {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(`/api/circles/${circle.id}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      return data;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function simulate() {
    const data = await call("/simulate", { payCount, nudge: true }, "simulate");
    if (data) setCircle(data);
  }
  async function nudge() {
    const data = await call("/nudge", undefined, "nudge");
    if (data) setCircle(data);
  }
  async function markPaid(memberId: string) {
    const data = await call("/pay", { memberId }, `pay-${memberId}`);
    if (data) setCircle(data);
  }
  async function showQr(invoiceId: string, name: string) {
    setBusy("qr");
    try {
      const res = await fetch(`/api/circles/${circle.id}/qr?invoiceId=${invoiceId}`);
      const data = await res.json();
      if (res.ok) setQr({ memberName: name, dataUrl: data.dataUrl });
      else setError(data.error);
    } finally {
      setBusy(null);
    }
  }
  async function ask() {
    const q = question.trim();
    if (!q) return;
    setQuestion("");
    const history = chat.map(({ role, content }) => ({ role, content }));
    setChat((c) => [...c, { role: "user", content: q }]);
    const data = await call("/chat", { question: q, history }, "chat");
    if (data) setChat((c) => [...c, { role: "assistant", content: data.reply, tools: data.toolsUsed }]);
  }

  /* ---- member ledger rows: one row per member, one column per cycle ---- */
  const memberRows = useMemo(
    () =>
      circle.members.map((m) => {
        const row: Record<string, unknown> = { id: m.id, name: m.name, email: m.email, won: m.wonCycle ? `Cycle ${m.wonCycle}` : "" };
        let paidTotal = 0;
        for (const c of circle.cycles) {
          const inv = c.invoices.find((i) => i.memberId === m.id);
          row[`c${c.index}`] = inv ? inv.status : "";
          if (inv?.status === "PAID") paidTotal += inv.amount;
        }
        row.paidTotal = paidTotal;
        const cur = current?.invoices.find((i) => i.memberId === m.id);
        row.currentStatus = cur?.status ?? "";
        row.invoiceId = cur?.invoiceId ?? "";
        return row;
      }),
    [circle, current],
  );

  const memberCols = useMemo<ColDef[]>(() => {
    const statusCell = (p: { value?: string }) => {
      const v = p.value ?? "";
      const cls =
        v === "PAID" ? "bg-emerald-100 text-emerald-800" : v === "REMINDED" ? "bg-amber-100 text-amber-800" : v === "SENT" ? "bg-sky-100 text-sky-800" : v === "FAILED" ? "bg-rose-100 text-rose-800" : "";
      return v ? <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{v}</span> : null;
    };
    const cols: ColDef[] = [
      { field: "name", headerName: "Member", pinned: "left", width: 130 },
      { field: "email", headerName: "PayPal email", width: 230 },
      ...circle.cycles.map<ColDef>((c) => ({ field: `c${c.index}`, headerName: c.label, width: 120, cellRenderer: statusCell })),
      { field: "paidTotal", headerName: "Paid total", width: 110, valueFormatter: (p) => `$${Number(p.value ?? 0).toFixed(2)}` },
      { field: "won", headerName: "Received pot", width: 120 },
      {
        headerName: "Actions",
        width: 200,
        cellRenderer: (p: { data: Record<string, string> }) => {
          const st = p.data.currentStatus;
          if (!st || st === "PAID" || st === "FAILED") return null;
          return (
            <div className="flex gap-2">
              <button onClick={() => markPaid(p.data.id)} className="rounded border border-stone-300 px-2 py-0.5 text-xs hover:bg-stone-100">Mark paid</button>
              {p.data.invoiceId && (
                <button onClick={() => showQr(p.data.invoiceId, p.data.name)} className="rounded border border-stone-300 px-2 py-0.5 text-xs hover:bg-stone-100">QR</button>
              )}
            </div>
          );
        },
      },
    ];
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circle.cycles]);

  const cycleCols = useMemo<ColDef<Cycle>[]>(
    () => [
      { field: "index", headerName: "#", width: 60 },
      { field: "label", headerName: "Cycle", width: 120 },
      { field: "collected", headerName: "Collected", width: 110, valueFormatter: (p) => `$${Number(p.value ?? 0).toFixed(2)}` },
      { headerName: "Winner", width: 120, valueGetter: (p) => memberName(p.data?.winnerId) },
      { headerName: "Payout", width: 110, valueGetter: (p) => (p.data?.payout.amount ? `$${p.data.payout.amount.toFixed(2)}` : "") },
      {
        headerName: "Payout status",
        width: 150,
        valueGetter: (p) => p.data?.payout.status ?? "",
        cellRenderer: (p: { value: string }) => {
          const v = p.value;
          const cls = v === "PAID" ? "bg-emerald-100 text-emerald-800" : v === "PENDING_REGION" ? "bg-amber-100 text-amber-800" : v === "FAILED" ? "bg-rose-100 text-rose-800" : "bg-stone-100 text-stone-600";
          const label = v === "PENDING_REGION" ? "QUEUED (region)" : v;
          return v && v !== "NOT_RUN" ? <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span> : null;
        },
      },
      { headerName: "PayPal batch", flex: 1, valueGetter: (p) => p.data?.payout.batchId ?? p.data?.payout.message ?? "" },
      { headerName: "Dividend", width: 100, valueGetter: (p) => (p.data?.dividendPerMember ? `$${p.data.dividendPerMember.toFixed(2)}` : "") },
    ],
    [memberName],
  );

  const ledgerCols = useMemo<ColDef<LedgerEntry>[]>(
    () => [
      { field: "at", headerName: "When", width: 170, valueFormatter: (p) => new Date(p.value as string).toLocaleString() },
      { field: "kind", headerName: "Event", width: 160 },
      { field: "cycle", headerName: "Cycle", width: 80 },
      { headerName: "Member", width: 110, valueGetter: (p) => memberName(p.data?.memberId) },
      { field: "amount", headerName: "Amount", width: 100, valueFormatter: (p) => (p.value != null ? `$${Number(p.value).toFixed(2)}` : "") },
      { field: "paypalId", headerName: "PayPal ID", width: 220 },
      { field: "detail", headerName: "Detail", flex: 1, wrapText: true, autoHeight: true },
    ],
    [memberName],
  );

  const target = current ? current.invoices.reduce((s, i) => s + i.amount, 0) : 0;
  const pct = target ? Math.round((current!.collected / target) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{circle.name}</h1>
          <p className="mt-1 text-sm text-stone-600">
            {circle.members.length} members · {circle.currency} {circle.contribution.toFixed(2)} per {circle.cadence.toLowerCase()} · {circle.drawMode} draw · starts {circle.startDate}
            {circle.foremanCommissionPct ? ` · ${circle.foremanCommissionPct}% foreman commission` : ""}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Rules parsed by {circle.parsedBy === "claude" ? "Claude" : "fallback parser"}
            {circle.members.some((m) => m.recurringSeriesId) ? ` · ${circle.members.filter((m) => m.recurringSeriesId).length} PayPal recurring invoice series` : ""}
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm shadow-sm">
          <div className="text-stone-500">Cycles</div>
          <div className="text-2xl font-semibold">
            {circle.cycles.length}/{circle.members.length}
          </div>
        </div>
      </div>

      {/* controls */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm lg:col-span-2">
          <h2 className="font-medium">Simulate the next cycle</h2>
          <p className="mt-1 text-xs text-stone-500">
            Sends a PayPal invoice to every member, records payments for the first <b>{payCount}</b> members, nudges the rest with reminders, and runs the draw plus payout when the pot is full.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="text-sm">
              Members who pay:
              <input type="range" min={0} max={circle.members.length} value={payCount} onChange={(e) => setPayCount(Number(e.target.value))} className="ml-2 align-middle accent-amber-600" />
              <span className="ml-2 font-medium">{payCount}/{circle.members.length}</span>
            </label>
            <button onClick={simulate} disabled={busy !== null || done} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50">
              {busy === "simulate" ? "Running cycle…" : done ? "Circle complete" : `Run cycle ${circle.cycles.length + 1}`}
            </button>
            <button onClick={nudge} disabled={busy !== null || !current} className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100 disabled:opacity-50">
              {busy === "nudge" ? "Nudging…" : "Nudge unpaid"}
            </button>
          </div>
          {current && (
            <div className="mt-4">
              <div className="flex justify-between text-sm">
                <span>
                  {current.label}: {circle.currency} {current.collected.toFixed(2)} of {target.toFixed(2)}
                </span>
                <span>
                  {current.winnerId ? `Winner: ${memberName(current.winnerId)}` : `${current.invoices.filter((i) => i.status !== "PAID").length} unpaid`}
                </span>
              </div>
              <div className="mt-1 h-2 w-full rounded bg-stone-200">
                <div className="h-2 rounded bg-gradient-to-r from-amber-400 to-rose-500" style={{ width: `${pct}%` }} />
              </div>
              {current.payout.status !== "NOT_RUN" && (
                <div className="mt-2 text-sm">
                  Payout {circle.currency} {current.payout.amount.toFixed(2)} to {memberName(current.winnerId)}:{" "}
                  <span className={current.payout.status === "PAID" ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>
                    {current.payout.status === "PAID" ? `sent (batch ${current.payout.batchId})` : current.payout.status === "PENDING_REGION" ? "queued, payouts unavailable in this sandbox region" : current.payout.message}
                  </span>
                </div>
              )}
            </div>
          )}
          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        </div>

        {/* chat */}
        <div className="flex h-80 flex-col rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="font-medium">Ask the circle</h2>
          <div className="mt-2 flex-1 space-y-2 overflow-y-auto text-sm">
            {chat.length === 0 && <p className="text-xs text-stone-500">Try: &quot;what do I still owe?&quot;, &quot;when is Meena&apos;s turn?&quot;, &quot;what if Ravi drops out?&quot;</p>}
            {chat.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : ""}>
                <span className={`inline-block max-w-[90%] rounded-lg px-3 py-2 ${m.role === "user" ? "bg-stone-900 text-white" : "bg-stone-100"}`}>{m.content}</span>
                {m.tools && m.tools.length > 0 && <div className="mt-0.5 text-[10px] text-stone-400">tools: {m.tools.join(", ")}</div>}
              </div>
            ))}
            {busy === "chat" && <div className="text-xs text-stone-400">thinking…</div>}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
            className="mt-2 flex gap-2"
          >
            <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a question" className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none" />
            <button disabled={busy !== null} className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50">Ask</button>
          </form>
        </div>
      </div>

      {/* member ledger */}
      <section>
        <h2 className="mb-2 font-medium">Members</h2>
        <div style={{ height: Math.min(80 + circle.members.length * 42, 520) }}>
          <AgGridReact theme={theme} rowData={memberRows} columnDefs={memberCols} defaultColDef={{ sortable: true, resizable: true }} animateRows />
        </div>
      </section>

      {/* cycles */}
      <section>
        <h2 className="mb-2 font-medium">Cycles</h2>
        <div style={{ height: Math.min(80 + Math.max(circle.cycles.length, 1) * 42, 400) }}>
          <AgGridReact theme={theme} rowData={circle.cycles} columnDefs={cycleCols} defaultColDef={{ sortable: true, resizable: true }} />
        </div>
      </section>

      {/* ledger */}
      <section>
        <h2 className="mb-2 font-medium">Ledger ({circle.ledger.length} events, newest first)</h2>
        <div style={{ height: 420 }}>
          <AgGridReact theme={theme} rowData={circle.ledger} columnDefs={ledgerCols} defaultColDef={{ sortable: true, filter: true, resizable: true }} pagination paginationPageSize={20} />
        </div>
      </section>

      {qr && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40" onClick={() => setQr(null)}>
          <div className="rounded-xl bg-white p-6 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium">Pay invoice: {qr.memberName}</h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.dataUrl} alt="PayPal invoice QR code" className="mx-auto mt-3 h-64 w-64" />
            <p className="mt-2 text-xs text-stone-500">Scan with the PayPal app (sandbox) to pay this contribution.</p>
            <button onClick={() => setQr(null)} className="mt-3 rounded-lg border border-stone-300 px-4 py-1.5 text-sm hover:bg-stone-100">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
