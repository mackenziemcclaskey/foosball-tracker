import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Match, Player } from "./types.js";

// Deliberately simple: a JSON file on disk, read/written whole on every
// call. Fine for a handful of players and a game room's worth of matches.
// If this ever needs concurrent writers, swap it for sqlite.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

interface Db {
  players: Player[];
  matches: Match[];
}

function load(): Db {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const empty: Db = { players: [], matches: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(empty, null, 2));
    return empty;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")) as Db;
}

function save(db: Db): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

export const dbStore = {
  getPlayers(): Player[] {
    return load().players;
  },

  getPlayer(id: string): Player | undefined {
    return load().players.find((p) => p.id === id);
  },

  addPlayer(player: Player): Player {
    const db = load();
    db.players.push(player);
    save(db);
    return player;
  },

  getMatches(limit = 50): Match[] {
    const db = load();
    return db.matches.slice(-limit).reverse();
  },

  recordMatch(match: Match, updatedPlayers: Player[]): void {
    const db = load();
    db.matches.push(match);
    for (const updated of updatedPlayers) {
      const idx = db.players.findIndex((p) => p.id === updated.id);
      if (idx >= 0) {
        db.players[idx] = updated;
      }
    }
    save(db);
  },
};
