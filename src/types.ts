export interface Player {
  id: string;
  name: string;
  mu: number;
  sigma: number;
  wins: number;
  losses: number;
  createdAt: string;
}

export interface Match {
  id: string;
  timestamp: string;
  team1: [string, string];
  team2: [string, string];
  winner: 1 | 2;
  team1Score?: number;
  team2Score?: number;
}
