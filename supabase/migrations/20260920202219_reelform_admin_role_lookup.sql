-- The reservation RPC runs as the trusted server role. Read only the identity
-- and server-managed role metadata; no browser role receives auth-table access.
grant select (id, raw_app_meta_data) on auth.users to service_role;
