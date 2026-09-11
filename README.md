# 🏓 Foosball Tracker

Balanced 2v2 team suggestions and skill rankings for office foosball.

Given any 4 players, it suggests the most evenly matched way to split them
into two teams, records match results, and updates everyone's rating using a
Bayesian skill model ([openskill](https://github.com/philihp/openskill.js), a
TrueSkill-style Weng-Lin implementation) — so ratings converge quickly even
for brand new players, and "who should play whom" gets smarter over time.

## Status / roadmap

This is the **interim web-app phase**. Plan:

1. ✅ **Now:** standalone web app, hosted on Render + MongoDB Atlas — reachable
   from any browser, anywhere, without depending on anyone's laptop or the
   office network.
2. **Next:** point a spare monitor/tablet's browser at the hosted URL in kiosk
   mode as an always-on leaderboard in the game room.
3. **Later:** Raspberry Pi + touchscreen in the game room. The Pi is just a
   kiosk browser pointed at the hosted app — it doesn't run a server or store
   data itself, so office wifi reliability only affects the display, not
   durability.

A Slack app was considered as the primary interface but shelved for now due
to internal security approval friction — this can be revisited later.

## Quick start (local development)

Requires a `MONGODB_URI` — either a free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
M0 cluster (no credit card required, works fine for local dev too) or a local
MongoDB via Docker: `docker run -d -p 27017:27017 --name foosball-mongo mongo`.

```bash
npm install
export MONGODB_URI="mongodb://localhost:27017"   # or your Atlas connection string
npm run dev
```

Then open http://localhost:4242.

## Deploying (Render + MongoDB Atlas)

1. **MongoDB Atlas** (durable storage, free forever, no card):
   - Sign up at https://www.mongodb.com/cloud/atlas/register
   - Create an **M0 (free)** cluster
   - Create a database user (username/password)
   - Network Access → allow access from anywhere (`0.0.0.0/0`) — Render's free
     tier doesn't have static egress IPs
   - Click **Connect → Drivers**, but use the **Standard Connection String**
     (a direct host list) rather than the default SRV one. On Render, the
     default `mongodb+srv://...` string failed the TLS handshake against
     Atlas's shared-tier proxy (`SSL routines:ssl3_read_bytes:tlsv1 alert
     internal error` / SSL alert 80) even with correct IP allowlisting and
     credentials — switching to the standard string resolved it.
2. **Render** (hosting, free, no card):
   - Sign up at https://render.com and connect your GitHub account
   - New → Blueprint → point at this repo (picks up `render.yaml`
     automatically), or New → Web Service manually with build command
     `npm install` and start command `npm run start`
   - Set the `MONGODB_URI` environment variable to your Atlas connection
     string (kept out of the repo — `render.yaml` marks it `sync: false` so
     Render prompts for it instead of committing it)
   - Deploy — Render auto-redeploys on every push to `main`

Note: Render's free tier spins the service down after ~15 minutes of
inactivity, so the first request after a quiet spell takes a few extra
seconds to wake back up. Everything after that is normal speed.

## API

| Method | Path                | Body                                              | Description                                      |
| ------ | ------------------- | -------------------------------------------------- | ------------------------------------------------- |
| GET    | `/api/players`       | —                                                   | Leaderboard, sorted by rating desc                |
| POST   | `/api/players`       | `{ name }`                                          | Add a new player (starts at the default rating)   |
| POST   | `/api/teams/suggest` | `{ playerIds: [id, id, id, id] }`                   | The 3 possible 2v2 splits, most balanced first     |
| POST   | `/api/matches`       | `{ team1: [id, id], team2: [id, id], winner: 1\|2, team1Score?, team2Score? }` | Record a result, update ratings |
| GET    | `/api/matches`       | `?limit=20`                                         | Recent match history, most recent first           |

## How the rating/balancing works

- Each player has a `mu`/`sigma` (skill estimate + uncertainty) from
  `openskill`. Leaderboard rank uses a conservative estimate
  (`ordinal = mu - 3*sigma`), so new/unproven players don't rank above
  established ones just from a lucky first win.
- For "suggest teams," the 3 possible ways to split 4 people into two 2-person
  teams are all evaluated with `predictWin`, and the API returns them sorted
  by how close each is to a 50/50 win probability. The UI only surfaces the
  single most-balanced split, with no percentages shown — seeing "you have a
  38% chance" before you've even played tends to get in people's heads.
- The suggestion is just a starting point, not final: names can be dragged
  between teams to rearrange them (e.g. if two people specifically want to
  play together), and whatever arrangement is on screen when a "won" button
  is pressed is what actually gets logged and rated — not the original
  suggestion. Dragging is built on Pointer Events rather than HTML5
  drag-and-drop specifically so it works the same with a mouse or a finger
  on a phone.
- Recording a match calls `rate()` on the two teams, which updates all 4
  players' `mu`/`sigma` based on who won and the strength differential.

## Notes

- Deliberately no build step for the frontend (plain HTML/CSS/JS) — this is
  meant to be a lightweight interim UI, not maintained long-term as-is once
  the Raspberry Pi kiosk exists.
- Not affiliated with or dependent on any Workday internal systems.
