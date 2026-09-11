import { Collection, MongoClient } from "mongodb";

import type { Match, Player } from "./types.js";

// Persistence via MongoDB Atlas (free M0 tier — no credit card required),
// so data survives regardless of where/whether the server process is
// running. Same dbStore interface as the old flat-file version, so nothing
// above this layer (server.ts, rating.ts) needs to know storage changed.
//
// Use Atlas's "Standard Connection String" (a direct host list), not the
// default SRV one — on Render, the SRV-based string failed the TLS handshake
// with Atlas's shared-tier proxy ("SSL alert number 80"), even with correct
// IP allowlisting and credentials. See README's Deploying section.

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error("MONGODB_URI environment variable is required");
}

const DB_NAME = process.env.MONGODB_DB_NAME ?? "foosball";

const client = new MongoClient(MONGODB_URI);
let ready: Promise<{ players: Collection<Player>; matches: Collection<Match> }> | undefined;

function getCollections() {
  if (!ready) {
    ready = client.connect().then(async () => {
      const db = client.db(DB_NAME);
      const players = db.collection<Player>("players");
      const matches = db.collection<Match>("matches");
      await players.createIndex({ id: 1 }, { unique: true });
      await matches.createIndex({ timestamp: -1 });
      return { players, matches };
    });
  }
  return ready;
}

process.on("SIGTERM", async () => {
  await client.close();
  process.exit(0);
});

export const dbStore = {
  async getPlayers(): Promise<Player[]> {
    const { players } = await getCollections();
    return players.find({}, { projection: { _id: 0 } }).toArray();
  },

  async getPlayer(id: string): Promise<Player | undefined> {
    const { players } = await getCollections();
    const found = await players.findOne({ id }, { projection: { _id: 0 } });
    return found ?? undefined;
  },

  async addPlayer(player: Player): Promise<Player> {
    const { players } = await getCollections();
    await players.insertOne({ ...player });
    return player;
  },

  async getMatches(limit = 50): Promise<Match[]> {
    const { matches } = await getCollections();
    return matches
      .find({}, { projection: { _id: 0 } })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  },

  async recordMatch(match: Match, updatedPlayers: Player[]): Promise<void> {
    const { players, matches } = await getCollections();
    await matches.insertOne({ ...match });
    await Promise.all(updatedPlayers.map((p) => players.updateOne({ id: p.id }, { $set: { ...p } })));
  },
};
