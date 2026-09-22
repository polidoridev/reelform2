# Reelform pricing and unit economics

Prices are USD. Prepared September 20, 2026.

| Plan | Monthly | Annual upfront | Credits released each month | Approx. 5s 720p clips / month |
| --- | ---: | ---: | ---: | ---: |
| Starter | $19 | $190 | 2,000 | 2 |
| Pro | $49 | $490 | 5,500 | 5 |
| Studio | $129 | $1,290 | 15,000 | 15 |

Annual billing saves two monthly payments (16.67%). It does not unlock a year's credits immediately. Each credit grant expires 90 days after it becomes available, including monthly allowances, purchases, auto-reloads, and replacement grants for refunds after expiry. Annual allowances still release monthly; each has its own 90-day window. Spend credits in order of earliest expiry. Refunds before expiry keep the original deadline. Purchased credits remain usable until expiry after cancellation. Existing perpetual credits receive 90 days from migration deployment (or their future release date); expired credits are not restored. Extra packs require an active paid subscription: 900/$10, 2,400/$25, 6,200/$60. Auto-reload is disabled by default, requires recorded charge consent and a saved card, and enforces a customer-selected cap per calendar month in UTC. Plan/cadence changes start at renewal, with no mid-cycle credit windfall or surprise proration.

## Cost model

[Higgsfield Seedance 2.5 Edit](https://open.higgsfield.ai/models/bytedance/seedance-2.5/video-edit/playground) publishes a token formula that bills source and output durations: `ceil((input seconds + output seconds) × width × height × 24 / 1024) × $0.01284 / 1000`. Use that formula, rather than the lower marketing “from” rate or assuming a negotiated API discount. References do not count as additional video duration.

A 5-second 1280×720 edit with a 5-second source has an estimated undiscounted provider cost of $2.77344. The app charges 360 credits per provider dollar, rounded up to 10 credits: 1,000 credits in this example. A typical 5-second 480p edit is approximately 450 credits. Source MP4 duration and dimensions are inspected on the server. Quoted credits are confirmed by the customer before generation.

At full allowance use, ignoring quote-rounding benefits, the provider-cost ceiling is credits / 360:

| Plan | Monthly provider budget | Monthly contribution before fees | Annual provider budget | Annual contribution before fees |
| --- | ---: | ---: | ---: | ---: |
| Starter | $5.56 | $13.44 (70.8%) | $66.67 | $123.33 (64.9%) |
| Pro | $15.28 | $33.72 (68.8%) | $183.33 | $306.67 (62.6%) |
| Studio | $41.67 | $87.33 (67.7%) | $500.00 | $790.00 (61.2%) |

These are modeled gross contribution margins, not promised net profit. Subtract payment/Billing fees, refunds, chargebacks, taxes, currency conversion, storage, hosting, email, customer support, acquisition, and any unrecovered provider charges. [Stripe's Canadian pricing](https://stripe.com/en-ca/pricing) varies by payment method and currency. A planning allowance of **5% of receipts plus US$0.30 per transaction** is a conservative modeling assumption, not a quoted Stripe contract rate; annual Studio leaves about 56.2% before other operating costs under that assumption.

The margin model depends on edits preserving clip duration and the documented model resolution rules. Before public paid launch, fund the owner's Higgsfield API account, run representative 480p/720p edits, compare actual API debits against quotes, and adjust `CREDITS_PER_PROVIDER_DOLLAR` if necessary. Provider pricing may change. Do not offer unlimited generations or cash-equivalent credits.

## Stripe configuration

The live Chrome account contains Starter/Pro/Studio at $19/$49/$129 monthly and the existing credit packs. Test mode is a separate Stripe account with separate IDs. Monthly and new annual prices are recorded in `stripe-live-prices.json`; all three live annual prices have been created. Test annual prices were also created on the existing test products. One old large-pack test price was CAD; a USD price was added rather than changing an existing price. The app validates price currency, amount, and interval before checkout.

Only the server accepts allowed plan IDs and price IDs. Signed Stripe webhooks grant credits after payment, with unique invoice/payment references and database locks. Stripe checkout sessions are serialized per user. Refunded/disputed payments put the account on billing hold for review.

## 90-day credit expiry rollout

Apply `20260922152536_credit_expiry_90_days.sql` before deploying the account UI, which reads `nextExpiry` and `nextExpiryCredits` from `rf_balances`. The migration changes grant expiry and spend order; it does not charge customers or modify grant amounts. Existing non-expiring credits receive a full 90-day transition window. Previously expired credits remain expired. No expiry cron is needed: balances and reservations enforce expiry against the database clock.

Run the isolated PostgreSQL regression checks with `PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node scripts/test-credit-expiry.mjs`. They do not use the live database or Stripe.
