export interface AccountRow {
  user_id: string;
  full_name: string;
  email: string;
  plan: string;
  cadence: "month" | "year" | null;
  subscription_status: string;
  paid_until: string | null;
  cancel_at_period_end: boolean;
  billing_hold: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  auto_reload_enabled: boolean;
  auto_reload_pack: string;
  auto_reload_threshold: number;
  auto_reload_cap_cents: number;
  marketing_opt_in: boolean;
  email_suppressed: boolean;
}
export interface JobRow {
  id: string;
  provider_id?: string | null;
  status: string;
  credits: number;
  prompt: string;
  resolution: string;
  result_url: string | null;
  error: string | null;
  created_at: string;
}
export interface CreditBalance {
  total: number;
  subscription: number;
  purchased: number;
  nextReset: string | null;
  nextGrant: string | null;
}
export interface ApiResult {
  url?: string;
  message?: string;
  error?: string;
  redirect?: string;
}
export interface AccountData {
  isAdmin: boolean;
  account: AccountRow;
  balance: CreditBalance;
  jobs: JobRow[];
  ledger: {
    id: number;
    created_at: string;
    description: string;
    kind: string;
    amount: number;
  }[];
  orders: {
    id: string;
    created_at: string;
    credits: number;
    amount_cents: number;
    status: string;
    error: string | null;
    receipt_url: string | null;
  }[];
  invoices: {
    id: string;
    created: number;
    number: string | null;
    amount: number;
    status: string;
    pdf: string | null;
  }[];
  paymentMethod: {
    brand: string;
    last4: string;
    month: number;
    year: number;
  } | null;
  pendingChange: {
    name: string;
    price: number;
    cadence: "month" | "year";
    date: string;
  } | null;
  billingError: boolean;
  billingReady: boolean;
  testMode: boolean;
}
