// Authentication may only redirect to these known application routes.
export function authDestination(value: unknown, fallback = "/account") {
  if (typeof value === "string" && /^\/(studio|cinemalab)\?(generation|request)=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return value;
  if (typeof value === "string" && /^\/instagram(?:\?generation=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/i.test(value)) return value;
  return value === "/studio" || value === "/cinemalab" || value === "/aura" || value === "/community/share" ? value : fallback;
}
