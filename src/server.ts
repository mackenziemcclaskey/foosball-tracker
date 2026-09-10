import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import cors from "cors";
import express from "express";

import { applyMatchResult, leaderboardScore, newPlayerRating, suggestTeams } from "./rating.js";
import { dbStore } from "./store.js";
import type { Match, Player } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? Number(process.env.PORT) : 4242;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

function toPublicPlayer(p: Player) {
  return {
    id: p.id,
    name: p.name,
    wins: p.wins,
    losses: p.losses,
    rating: Math.round(leaderboardScore(p) * 10) / 10,
  };
}

app.get("/api/players", (_req, res) => {
  const players = dbStore
    .getPlayers()
    .map(toPublicPlayer)
    .sort((a, b) => b.rating - a.rating);
  res.json(players);
});

app.post("/api/players", (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (dbStore.getPlayers().some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    res.status(409).json({ error: "a player with that name already exists" });
    return;
  }

  const { mu, sigma } = newPlayerRating();
  const player: Player = {
    id: randomUUID(),
    name,
    mu,
    sigma,
    wins: 0,
    losses: 0,
    createdAt: new Date().toISOString(),
  };
  dbStore.addPlayer(player);
  res.status(201).json(toPublicPlayer(player));
});

app.post("/api/teams/suggest", (req, res) => {
  const playerIds: unknown = req.body?.playerIds;
  if (!Array.isArray(playerIds) || playerIds.length !== 4 || new Set(playerIds).size !== 4) {
    res.status(400).json({ error: "playerIds must be 4 distinct player ids" });
    return;
  }

  const players = playerIds.map((id) => dbStore.getPlayer(String(id)));
  if (players.some((p) => !p)) {
    res.status(404).json({ error: "one or more players not found" });
    return;
  }

  const splits = suggestTeams(players as [Player, Player, Player, Player]);
  res.json(
    splits.map((s) => ({
      team1: s.team1.map((p) => ({ id: p.id, name: p.name })),
      team2: s.team2.map((p) => ({ id: p.id, name: p.name })),
      team1WinProbability: Math.round(s.team1WinProbability * 100),
      team2WinProbability: Math.round(s.team2WinProbability * 100),
    })),
  );
});

app.post("/api/matches", (req, res) => {
  const { team1, team2, winner, team1Score, team2Score } = req.body ?? {};

  if (
    !Array.isArray(team1) ||
    team1.length !== 2 ||
    !Array.isArray(team2) ||
    team2.length !== 2 ||
    (winner !== 1 && winner !== 2)
  ) {
    res.status(400).json({ error: "team1, team2 (2 ids each), and winner (1 or 2) are required" });
    return;
  }

  const allIds = [...team1, ...team2];
  if (new Set(allIds).size !== 4) {
    res.status(400).json({ error: "all 4 players must be distinct" });
    return;
  }

  const [p1a, p1b, p2a, p2b] = allIds.map((id) => dbStore.getPlayer(String(id)));
  if (!p1a || !p1b || !p2a || !p2b) {
    res.status(404).json({ error: "one or more players not found" });
    return;
  }

  const outcome = applyMatchResult([p1a, p1b], [p2a, p2b], winner);

  const updated: Player[] = [
    { ...p1a, ...outcome.team1[0], wins: p1a.wins + (winner === 1 ? 1 : 0), losses: p1a.losses + (winner === 2 ? 1 : 0) },
    { ...p1b, ...outcome.team1[1], wins: p1b.wins + (winner === 1 ? 1 : 0), losses: p1b.losses + (winner === 2 ? 1 : 0) },
    { ...p2a, ...outcome.team2[0], wins: p2a.wins + (winner === 2 ? 1 : 0), losses: p2a.losses + (winner === 1 ? 1 : 0) },
    { ...p2b, ...outcome.team2[1], wins: p2b.wins + (winner === 2 ? 1 : 0), losses: p2b.losses + (winner === 1 ? 1 : 0) },
  ];

  const match: Match = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    team1: [p1a.id, p1b.id],
    team2: [p2a.id, p2b.id],
    winner,
    team1Score: typeof team1Score === "number" ? team1Score : undefined,
    team2Score: typeof team2Score === "number" ? team2Score : undefined,
  };

  dbStore.recordMatch(match, updated);
  res.status(201).json({ match, players: updated.map(toPublicPlayer) });
});

app.get("/api/matches", (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const namesById = new Map(dbStore.getPlayers().map((p) => [p.id, p.name]));
  const matches = dbStore.getMatches(limit).map((m) => ({
    ...m,
    team1Names: m.team1.map((id) => namesById.get(id) ?? "?"),
    team2Names: m.team2.map((id) => namesById.get(id) ?? "?"),
  }));
  res.json(matches);
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Foosball tracker running at http://localhost:${PORT}`);
});
