import { ordinal, predictWin, rate, rating } from "openskill";

import type { Player } from "./types.js";

type OpenskillRating = { mu: number; sigma: number };

function toOpenskillRating(p: Player): OpenskillRating {
  return { mu: p.mu, sigma: p.sigma };
}

export function newPlayerRating(): OpenskillRating {
  const r = rating();
  return { mu: r.mu, sigma: r.sigma };
}

/** Single sortable leaderboard number (conservative skill estimate: mu - 3*sigma). */
export function leaderboardScore(p: Player): number {
  return ordinal(toOpenskillRating(p));
}

export interface TeamSplit {
  team1: Player[];
  team2: Player[];
  team1WinProbability: number;
  team2WinProbability: number;
  /** Distance from a perfect 50/50 matchup; lower = more balanced. */
  balance: number;
}

/**
 * Given exactly 4 players, enumerate the 3 possible 2v2 splits and rank them
 * by how close to a 50/50 win probability each one is (most balanced first).
 */
export function suggestTeams(players: [Player, Player, Player, Player]): TeamSplit[] {
  const [a, b, c, d] = players;
  const candidateSplits: [Player, Player, Player, Player][] = [
    [a, b, c, d], // ab vs cd
    [a, c, b, d], // ac vs bd
    [a, d, b, c], // ad vs bc
  ];

  return candidateSplits
    .map(([t1a, t1b, t2a, t2b]) => {
      const team1 = [t1a, t1b];
      const team2 = [t2a, t2b];
      const [p1, p2] = predictWin([team1.map(toOpenskillRating), team2.map(toOpenskillRating)]);
      return {
        team1,
        team2,
        team1WinProbability: p1,
        team2WinProbability: p2,
        balance: Math.abs(p1 - 0.5),
      };
    })
    .sort((x, y) => x.balance - y.balance);
}

export interface MatchOutcome {
  team1: [OpenskillRating, OpenskillRating];
  team2: [OpenskillRating, OpenskillRating];
}

/** Runs one match through the rating model and returns updated mu/sigma for all 4 players. */
export function applyMatchResult(
  team1: [Player, Player],
  team2: [Player, Player],
  winner: 1 | 2,
): MatchOutcome {
  const rank = winner === 1 ? [0, 1] : [1, 0];
  const [newTeam1, newTeam2] = rate(
    [team1.map(toOpenskillRating), team2.map(toOpenskillRating)],
    { rank },
  );
  return {
    team1: [newTeam1[0], newTeam1[1]],
    team2: [newTeam2[0], newTeam2[1]],
  };
}
