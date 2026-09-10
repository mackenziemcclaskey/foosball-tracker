# 🏓 Foosball Tracker

Balanced 2v2 team suggestions and skill rankings for office foosball.

Given any 4 players, it suggests the most evenly matched way to split them
into two teams, records match results, and updates everyone's rating using a
Bayesian skill model ([openskill](https://github.com/philihp/openskill.js), a
TrueSkill-style Weng-Lin implementation) — so ratings converge quickly even
for brand new players, and "who should play whom" gets smarter over time.

## Status / roadmap

This is the **interim web-app phase**. Plan:

1. ✅ **Now:** standalone web app (this repo) — run it on a laptop, open it in
   a browser near the table.
2. **Next:** point a spare monitor/tablet's browser at this in kiosk mode as
   an always-on leaderboard in the game room.
3. **Later:** Raspberry Pi + touchscreen in the game room, wired up for
   zero-friction "walk up, tap your name, record the result" use.

A Slack app was considered as the primary interface but shelved for now due
to internal security approval friction — this can be revisited later.

## Quick start

```bash
npm install
npm run dev
```

Then open http://localhost:4242.

Data is stored in `data/db.json` (gitignored) — delete it to reset everything.

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
- Recording a match calls `rate()` on the two teams, which updates all 4
  players' `mu`/`sigma` based on who won and the strength differential.

## Notes

- Deliberately no build step for the frontend (plain HTML/CSS/JS) and a flat
  JSON file for storage — this is meant to be thrown away/replaced once the
  Raspberry Pi kiosk exists, not maintained long-term as-is.
- Not affiliated with or dependent on any Workday internal systems.
