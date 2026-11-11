import { env, paypalBase } from "./env";

export type PayPalApp = "main" | "payouts";

const tokenCache: Partial<Record<PayPalApp, { token: string; exp: number }>> =
  {};

function credentials(app: PayPalApp) {
  if (app === "payouts" && env.paypalUsClientId && env.paypalUsClientSecret) {
    return { id: env.paypalUsClientId, secret: env.paypalUsClientSecret };
  }
  return { id: env.paypalClientId, secret: env.paypalClientSecret };
}

export async function getAccessToken(app: PayPalApp = "main"): Promise<string> {
  const cached = tokenCache[app];
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const { id, secret } = credentials(app);
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(`${paypalBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok)
    throw new PayPalError(res.status, "AUTH_FAILED", await res.text());
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  tokenCache[app] = {
    token: data.access_token,
    exp: Date.now() + data.expires_in * 1000,
  };
  return tokenCache[app]!.token;
}

export class PayPalError extends Error {
  constructor(
    public status: number,
    public code: string,
    public body: string,
  ) {
    let detail = "";
    try {
      const j = JSON.parse(body) as { details?: { issue?: string; field?: string; description?: string }[]; message?: string };
      detail = j.details?.map((d) => `${d.issue ?? ""}${d.field ? " " + d.field : ""}${d.description ? ": " + d.description : ""}`).join("; ") ?? j.message ?? "";
    } catch {
      /* non-JSON body */
    }
    super(`PayPal ${status} ${code}${detail ? " (" + detail.slice(0, 300) + ")" : ""}`);
  }
}

export async function pp<T = unknown>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
  app: PayPalApp = "main",
): Promise<{ status: number; data: T; location?: string }> {
  const token = await getAccessToken(app);
  const res = await fetch(`${paypalBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const code = (data as { name?: string }).name ?? `HTTP_${res.status}`;
    throw new PayPalError(res.status, code, text);
  }
  return {
    status: res.status,
    data: data as T,
    location: res.headers.get("location") ?? undefined,
  };
}

/* ---------- Invoicing v2 ---------- */

export interface InvoiceRef {
  id: string;
  status?: string;
  href?: string;
}

export async function createInvoice(opts: {
  recipientEmail: string;
  recipientName?: string;
  amount: number;
  currency: string;
  itemName: string;
  note?: string;
  reference?: string;
  dueDate?: string;
}): Promise<InvoiceRef> {
  const body = {
    detail: {
      currency_code: opts.currency,
      note: opts.note,
      reference: opts.reference,
      payment_term: opts.dueDate ? { due_date: opts.dueDate } : undefined,
    },
    invoicer: {
      business_name: "ChitCircle",
      email_address: env.merchantEmail || undefined,
    },
    primary_recipients: [
      {
        billing_info: {
          name: opts.recipientName
            ? { given_name: opts.recipientName }
            : undefined,
          email_address: opts.recipientEmail,
        },
      },
    ],
    items: [
      {
        name: opts.itemName,
        quantity: "1",
        unit_amount: {
          currency_code: opts.currency,
          value: opts.amount.toFixed(2),
        },
      },
    ],
  };
  const r = await pp<{ id?: string; status?: string; href?: string }>(
    "POST",
    "/v2/invoicing/invoices",
    body,
  );
  // Without Prefer:return=representation PayPal returns only {rel,href}; with it, the full invoice.
  const id =
    r.data.id ?? r.data.href?.split("/").pop() ?? r.location?.split("/").pop();
  if (!id) throw new Error("Invoice created but no id returned");
  return { id, status: r.data.status, href: r.data.href };
}

export async function sendInvoice(invoiceId: string) {
  return pp("POST", `/v2/invoicing/invoices/${invoiceId}/send`, {
    send_to_invoicer: false,
    send_to_recipient: true,
  });
}

export async function sendInvoiceReminder(invoiceId: string, note: string) {
  return pp("POST", `/v2/invoicing/invoices/${invoiceId}/remind`, {
    subject: "Friendly reminder from your ChitCircle",
    note,
    send_to_invoicer: false,
    send_to_recipient: true,
  });
}

export async function recordInvoicePayment(
  invoiceId: string,
  amount: number,
  currency: string,
  note?: string,
) {
  return pp<{ payment_id?: string }>(
    "POST",
    `/v2/invoicing/invoices/${invoiceId}/payments`,
    {
      method: "OTHER",
      payment_date: new Date().toISOString().slice(0, 10),
      amount: { currency_code: currency, value: amount.toFixed(2) },
      note: note ?? "Recorded by ChitCircle",
    },
  );
}

export async function getInvoice(invoiceId: string) {
  return pp<{
    id: string;
    status: string;
    amount?: { value: string };
    detail?: unknown;
  }>("GET", `/v2/invoicing/invoices/${invoiceId}`);
}

export async function listInvoices(page = 1, pageSize = 20) {
  return pp<{ items?: unknown[]; total_items?: number }>(
    "GET",
    `/v2/invoicing/invoices?page=${page}&page_size=${pageSize}&total_required=true`,
  );
}

/** Returns a data: URL PNG for the invoice's pay QR code. */
export async function invoiceQrDataUrl(invoiceId: string): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch(
    `${paypalBase}/v2/invoicing/invoices/${invoiceId}/generate-qr-code`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ width: 300, height: 300, action: "pay" }),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new PayPalError(res.status, "QR_FAILED", text);
  // PayPal returns multipart/form-data with a base64 PNG part.
  const b64 =
    text
      .split(/\r?\n\r?\n/)[1]
      ?.split(/\r?\n--/)[0]
      ?.trim() ?? "";
  return `data:image/png;base64,${b64}`;
}

/* ---------- Recurring invoice series ---------- */

/** PayPal allows exactly one primary recipient per recurring series, so ChitCircle creates one series per member. */
export async function createRecurringSeries(opts: {
  recipientEmail: string;
  recipientName?: string;
  amount: number;
  currency: string;
  itemName: string;
  intervalUnit: "MONTH" | "WEEK";
  startDate: string;
  totalCycles: number;
  note?: string;
}): Promise<{ id?: string; raw: unknown }> {
  const body = {
    plan_detail: {
      frequency: { interval_unit: opts.intervalUnit, interval_count: 1 },
      start_series_date: opts.startDate,
      total_cycles: opts.totalCycles,
    },
    recurring_info: {
      detail: { currency_code: opts.currency, note: opts.note },
      invoicer: {
        business_name: "ChitCircle",
        email_address: env.merchantEmail || undefined,
      },
      primary_recipients: [
        {
          billing_info: {
            name: opts.recipientName ? { given_name: opts.recipientName } : undefined,
            email_address: opts.recipientEmail,
          },
        },
      ],
      items: [
        {
          name: opts.itemName,
          quantity: "1",
          unit_amount: {
            currency_code: opts.currency,
            value: opts.amount.toFixed(2),
          },
        },
      ],
    },
  };
  const r = await pp<{ id?: string; href?: string }>(
    "POST",
    "/v2/invoicing/recurring-invoices",
    body,
  );
  const id =
    r.data.id ?? r.data.href?.split("/").pop() ?? r.location?.split("/").pop();
  return { id, raw: r.data };
}

/* ---------- Payouts ---------- */

export type PayoutResult =
  | { status: "PAID"; batchId: string }
  | { status: "PENDING_REGION"; message: string }
  | { status: "FAILED"; message: string };

export async function sendPayout(opts: {
  receiverEmail: string;
  amount: number;
  currency: string;
  note: string;
  senderItemId: string;
}): Promise<PayoutResult> {
  try {
    const r = await pp<{ batch_header?: { payout_batch_id?: string } }>(
      "POST",
      "/v1/payments/payouts",
      {
        sender_batch_header: {
          sender_batch_id: `chit-${opts.senderItemId}-${Date.now()}`,
          email_subject: "Your ChitCircle pot has been paid out",
          email_message: opts.note,
        },
        items: [
          {
            recipient_type: "EMAIL",
            amount: { value: opts.amount.toFixed(2), currency: opts.currency },
            receiver: opts.receiverEmail,
            note: opts.note,
            sender_item_id: opts.senderItemId,
          },
        ],
      },
      {},
      "payouts",
    );
    return {
      status: "PAID",
      batchId: r.data.batch_header?.payout_batch_id ?? "unknown",
    };
  } catch (e) {
    if (e instanceof PayPalError && e.code === "PAYOUT_NOT_AVAILABLE") {
      return {
        status: "PENDING_REGION",
        message:
          "Payouts are unavailable for this sandbox business account's region. Payout queued; set PAYPAL_US_CLIENT_ID/SECRET (a US-region sandbox app) to disburse.",
      };
    }
    return {
      status: "FAILED",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/* ---------- Reporting ---------- */

export async function listTransactions(days = 30) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const q = new URLSearchParams({
    start_date: start.toISOString().replace(/\.\d{3}Z$/, "-0000"),
    end_date: end.toISOString().replace(/\.\d{3}Z$/, "-0000"),
    fields: "transaction_info",
    page_size: "50",
  });
  return pp<{ transaction_details?: unknown[] }>(
    "GET",
    `/v1/reporting/transactions?${q}`,
  );
}
