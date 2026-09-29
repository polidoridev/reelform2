import { admin, checked } from "@/lib/supabase/server";
import { ApiError } from "@/lib/http";
import { provider, sign, verify } from "@/lib/higgsfield";
import { MAX_VIDEO_BYTES } from "@/lib/video-limits";

export const LIBRARY_BUCKET = "reelform-uploads";
// Each person keeps their most recently used uploads; older ones are removed when new ones are saved.
export const LIBRARY_LIMITS = { video: 60, image: 120 } as const;
// Higgsfield keeps files for at least seven days; reuse its copy only well inside that.
const PROVIDER_REUSE_MS = 5 * 86400_000;
const COLUMNS = "id,kind,name,content_type,bytes,duration,created_at,last_used_at";
const EXTENSIONS: Record<string, string> = { "video/mp4": "mp4", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export type LibraryKind = keyof typeof LIBRARY_LIMITS;
export type LibraryItem = {
  id: string;
  kind: LibraryKind;
  name: string;
  content_type: string;
  bytes: number;
  duration: number | null;
  created_at: string;
  last_used_at: string;
  url: string;
};
type UploadToken = { url: string; bytes: number; media: LibraryKind; type?: string };

const storageUrl = (path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${LIBRARY_BUCKET}/${path}`;
const serviceHeaders = () => ({
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
});

/** Signs a Higgsfield file URL the same way a fresh upload is signed. */
function uploadToken(user: string, url: string, bytes: number, media: LibraryKind, type: string) {
  return sign({ user, kind: "upload", url, bytes, media, type, exp: Date.now() + 3600000 });
}

/**
 * Copies a file the person just uploaded to Higgsfield into their private library.
 * Choosing the same file again only marks the saved copy as recently used.
 */
export async function saveUpload(user: string, token: string, input: { name: string; hash: string; duration: number | null }) {
  const upload = (await verify(token, user, "upload")) as UploadToken;
  const db = admin();
  const { data: existing } = await checked(
    db.from("rf_library").update({ last_used_at: new Date().toISOString() })
      .eq("user_id", user).eq("hash", input.hash).select("id").maybeSingle(),
  );
  if (existing) return;
  const source = new URL(upload.url);
  if (source.protocol !== "https:") throw new Error("Invalid upload URL");
  const response = await fetch(source, { redirect: "manual", signal: AbortSignal.timeout(120000) });
  if (!response.ok || !response.body) throw new Error("Uploaded file unavailable");
  const size = Number(response.headers.get("content-length"));
  const type = upload.type ?? response.headers.get("content-type")?.split(";")[0] ?? "";
  const extension = EXTENSIONS[type];
  const expectedKind = type.startsWith("video/") ? "video" : "image";
  if (!extension || expectedKind !== upload.media || !size || size !== upload.bytes || size > MAX_VIDEO_BYTES) {
    await response.body.cancel();
    throw new Error("Uploaded file doesn't match its upload");
  }
  const path = `${user}/${input.hash}.${extension}`;
  const stored = await fetch(storageUrl(path), {
    method: "POST",
    headers: { ...serviceHeaders(), "Content-Type": type, "Content-Length": String(size), "x-upsert": "true" },
    body: response.body, duplex: "half", signal: AbortSignal.timeout(240000),
  } as RequestInit);
  await stored.body?.cancel();
  if (!stored.ok) throw new Error(`Library storage unavailable (${stored.status})`);
  await checked(
    db.from("rf_library").upsert({
      user_id: user,
      kind: upload.media,
      name: input.name,
      content_type: type,
      bytes: size,
      duration: input.duration,
      hash: input.hash,
      storage_path: path,
      provider_url: upload.url,
      provider_uploaded_at: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
    }, { onConflict: "user_id,hash" }),
  );
  await prune(user, upload.media);
}

// Removes the least recently used uploads beyond the library limit.
async function prune(user: string, kind: LibraryKind) {
  const db = admin();
  const { data: extra } = await checked(
    db.from("rf_library").select("id,storage_path").eq("user_id", user).eq("kind", kind)
      .order("last_used_at", { ascending: false }).range(LIBRARY_LIMITS[kind], LIBRARY_LIMITS[kind] + 50),
  );
  if (!extra?.length) return;
  await checked(db.storage.from(LIBRARY_BUCKET).remove(extra.map((row) => row.storage_path)));
  await checked(db.from("rf_library").delete().in("id", extra.map((row) => row.id)).eq("user_id", user));
}

/** The person's saved uploads, most recently used first, with one-hour playback links. */
export async function listLibrary(user: string): Promise<LibraryItem[]> {
  const db = admin();
  const lists = await Promise.all((Object.keys(LIBRARY_LIMITS) as LibraryKind[]).map((kind) =>
    checked(
      db.from("rf_library").select(`${COLUMNS},storage_path`).eq("user_id", user).eq("kind", kind)
        .order("last_used_at", { ascending: false }).limit(LIBRARY_LIMITS[kind]),
    )));
  const rows = lists.flatMap(({ data }) => data ?? []);
  if (!rows.length) return [];
  const { data: signed, error } = await db.storage.from(LIBRARY_BUCKET).createSignedUrls(rows.map((row) => row.storage_path), 3600);
  if (error) throw new ApiError("Your saved uploads couldn’t load. Please try again.", 503);
  const urls = new Map(signed.map((item) => [item.path, item.signedUrl]));
  return rows
    .filter((row) => urls.get(row.storage_path))
    .map(({ storage_path, ...row }) => ({ ...row, url: urls.get(storage_path)! }) as LibraryItem);
}

async function providerCopyAvailable(url: string | null, uploadedAt: string | null) {
  if (!url || !uploadedAt || Date.parse(uploadedAt) < Date.now() - PROVIDER_REUSE_MS) return false;
  try {
    const head = await fetch(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(10000) });
    return head.ok;
  } catch {
    return false;
  }
}

/**
 * An upload token for a saved file, so it can be used in a generation without the
 * person uploading it again. Sends the saved copy to Higgsfield only when needed.
 */
export async function libraryItemToken(user: string, id: string) {
  const db = admin();
  const { data: row } = await checked(
    db.from("rf_library").select("id,kind,content_type,bytes,storage_path,provider_url,provider_uploaded_at")
      .eq("id", id).eq("user_id", user).maybeSingle(),
  );
  if (!row) throw new ApiError("This saved upload no longer exists.", 404);
  let url: string = row.provider_url;
  if (!(await providerCopyAvailable(row.provider_url, row.provider_uploaded_at))) {
    const target = await provider<{ upload_url: string; public_url: string; upload_headers: Record<string, string> }>(
      "files/generate-upload-url",
      { method: "POST", body: JSON.stringify({ content_type: row.content_type }) },
    );
    if (typeof target.upload_url !== "string" || typeof target.public_url !== "string" || !target.upload_headers)
      throw new ApiError("The upload service returned an incomplete response.", 502);
    const saved = await fetch(storageUrl(row.storage_path), { headers: serviceHeaders(), signal: AbortSignal.timeout(120000) });
    if (!saved.ok || !saved.body) {
      await saved.body?.cancel();
      throw new ApiError("This saved upload couldn’t be opened. Please try again.", 503);
    }
    const sent = await fetch(target.upload_url, {
      method: "PUT",
      headers: { ...target.upload_headers, "Content-Length": String(row.bytes) },
      body: saved.body, duplex: "half", signal: AbortSignal.timeout(240000),
    } as RequestInit);
    await sent.body?.cancel();
    if (!sent.ok) throw new ApiError("This saved upload couldn’t be prepared. Please try again.", 502);
    url = target.public_url;
    await checked(db.from("rf_library").update({ provider_url: url, provider_uploaded_at: new Date().toISOString() }).eq("id", row.id));
  }
  await checked(db.from("rf_library").update({ last_used_at: new Date().toISOString() }).eq("id", row.id));
  return uploadToken(user, url, row.bytes, row.kind, row.content_type);
}

export async function deleteLibraryItem(user: string, id: string) {
  const db = admin();
  const { data: row } = await checked(
    db.from("rf_library").delete().eq("id", id).eq("user_id", user).select("storage_path").maybeSingle(),
  );
  if (!row) throw new ApiError("This saved upload no longer exists.", 404);
  const { error } = await db.storage.from(LIBRARY_BUCKET).remove([row.storage_path]);
  if (error) console.error("Library file removal pending", { id });
}

/** Removes every saved upload file; rows go with the account. */
export async function removeUserLibrary(user: string) {
  const db = admin();
  while (true) {
    const { data: files, error } = await db.storage.from(LIBRARY_BUCKET).list(user, { limit: 100 });
    if (error) throw new ApiError("Your saved uploads could not be removed. Please try deleting your account again.", 503);
    if (!files?.length) return;
    const { error: removeError } = await db.storage.from(LIBRARY_BUCKET).remove(files.map((file) => `${user}/${file.name}`));
    if (removeError) throw new ApiError("Your saved uploads could not be removed. Please try deleting your account again.", 503);
  }
}
