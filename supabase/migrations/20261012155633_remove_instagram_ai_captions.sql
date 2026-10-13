-- Remove the unused AI caption cache. Manual post captions remain in rf_instagram_posts.
drop table if exists public.rf_instagram_captions;
