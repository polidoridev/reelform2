// Authentication may only redirect to these known application routes.
export function authDestination(value: unknown, fallback = "/account") {
  return value === "/studio" || value === "/cinemalab" || value === "/community/share" ? value : fallback;
}
