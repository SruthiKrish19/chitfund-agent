# ChitCircle

**An AI agent that runs a chit fund (rotating savings circle) end to end on PayPal.**
Built for the PayPal AI Hackathon 2026. MIT licensed.

A chit fund is how hundreds of millions of people in India, Africa, Latin America and diaspora communities save: a fixed group pays a fixed amount every cycle, and each cycle one member takes the whole pot. It runs on trust, a notebook and reminders, and breaks when someone forgets to pay or the money has to be collected in cash. ChitCircle replaces the notebook with PayPal and the organiser's nagging with an agent.

## What it does

1. The organiser describes the circle in plain language: *"Six of us, $50 a month starting December, winner by lottery."*
2. **Claude** parses that into a validated contract (members, amount, cadence, draw rules). Code re-validates every number before anything touches PayPal.
3. The agent creates a **PayPal recurring invoice series** for every member.
4. Each cycle it **sends PayPal invoices**, **records payments**, and **nudges late members** with PayPal invoice reminders whose text Claude personalises from each member's payment history. Every invoice has a **QR code** members can scan to pay.
5. When the pot is full it runs the **draw** (lottery or auction) and **pays the winner through PayPal Payouts**.
6. A transparent **ledger** (AG Grid) shows every invoice, payment, reminder, draw and payout with its PayPal ID.
7. Members can **ask the circle** anything: what they owe, whose turn is next, what happens if someone drops out. The assistant uses the PayPal Agent Toolkit as read-only tools.

The AI proposes; deterministic code validates and executes; PayPal records. The model can never move money.

## How PayPal is used (all in the free sandbox)

| PayPal capability | Where |
|---|---|
| Invoicing v2: create, send, remind, record payment, QR code | `src/lib/paypal.ts`, `src/lib/engine.ts` |
| Recurring invoice series (one per member) | `createRecurringSeries` in `src/lib/paypal.ts` |
| Payouts | `sendPayout` in `src/lib/paypal.ts`, called from `drawAndPay` |
| Transaction Search | `listTransactions` in `src/lib/paypal.ts` |
| Webhooks: `INVOICING.INVOICE.PAID` marks the member paid and triggers the draw | `src/app/api/webhooks/paypal/route.ts` |
| PayPal Agent Toolkit (`@paypal/agent-toolkit`) as the chat assistant's tool set | `src/lib/chat.ts` |

Two sandbox apps are supported because of regional rules: the main app handles invoicing, an optional US-region app handles payouts. See `.env.example`.

## How AI is used

- `src/lib/ai.ts`: Claude (`claude-sonnet-5-5` via `@anthropic-ai/sdk`) parses the organiser's description with structured outputs, and writes the reminder messages. Works through Vercel AI Gateway by setting `ANTHROPIC_BASE_URL`.
- `src/lib/chat.ts`: Claude answers member questions in a tool-use loop over local tools (`get_circle_state`, `simulate_dropout`) and PayPal Agent Toolkit tools (invoice list/get/search, reminders, QR codes, transactions).
- `src/lib/parser.ts`: deterministic fallback parser so the whole product runs with no AI key configured. The dashboard shows which path parsed the circle.

## Sponsor tools

- **AG Grid** (`ag-grid-react`, community edition): member ledger, cycle history and event ledger on the circle dashboard.

## Run it

```bash
npm install
cp .env.example .env.local   # fill in PayPal sandbox credentials (see below)
npm run dev                  # http://localhost:3000
```

Click **Seed demo circle** to create "Anna Nagar Friends Circle" (6 members, $50/month, lottery), then **Run cycle 1**. Move the slider to have only some members pay and watch the reminders go out; use **Mark paid** on the rest to complete the pot and trigger the draw and payout.

### Getting sandbox credentials

1. developer.paypal.com → Apps & Credentials (Sandbox) → Create App → copy Client ID and Secret into `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`.
2. Testing Tools → Sandbox Accounts → the business account email goes in `PAYPAL_MERCHANT_EMAIL`.
3. If your sandbox business account is outside the US, create a second business sandbox account with country **US**, create an app for it, and put its credentials in `PAYPAL_US_*` so Payouts work.

### Judges

Testing credentials and a hosted URL are in the Devpost submission's testing instructions. The app also runs fully locally with the steps above.

## Deploy

Vercel: import the repo, add the env vars from `.env.example`, optionally add Upstash Redis (the file store is memory-only on serverless). Add `https://<your-app>/api/webhooks/paypal` as a webhook for `INVOICING.INVOICE.PAID` in the PayPal app settings.

## Notes and limits

- The PayPal sandbox only supports USD for this account, so rupee amounts in descriptions are converted to USD.
- Auction draws use simulated sealed bids; the discount is redistributed as a dividend on the next cycle's invoices.
- Webhook signature verification is skipped in the sandbox demo; verify `PAYPAL-TRANSMISSION-SIG` before production.
- Recurring series are created in DRAFT; the agent sends each cycle's invoices itself so the demo can advance months in seconds.

## License

MIT, see `LICENSE`.
