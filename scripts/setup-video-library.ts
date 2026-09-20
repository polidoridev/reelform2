import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const id = "reelform-creations";
const { data: bucket } = await db.storage.getBucket(id);
if (!bucket) {
  const { error } = await db.storage.createBucket(id, { public: false, fileSizeLimit: 50 * 1024 * 1024, allowedMimeTypes: ["video/mp4"] });
  if (error) throw error;
} else if (bucket.public) throw new Error("The creation bucket must be private.");
console.log("Private video library ready.");
