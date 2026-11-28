# Turning on the shared leaderboard

The game keeps times on each player's own device until it is given a database.
The database is a free [Supabase](https://supabase.com) project. Setup takes about five minutes.

## 1. Create the project

1. Sign up at supabase.com and choose **New project**. Any name and region work. Save the database password somewhere; the game never needs it.
2. Wait for the project to finish setting up.

## 2. Create the scores table

Open **SQL Editor**, paste all of this and press **Run**:

```sql
create table public.scores (
  id bigint generated always as identity primary key,
  day date not null,
  name text not null check (char_length(name) between 1 and 12),
  score numeric not null check (score between 20 and 3600),
  strokes int not null check (strokes between 1 and 60),
  penalties int not null default 0 check (penalties between 0 and 60),
  device text not null check (char_length(device) between 8 and 64),
  created_at timestamptz not null default now()
);
create index scores_day_score on public.scores (day, score);

alter table public.scores enable row level security;

grant select, insert on public.scores to anon;

create policy "Anyone can read times" on public.scores
  for select using (true);

create policy "Anyone can add a time for today" on public.scores
  for insert with check (day = (now() at time zone 'America/New_York')::date);
```

Players can read times and add times for today's hole (New York date). The game posts a time only when it beats that player's best, and the board shows each player's best. Nobody can change or delete a time from the game.

## 3. Give the game the two values

In Supabase open **Project Settings**, then **API** (or the **Connect** button). Copy:

- the **Project URL**, which looks like `https://abcdefgh.supabase.co`
- the **publishable** key, which starts with `sb_publishable_` (older projects call it the **anon public** key)

Both are meant to be public, so they are safe to put in the game. Never use the `service_role` or secret key.

Paste them into `BOARD` near the top of `daily-putt/game.js`:

```js
const BOARD = { url: "https://abcdefgh.supabase.co", key: "your-anon-public-key" };
```

## Good to know

- There is no login, so a determined person could post a fake time. To remove one, open **Table Editor**, pick `scores` and delete the row.
- Players can try as often as they like. Each device's best time of the day is the one shown.
- If your table was created with the older one-attempt rule, run `alter table public.scores drop constraint if exists scores_day_device_key;` once.
