import { constants as cryptoConstants } from "node:crypto";
import { createSecureContext } from "node:tls";

import { Collection, MongoClient } from "mongodb";

import type { Match, Player } from "./types.js";

// Persistence via MongoDB Atlas (free M0 tier — no credit card required),
// so data survives regardless of where/whether the server process is
// running. Same dbStore interface as the old flat-file version, so nothing
// above this layer (server.ts, rating.ts) needs to know storage changed.

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error("MONGODB_URI environment variable is required");
}

const DB_NAME = process.env.MONGODB_DB_NAME ?? "foosball";

const client = new MongoClient(MONGODB_URI, {
  // Node 18+'s OpenSSL 3.0 disables legacy TLS renegotiation by default
  // (CVE-2009-3555 mitigation), which Atlas's M0/shared-tier proxy still
  // relies on — without this, the handshake fails with
  // "SSL routines:ssl3_read_bytes:tlsv1 alert internal error" / SSL alert 80.
  // This is MongoDB's own documented workaround:
  // https://www.mongodb.com/community/forums/t/mongoserverselectionerror-c83200000a000152-ssl-routinesunsafe-legacy-renegotiation-disabled/262568
  // Node's TLS internals require an actual tls.SecureContext here (a plain
  // object throws ERR_TLS_INVALID_CONTEXT), so build one via createSecureContext
  // rather than passing a bare { secureOptions } literal.
  secureContext: createSecureContext({
    secureOptions: cryptoConstants.SSL_OP_LEGACY_SERVER_CONNECT,
  }),
});
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
