# PG Docs Sign - Phase 1 Setup

Phase 1 delivers: email signup + login, admin approval menu, staff dashboard shell.

## Step 1 - Run the SQL schema

1. Open your Supabase dashboard -> **Store Notes** project.
2. Left sidebar -> **SQL Editor** -> New query.
3. Open `sql/schema.sql` in this folder, copy ALL of it, paste into the editor.
4. Click **Run**. Should say "Success. No rows returned."

This creates tables (`pgds_profiles`, `pgds_documents`, `pgds_signatures`, `pgds_activity`),
3 storage buckets (`pgds-pending`, `pgds-signed`, `pgds-rejected`), and Row-Level Security policies.

## Step 2 - Turn off email confirmation (for now)

1. Supabase -> **Authentication** -> **Providers** -> **Email**.
2. Turn OFF "Confirm email" so new signups can log in immediately (the admin still gates them via the approval flow).
3. Save.

(Later we can turn it back on and add real SMTP.)

## Step 3 - Deploy to Vercel via GitHub

1. Go to github.com -> **New repository** -> name it `pg-docs-sign` -> Private.
2. Upload all files from `PG_Docs_Sign/` folder (drag-drop in the web UI).
3. Go to vercel.com -> **New Project** -> Import your `pg-docs-sign` repo.
4. Framework preset: **Other**. Root directory: `/`. Output directory: `public`.
5. **Environment Variables** (add these):
   - `SUPABASE_URL` = `https://icljtvutpjhxlnygxqbg.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljbGp0dnV0cGpoeGxueWd4cWJnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjY4NTE3MSwiZXhwIjoyMTAyMjYxMTcxfQ.rlsjpNsOGerSFqHDvxagJTZxhbPVS1g3Zik1Iu63zXY`
6. Deploy.

Vercel gives you a URL like `pg-docs-sign.vercel.app`.

## Step 4 - Bootstrap yourself as admin

1. Open the deployed app URL.
2. Click **Create an account** -> sign up with YOUR email (e.g. cmnemo17@gmail.com) + password.
3. You will see "Awaiting approval".
4. Go back to Supabase -> **SQL Editor** -> run:
   ```sql
   update pgds_profiles set role='admin', status='approved' where email='cmnemo17@gmail.com';
   ```
5. Go back to the app, sign in. You should land on the admin panel.

## Step 5 - Test the staff approval flow

1. Log out.
2. Sign up a fake staff account (e.g. store01@test.com / password123, store #1).
3. See "Awaiting approval".
4. Log back in as YOU (admin) -> see the new user in Pending Approvals -> click Approve.
5. Log out, sign in as store01@test.com -> should land on staff dashboard.

If all this works, Phase 1 is done and we build Phase 2 (upload + document queue) next.

---

## What's built so far

- `sql/schema.sql` - DB tables, RLS policies, storage buckets, trigger for auto-profile
- `public/index.html` + `js/auth.js` - login + signup with pending gate
- `public/dashboard.html` + `js/dashboard.js` - staff dashboard shell (tabs, empty until upload works)
- `public/admin.html` + `js/admin.js` - admin panel with Pending Approvals + All Users
- `public/css/style.css` - clean unified styling

## What's NEXT (Phase 2)

- File upload for staff (PDF/JPG/PNG, 5MB max) into `pgds-pending` bucket
- Documents queue for admin (see all pending across 31 stores)
- Document viewer opens original file
