# Free transformation pilot

The database migrations `20261001130123_free_generation_trial.sql` and `20261001130321_trial_identity_columns.sql` enable the pilot for accounts created after its application. Deploy both migrations before the application. The second grants only the identity columns required for eligibility to the trusted server role. If the status RPC is absent, the application treats trials as paused; paid generation still works.

Eligible users need a verified email, a free account, no paid grants or paid generation history, and no billing hold. One successful Seedance 2.5 Edit transformation is included: 4–5 seconds, 480p, source video required, at most one photo, original audio. The server inspects the source, signs the quote, rechecks settings on submission, and reserves the entitlement atomically in Postgres. Trials do not grant spendable credits or trigger auto-reloads.

## Limits and accounting

- At most 100 distinct trial participants. A slot is claimed on first submission, not signup or quote.
- $150 USD modeled provider-cost ceiling. Each attempt permanently reserves $1.30, including failures. The signed estimate must be at most $1.30. This is a conservative reservation against current quoted rates, not a guarantee against future provider price changes or charges outside Reelform. Compare actual provider debits before expanding the pilot.
- At most three attempts per user, only after the previous attempt definitely fails. A completed result consumes the trial. Unknown, submitting, reserved, or queued outcomes block resubmission until resolved.
- A per-user transaction lock and campaign row lock protect parallel tabs and the global cap. Reusing a request ID returns its existing job without another reservation.
- Normalized email hashes (including Gmail dot/plus aliases), a first-party HttpOnly browser cookie hash, and pseudonymous account/attempt records survive account deletion. Cookie checks are best effort, not proof of one human: people can clear cookies or use different emails. Verified email plus the hard global cap bounds exposure. Privacy and terms disclose this behavior.

The UI selects trial settings for eligible users, trims long clips in the editor, shows suggested edits, and displays a paid-plan link after completion. The server is authoritative if availability changes after a quote.

## Operations

Service-role or database-owner access is required. Browser roles cannot read or mutate trial records or call the trial RPCs.

Pause new attempts (existing jobs continue):

```sql
update public.rf_trial_campaign set enabled=false where id;
```

Resume without resetting any claims or accounting:

```sql
update public.rf_trial_campaign set enabled=true where id;
```

Review the cohort:

```sql
select enabled, starts_at, max_users, budget_cents / 100.0 as budget_usd,
       reserved_cents / 100.0 as reserved_usd
from public.rf_trial_campaign;

with cohort as (
  select c.user_id,
    exists(select 1 from public.rf_trial_attempts t where t.user_id=c.user_id and t.status='completed') as completed,
    exists(select 1 from public.rf_credit_grants g where g.user_id=c.user_id and g.kind='subscription') as converted
  from public.rf_trial_claims c
)
select count(*) as participants,
       count(*) filter(where completed) as successful_users,
       count(*) filter(where converted) as paid_users,
       round(100.0 * count(*) filter(where converted) / nullif(count(*),0), 2) as conversion_percent,
       (select reserved_cents / 100.0 from public.rf_trial_campaign) /
          nullif(count(*) filter(where converted),0) as reserved_cost_per_paid_user
from cohort;

select status, count(*) as attempts, sum(reserved_cents)/100.0 as reserved_usd
from public.rf_trial_attempts group by status;
```

Conversions reflect retained subscription grants; deleted paid accounts no longer have grants. Reserved cost is conservative modeled acquisition spend, not actual provider invoicing.

## Validation

Run isolated Postgres tests with an external PGlite installation:

```sh
PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node scripts/test-free-trial.mjs
```

The test covers verification, new-account eligibility, settings, retry exhaustion, unknown outcomes, idempotency, normalized duplicate identities after deletion, paid-credit refunds, exact budget boundaries, participant cap, pause/resume, and RPC/table permissions. No real provider generation is needed.

The migration was applied to the Reelform Supabase project on October 1, 2026. The security advisor reports the three trial tables as RLS enabled with no public policies, which is intentional for service-only tables. Existing warnings about `can_view_profile`, password protection, and MFA are outside this change.

Browser contract test (mocked APIs, no provider requests):

```sh
TEST_BROWSER_CHANNEL=chrome PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/test-free-trial-ui.mjs
```
