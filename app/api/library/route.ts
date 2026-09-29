import { after } from "next/server";
import { z } from "zod";
import { authorize, errorResponse, readJson, ApiError } from "@/lib/higgsfield";
import { requireUser } from "@/lib/supabase/server";
import { noStore } from "@/lib/http";
import { listLibrary, LIBRARY_LIMITS, saveUpload } from "@/lib/commerce/upload-library";
// Copying a large video into the library continues after the response.
export const maxDuration = 300;

const input = z.object({
  token: z.string().max(12000),
  name: z.string().trim().min(1).max(200),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  duration: z.number().positive().max(3600).nullable().default(null),
});

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return noStore({ items: await listLibrary(user.id), limits: LIBRARY_LIMITS });
  } catch (error) {
    return errorResponse(error);
  }
}

// Saves a file the person just uploaded. The copy runs in the background so the
// studio never waits on it; a failed copy only means the file isn't saved.
export async function POST(request: Request) {
  try {
    const user = await authorize(request);
    const parsed = input.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError("This upload couldn’t be saved.");
    const { token, ...details } = parsed.data;
    after(() =>
      saveUpload(user, token, details).catch((error) =>
        console.error("Library save failed", { reason: error instanceof Error ? error.message.slice(0, 200) : "UnknownError" }),
      ),
    );
    return noStore({ saving: true }, 202);
  } catch (error) {
    return errorResponse(error);
  }
}
