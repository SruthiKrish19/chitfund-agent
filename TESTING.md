# Testing ChitCircle

All commands were run against the real PayPal sandbox on 2026-11-11 with `.env.local` filled in.

```bash
npm run build          # production build, passes
npx eslint src         # no warnings
npx tsc --noEmit -p .  # no type errors

PORT=3077 npm run dev &
curl -s localhost:3077/api/health
# {"paypal":true,"paypalEnv":"sandbox","ai":false,"model":"claude-sonnet-5-5","storage":"file"}

# 1. Seed the demo circle (creates 6 PayPal recurring invoice series)
curl -s -X POST localhost:3077/api/seed > seed.json
ID=$(python3 -c "import json;print(json.load(open('seed.json'))['id'])")

# 2. Run cycle 1 with 4 of 6 members paying; reminders go to the other 2
curl -s -X POST localhost:3077/api/circles/$ID/simulate \
  -H 'Content-Type: application/json' -d '{"payCount":4,"nudge":true}' > c1.json
# Observed: 6 invoices created+sent (INV2-...), 4 payments recorded, 2 reminders sent

# 3. Mark the remaining members paid -> pot full -> lottery draw -> Payout
curl -s -X POST localhost:3077/api/circles/$ID/pay \
  -H 'Content-Type: application/json' -d '{"memberId":"<id from c1.json>"}'
# Observed: payout.status "PAID", batchId "QRDZY327NTDCU" (US sandbox app)
# Without PAYPAL_US_* configured, the IN app returns PAYOUT_NOT_AVAILABLE and the
# ledger records the payout as PENDING_REGION ("QUEUED (region)" badge in the UI).

# 4. Second cycle, everyone pays
curl -s -X POST localhost:3077/api/circles/$ID/simulate \
  -H 'Content-Type: application/json' -d '{"payCount":6}'
# Observed: winner Ravi, payout PAID, batch 3VBAESJJKX54E

# 5. Chat (fallback mode when ANTHROPIC_API_KEY is empty)
curl -s -X POST localhost:3077/api/circles/$ID/chat \
  -H 'Content-Type: application/json' -d '{"question":"what do I still owe?"}'

# 6. QR code for an invoice
curl -s "localhost:3077/api/circles/$ID/qr?invoiceId=INV2-..."  # {"dataUrl":"data:image/png;base64,..."}

# 7. Webhook (simulate PayPal INVOICING.INVOICE.PAID)
curl -s -X POST localhost:3077/api/webhooks/paypal -H 'Content-Type: application/json' \
  -d '{"event_type":"INVOICING.INVOICE.PAID","resource":{"invoice":{"detail":{"reference":"<circleId>-<cycle>-<memberId>"}}}}'
```

Known sandbox behaviours found while testing:

- A recurring invoice series accepts exactly one primary recipient, so one series is created per member.
- USD invoices cannot be sent to an India-region sandbox personal account (`INR_FOREIGN_CURRENCY_BLOCKED`), so the demo's real payer is the US sandbox business account.
- Payouts from an India-region sandbox business account return `PAYOUT_NOT_AVAILABLE`; the US app succeeds.
