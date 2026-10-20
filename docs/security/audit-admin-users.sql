-- Read-only audit for the users.role self-promotion hole fixed in 0027.
-- Lists every admin account with signup/update times so an unexpected admin
-- (or a buyer whose updated_at jumped after signup) stands out.
SELECT u.id, u.email, u.full_name, u.created_at, u.updated_at,
       a.created_at AS auth_created_at, a.last_sign_in_at
FROM public.users u
LEFT JOIN auth.users a ON a.id = u.id
WHERE u.role = 'admin'
ORDER BY u.created_at;
-- Current grants on public.users (after 0027 expect only column UPDATE for authenticated).
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'users' AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, privilege_type;
