import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(entries, headers) {
        // The page must see the refreshed session (or cleared invalid session)
        // in this request, and the browser must receive it for future requests.
        entries.forEach(({ name, value }) => request.cookies.set(name, value));
        const previous = response;
        response = NextResponse.next({ request });
        previous.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
        for (const name of ["cache-control", "expires", "pragma"]) {
          const value = previous.headers.get(name);
          if (value) response.headers.set(name, value);
        }
        entries.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([name, value]) =>
          response.headers.set(name, value),
        );
      },
    },
  });

  await client.auth.getUser();
  return response;
}

// These are the pages that read authentication during Server Component render.
// API handlers already refresh and persist sessions in their writable context.
export const config = { matcher: ["/login", "/community/share"] };
