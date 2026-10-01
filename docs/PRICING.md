# Reelform pricing and unit economics

Prices are USD. Economics reviewed October 1, 2026. Keep the existing prices and credit conversion for now; positive contribution is modeled, not verified net profit.

| Plan | Monthly | Annual upfront | Credits released each month | 5s Genjutsu 720p clips / monthly grant |
| --- | ---: | ---: | ---: | ---: |
| Starter | $19 | $190 | 2,000 | 1 |
| Pro | $49 | $490 | 5,500 | 4 |
| Studio | $129 | $1,290 | 15,000 | 12 |

Annual billing saves two monthly payments (16.67%). It does not unlock a year's credits immediately. Each credit grant expires 90 days after it becomes available, including monthly allowances, purchases, auto-reloads, and replacement grants for refunds after expiry. Annual allowances still release monthly; each has its own 90-day window. Spend credits in order of earliest expiry. Refunds before expiry keep the original deadline. Purchased credits remain usable until expiry after cancellation. Existing perpetual credits receive 90 days from migration deployment (or their future release date); expired credits are not restored. Extra packs require an active paid subscription: 900/$10, 2,400/$25, 6,200/$60. Auto-reload is disabled by default, requires recorded charge consent and a saved card, and enforces a customer-selected cap per calendar month in UTC. Plan/cadence changes start at renewal, with no mid-cycle credit windfall or surprise proration.

## Cost model

[Higgsfield Seedance 2.5 Edit](https://open.higgsfield.ai/models/bytedance/seedance-2.5/video-edit/playground) publishes a token formula that bills source and output durations: `ceil((input seconds + output seconds) × width × height × 24 / 1024) × $0.01284 / 1000`. Use that formula, rather than the lower marketing “from” rate or assuming a negotiated API discount. References do not count as additional video duration.

A 5-second 1280×720 edit with a 5-second source has an estimated undiscounted provider cost of $2.77344. The app charges 360 credits per provider dollar, rounded up to 10 credits: 1,000 credits in this example. A 5-second 16:9 Seedance 2.5 Edit at 480p is 450 credits. The featured Genjutsu models instead cost 1,230 credits at 720p or 580 at 480p for five seconds; 1080p costs 2,940. Clip counts depend on the model, resolution, shape, and duration, not just the plan. Source MP4 duration and dimensions are inspected on the server. Quoted credits are confirmed by the customer before generation.

At full allowance use, ignoring quote-rounding benefits, the provider-cost ceiling is credits / 360:

| Plan | Monthly provider budget | Monthly contribution before fees | Annual provider budget | Annual contribution before fees |
| --- | ---: | ---: | ---: | ---: |
| Starter | $5.56 | $13.44 (70.8%) | $66.67 | $123.33 (64.9%) |
| Pro | $15.28 | $33.72 (68.8%) | $183.33 | $306.67 (62.6%) |
| Studio | $41.67 | $87.33 (67.7%) | $500.00 | $790.00 (61.2%) |

These are modeled gross contribution margins, not promised net profit. Subtract payment/Billing fees, refunds, chargebacks, taxes, currency conversion, storage, hosting, email, customer support, acquisition, and any unrecovered provider charges. [Stripe's Canadian pricing](https://stripe.com/en-ca/pricing) varies by payment method and currency. The updated planning model below replaces the previous 5% fee allowance. That allowance was too low for some international/FX combinations.

The margin model depends on edits preserving clip duration and the documented model resolution rules. Before public paid launch, fund the owner's Higgsfield API account, run representative 480p/720p edits, compare actual API debits against quotes, and adjust `CREDITS_PER_PROVIDER_DOLLAR` if necessary. Provider pricing may change. Do not offer unlimited generations or cash-equivalent credits.

## Stripe configuration

The live Chrome account contains Starter/Pro/Studio at $19/$49/$129 monthly and the existing credit packs. Test mode is a separate Stripe account with separate IDs. Monthly and new annual prices are recorded in `stripe-live-prices.json`; all three live annual prices have been created. Test annual prices were also created on the existing test products. One old large-pack test price was CAD; a USD price was added rather than changing an existing price. The app validates price currency, amount, and interval before checkout.

Only the server accepts allowed plan IDs and price IDs. Signed Stripe webhooks grant credits after payment, with unique invoice/payment references and database locks. Stripe checkout sessions are serialized per user. Refunded/disputed payments put the account on billing hold for review.

## 90-day credit expiry rollout

Apply `20260922152536_credit_expiry_90_days.sql` before deploying the account UI, which reads `nextExpiry` and `nextExpiryCredits` from `rf_balances`. The migration changes grant expiry and spend order; it does not charge customers or modify grant amounts. Existing non-expiring credits receive a full 90-day transition window. Previously expired credits remain expired. No expiry cron is needed: balances and reservations enforce expiry against the database clock.

Run the isolated PostgreSQL regression checks with `PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node scripts/test-credit-expiry.mjs`. They do not use the live database or Stripe.

## Owner budget and decision — October 1, 2026

The owner supplied hosting $20/month, ChatGPT Pro $130/month, and advertising $20/day. Treat these as USD pending currency confirmation: $750 per 30-day month, $770 for October (31 days), and $710 for a 28-day February. These are supplied expenses, not independently verified vendor prices. Include incremental storage, email, support, refunds above reserve, owner labor, and taxes when known. ChatGPT Pro is treated as a business expense here; apportion it if it is shared with other work.

Keep Starter $19, Pro $49, Studio $129, existing annual prices, and existing credit packs. The current model already charges enough per modeled provider dollar; raising prices further could worsen customer value. Starter buys only one five-second featured 720p generation per monthly grant (with credits left over), so the public page now states that clearly. Actual willingness to pay and paid retention remain untested. Do not increase the annual discount or add coupons without rerunning the audit: annual Studio is close to the planning floor.

### Conservative contribution model

Assume every credit is spent, with no benefit from expiration or quote rounding. Deduct 7% of revenue plus US$0.30 per payment for payment/Billing/FX fees, 3% of revenue for refunds/disputes, and an additional 15% of modeled provider spend for unrecovered failures or price variance. These are planning reserves, not guarantees or measured averages. Free trials and admin generations must be budgeted separately.

Stripe Canada currently lists domestic cards at 2.9% + CA$0.30, with 0.8% extra for international cards and 2% when currency conversion is required; Billing and other services can add fees. The model uses a deliberately separate US$0.30 fixed reserve and rounds percentage allowances upward. Actual fee treatment depends on account, settlement currency, tax collected, and enabled products. Source: https://stripe.com/en-ca/pricing (accessed October 1, 2026).

| Plan | Monthly contribution after reserves | Annual contribution, per month | Monthly / annual margin |
| --- | ---: | ---: | ---: |
| Starter | $10.41 | $7.84 | 54.8% / 49.5% |
| Pro | $26.23 | $19.16 | 53.5% / 46.9% |
| Studio | $67.88 | $48.81 | 52.6% / 45.4% |

Annual contributions spread the upfront receipt, one payment fee, and all 12 monthly allowances over 12 months. Annual cash collected is not immediately earned profit. Top-up contributions after reserves are $5.82, $14.53, and $33.89 per small/medium/large purchase.

### Break-even and profit targets

| Subscriber mix (all one plan/cadence for comparison) | Cover $750/month | Cover October $770 | October + $1,000 owner profit before income tax |
| --- | ---: | ---: | ---: |
| Starter monthly | 73 | 74 | 171 |
| Pro monthly | 29 | 30 | 68 |
| Studio monthly | 12 | 12 | 27 |
| Starter annual | 96 | 99 | 226 |
| Pro annual | 40 | 41 | 93 |
| Studio annual | 16 | 16 | 37 |

For a mix, use `10.4111 × monthly Starter + 26.2306 × monthly Pro + 67.8833 × monthly Studio + 7.8361 × annual Starter + 19.1556 × annual Pro + 48.8083 × annual Studio + top-up contribution − monthly overhead`. This is modeled operating surplus before unlisted costs and income tax. Each subscriber's entire allowance cost is reserved even when they have not used it yet.

At $600 advertising per 30-day month, 10 new paying subscribers means $60 acquisition cost; 20 means $30; 30 means $20. A monthly Pro customer contributes about $26.23/month before overhead: $30 acquisition cost takes about 1.14 paid months to recover, $60 takes about 2.29, assuming retention and unchanged costs. Start with a target of at most $25 advertising cost per new paid Pro subscriber, then evaluate retention and actual margins before scaling. This is a planning target, not a prediction of ad performance. Track acquisition by plan; a $25 acquisition cost takes about 2.4 months to recover on monthly Starter. Avoid double-counting acquisition cost in the company profit formula: the $600/month ad budget is already in overhead.

The free-trial pilot has a separate $150 modeled provider budget, with up to $3.90 reserved per participant across three attempts. If the full $150 is incremental to October's budget, break-even rises from 30 to 36 monthly Pro subscribers. At 10% trial-to-paid conversion, $1.30 per participant implies $13 trial acquisition cost per payer; three attempts per participant imply up to $39, before ads. Do not expand the trial budget based only on signups.

### Verification and repeatable check

Run `node --import tsx scripts/audit-pricing.ts 770`. This offline audit reads the actual plan constants and fails if any offer drops below a 45% contribution margin under the stated reserves. It also checks quote coverage across every video model and supported edit resolution. It does not automatically run in CI or block checkout. Run it whenever prices, credit allowances, discounts, or provider rates change. Existing video-model tests also cover creation quotes.

Higgsfield's public Genjutsu overview still lists undiscounted 480p/720p rates matching the configured values ($0.318/$0.681 per second): https://console.higgsfield.ai/models/workflows%2Fgenjutsu/playground. The model-specific documentation endpoints returned HTTP 403 during this review; the full catalog and 1080p rates were not independently reverified. Use the repository's September 27 rates provisionally, with no promotional discount assumed. Before expanding spend, reconcile representative real provider debits against estimates and compare Stripe net receipts with modeled fees. The 15% reserve is not a cap on actual overruns.

No live Stripe prices, subscriptions, ad budgets, or deployments were changed in this review.
