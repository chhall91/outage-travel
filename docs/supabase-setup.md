# Turning on the forum (Supabase)

The forum is built and waiting. It needs a free online database so everyone sees the same posts. That's Supabase. About 5 minutes for you, then I do the rest.

## What you do

1. Go to **https://supabase.com** and tap **Start your project**.
2. Choose **Continue with GitHub** and sign in as `chhall91`.
3. Tap **New project**.
   - Name: `outage-travel`
   - Database password: tap **Generate a password** and save it somewhere safe (you won't need it day to day).
   - Region: **East US** (or whatever's closest)
   - Plan: **Free**
   - Tap **Create new project** and wait a minute or two while it sets up.
4. Go to **Project Settings → API** (or **Connect → App frameworks**). Copy these two values:
   - **Project URL**, which looks like `https://abcdefgh.supabase.co`
   - **anon / public key**, a long string starting with `eyJ...` (or `sb_publishable_...`)
   Both are safe to share with me because they're meant to sit inside the app. **Don't** send the `service_role` / secret key.
5. Send me those two values.

## What I do

1. Run `supabase/schema.sql` in the project's SQL Editor. It creates the tables, the security rules (row-level security), and the "hide after 3 reports" rule.
2. Turn on **Authentication → Sign In / Providers → Allow anonymous sign-ins**, so people can post with only a display name. Email sign-in can be added later.
3. Add two secrets to GitHub, under **chhall91/outage-travel → Settings → Secrets and variables → Actions**:
   - `VITE_SUPABASE_URL` = the Project URL
   - `VITE_SUPABASE_ANON_KEY` = the anon key
4. The deploy workflow passes them to the build, and the Forum goes live at https://chhall91.github.io/outage-travel/. Without them, it keeps showing "Forum is coming soon".

## Moderation

- A post gets hidden automatically once 3 different people report it. The person who wrote it still sees it, marked as hidden.
- To review reported posts, open Supabase → **Table Editor**:
  - `forum_reports` lists every report and its reason.
  - In `forum_threads` or `forum_replies`, set `hidden` to `false` to restore a post, or to `true` to pull one.
- To change the report limit, edit `hide_after` in `supabase/schema.sql` and `HIDE_AFTER` in `src/lib/forum.js`.

## Later: the same backend for the crew board and ratings

Right now the crew board and plant ratings stay on each phone and move around through share links and QR codes. They can run on this same Supabase project. That would mean adding `crew_posts` and `plant_ratings` tables with the same row-level-security pattern: anyone can read, and only the author can edit or delete. Then everyone at a plant would see each other's room and ride posts, and the plant averages would include everybody's ratings.

## Testing without Supabase

`npm run build:tunnel && npm run forum:server -- --static dist-tunnel` runs the same forum on a local Node + SQLite server (`server/forum-server.mjs`) on port 8787, using the same rules.
