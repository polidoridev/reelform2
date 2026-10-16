# Reelform pricing and unit economics

Prices are USD. Economics and Genjutsu API list prices reviewed October 14, 2026; Wan reference-video billing corrected October 15, 2026. Keep the existing subscription prices and credit conversion for now; positive contribution is modeled, not verified net profit.

| Plan | Monthly | Annual upfront | Credits released each month | 5s Genjutsu 720p clips / monthly grant |
| --- | ---: | ---: | ---: | ---: |
| Starter | $19 | $190 | 2,000 | 1 |
| Pro | $49 | $490 | 5,500 | 4 |
| Studio | $129 | $1,290 | 15,000 | 12 |

Annual billing saves two monthly payments (16.67%). It does not unlock a year's credits immediately. Each credit grant expires 90 days after it becomes available, including monthly allowances, purchases, auto-reloads, and replacement grants for refunds after expiry. Annual allowances still release monthly; each has its own 90-day window. Spend credits in order of earliest expiry. Refunds before expiry keep the original deadline. Purchased credits remain usable until expiry after cancellation. Existing perpetual credits receive 90 days from migration deployment (or their future release date); expired credits are not restored. Extra packs require an active paid subscription: 900/$10, 2,400/$25, 6,200/$60. Auto-reload is disabled by default, requires recorded charge consent and a saved card, and enforces a customer-selected cap per calendar month in UTC. Plan/cadence changes start at renewal, with no mid-cycle credit windfall or surprise proration.

## Cost model

[Higgsfield Seedance 2.5 Edit](https://open.higgsfield.ai/models/bytedance/seedance-2.5/video-edit/playground) publishes a token formula that bills source and output durations: `ceil((input seconds + output seconds) × width × height × 24 / 1024) × $0.01284 / 1000`. Use that formula, rather than the lower marketing “from” rate or assuming a negotiated API discount. References do not count as additional video duration.

A 5-second 1280×720 edit with a 5-second source has an estimated undiscounted provider cost of $2.77344. The app currently charges 360 credits per provider dollar, rounded up to 10 credits: 1,000 credits in this example. A 5-second 16:9 Seedance 2.5 Edit at 480p is 450 credits. The featured Genjutsu models instead cost 1,230 credits at 720p or 580 at 480p for five seconds; 1080p costs 2,940. Clip counts depend on the model, resolution, shape, and duration, not just the plan. Source MP4 duration and dimensions are inspected on the server. Quoted credits are confirmed by the customer before generation.

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

Run `node --import tsx scripts/audit-pricing.ts 770`. This offline audit reads the actual plan constants and fails if any offer drops below a 45% contribution margin under the stated reserves. It also checks quote coverage across every video model, supported edit resolution, and supported creation shape. It does not automatically run in CI or block checkout. Run it whenever prices, credit allowances, discounts, or provider rates change. Existing video-model tests also cover creation quotes.

### Genjutsu rate verification and safeguards — October 14, 2026

The owner reports 600 **Higgsfield website credits** for a 30-second 1080p Motion Transfer. Those credits are separate from the API's USD billing and from Reelform credits. No website-credit-to-dollar conversion is assumed.

Verified the public pricing descriptions for [Motion Transfer](https://open.higgsfield.ai/models/higgsfield/genjutsu/motion-transfer/v1.0/playground) and [Object Swap](https://open.higgsfield.ai/models/higgsfield/genjutsu/object-swap/v1.0/playground): input seconds round up to whole seconds, at the undiscounted rates below. The [API pricing page](https://open.higgsfield.ai/pricing) distinguishes list prices from account-dependent discounts. Reelform uses list prices, without relying on discounts.

| Quality | API USD / input second | API estimate for 30 seconds | Reelform credits for 30 seconds |
| --- | ---: | ---: | ---: |
| 480p | $0.318 | $9.54 | 3,440 |
| 720p | $0.681 | $20.43 | 7,360 |
| 1080p | $1.632 | $48.96 | 17,630 |

These rates already matched the configured values; no increase to subscription prices, credit packs, or generation charges was necessary. Motion Transfer now starts at 720p; Full HD is an explicit user choice. The public pricing table shows 5-, 10-, 20-, and 30-second quotes at all three qualities. It explicitly explains that a 30-second 1080p generation exceeds Studio's 15,000-credit monthly grant and requires extra or previously saved credits.

`lib/commerce/economics.ts` centralizes the existing reserves and 45% contribution floor. `CREDITS_PER_PROVIDER_DOLLAR` is now the greater of the existing 360 conversion and the amount needed to protect the cheapest configured offer, rounded upward to 10. It includes all annual allowances, preset packs, and every custom top-up increment. Future changes to the configured prices or allowances cannot silently push generation contribution below the planning floor. Promotions or credits granted outside these configured offers still need a separate review.

Invalid or missing provider costs fail closed. `/api/generate` recalculates the quote before reserving credits or submitting to Higgsfield; a changed charge returns a review-required error, and the studio obtains a fresh quote without auto-submitting. Free-trial limits are checked against the recalculated provider estimate too. Trials remain explicit Seedance edits, separate from paid Motion Transfer.

The offline audit now covers 201 offers and 297 edit/creation quote combinations. Regression tests in `tests/generation-pricing.test.ts` verify the 30-second rates, fractional-second rounding, the margin floor, cheaper-offer scenarios, and stale/invalid quotes. Run `node --import tsx --test tests/generation-pricing.test.ts tests/topup-pricing.test.ts` and `node --import tsx scripts/audit-pricing.ts 770`.

These are modeled contribution margins: 45.4%–58.2% across current offers under the stated reserves, before overhead and excluded expenses. Actual provider invoices, discounts, payment fees, paid retention, and net business profit were not reconciled in this review. The provider-overrun reserve does not automatically discover or cap future API price increases.

No live Stripe prices, subscriptions, ad budgets, or deployments were changed in this review.

### Wan reference-video billing correction — October 15, 2026

The current [Wan 3.0](https://open.higgsfield.ai/models/alibaba/wan-3.0/reference-to-video/playground) and [Wan 3.0 Prime](https://open.higgsfield.ai/models/alibaba/wan-3.0-prime/reference-to-video/playground) pricing descriptions bill both input reference video duration and generated output duration. The per-second list rates still match the configured values; the earlier output-only estimate omitted the source-video charge. This check does not establish when Higgsfield introduced or clarified that rule.

`quoteVideo` now includes the measured source duration plus the requested whole-second output duration for both Wan models. Text-only and photo-only creation still bills output duration only. For an 8.2-second source, Reelform requests 9 seconds of output and estimates 17.2 billable seconds.

| 10-second input + 10-second output at 720p | API list cost | Corrected Reelform credits | Previous credits |
| --- | ---: | ---: | ---: |
| Wan 3.0 | $2.00 | 720 | 360 |
| Wan 3.0 Prime | $2.80 | 1,010 | 510 |

The existing 360 credits per provider dollar restores the modeled subscription contribution margins to 45.4%–54.8% under full credit use and the stated reserves, before overhead and excluded costs. Subscription prices, allowances, top-up prices, and other models' formulas are unchanged. The existing server quote revalidation rejects old lower quotes before reserving credits or submitting a generation, requiring the customer to review a fresh quote.

Regression checks: `node --import tsx --test tests/wan-models.test.ts tests/video-models.test.ts tests/generation-pricing.test.ts tests/topup-pricing.test.ts`. The Wan cases cover both models, all three resolutions, fractional input duration, duration limits, unchanged creation pricing, and stale quotes. The offline audit remains `node --import tsx scripts/audit-pricing.ts 770`; actual provider debits and account discounts have not been reconciled.
