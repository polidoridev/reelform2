import { z } from "zod";
import { authorize, errorResponse, ApiError } from "@/lib/higgsfield";
import { noStore } from "@/lib/http";
import { deleteLibraryItem, libraryItemToken } from "@/lib/commerce/upload-library";
// Re-sending a saved video to the generation service can take a while.
export const maxDuration = 300;

async function itemId(params: Promise<{ id: string }>) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) throw new ApiError("This saved upload no longer exists.", 404);
  return id;
}

// Returns an upload token so a saved file can be used without uploading it again.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authorize(request);
    return noStore({ token: await libraryItemToken(user, await itemId(params)) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authorize(request);
    await deleteLibraryItem(user, await itemId(params));
    return noStore({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
