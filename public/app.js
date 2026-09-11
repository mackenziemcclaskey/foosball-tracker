const state = {
  players: [],
};

async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

async function loadPlayers() {
  state.players = await fetchJSON("/api/players");
  renderLeaderboard();
  renderPlayersDatalist();
}

function renderLeaderboard() {
  const tbody = document.querySelector("#leaderboard-table tbody");
  tbody.innerHTML = "";
  state.players.forEach((p, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${i + 1}</td><td>${p.name}</td><td>${p.rating}</td><td>${p.wins}-${p.losses}</td>`;
    tbody.appendChild(tr);
  });
}

function renderPlayersDatalist() {
  const datalist = document.getElementById("players-datalist");
  datalist.innerHTML = "";
  state.players.forEach((p) => {
    const option = document.createElement("option");
    option.value = p.name;
    datalist.appendChild(option);
  });
}

/**
 * Inline "ghost text" autocomplete: once what's typed narrows the roster
 * down to exactly one matching name, fill in the rest as selected text so
 * Tab (or Enter) accepts it, and continuing to type just overwrites it.
 */
function attachInlineAutocomplete(input) {
  input.addEventListener("input", (e) => {
    // Don't complete forward while deleting — otherwise backspacing just
    // re-completes itself and you can never shorten the name.
    if (e.inputType && e.inputType.startsWith("delete")) return;

    const typed = input.value;
    if (!typed) return;

    const matches = state.players.filter((p) => p.name.toLowerCase().startsWith(typed.toLowerCase()));
    if (matches.length !== 1) return;

    const fullName = matches[0].name;
    if (fullName.length <= typed.length) return;

    input.value = typed + fullName.slice(typed.length);
    input.setSelectionRange(typed.length, fullName.length);
  });
}

document.querySelectorAll(".player-slot").forEach(attachInlineAutocomplete);

/** Finds an existing player by case-insensitive name, or creates one. */
async function resolvePlayerId(name) {
  const existing = state.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  const created = await fetchJSON("/api/players", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  state.players.push(created);
  return created.id;
}

async function loadMatches() {
  const matches = await fetchJSON("/api/matches?limit=15");
  const list = document.getElementById("match-history");
  list.innerHTML = "";
  matches.forEach((m) => {
    const li = document.createElement("li");
    const winners = m.winner === 1 ? m.team1Names : m.team2Names;
    const losers = m.winner === 1 ? m.team2Names : m.team1Names;
    const hasScore = m.team1Score != null && m.team2Score != null;
    const score = hasScore
      ? ` (${m.winner === 1 ? m.team1Score : m.team2Score}-${m.winner === 1 ? m.team2Score : m.team1Score})`
      : "";
    li.textContent = `${winners.join(" & ")} beat ${losers.join(" & ")}${score}`;
    list.appendChild(li);
  });
}

document.getElementById("suggest-teams-btn").addEventListener("click", async () => {
  const inputs = [...document.querySelectorAll(".player-slot")];
  const names = inputs.map((i) => i.value.trim());

  if (names.some((n) => !n)) {
    alert("Enter all 4 player names.");
    return;
  }
  if (new Set(names.map((n) => n.toLowerCase())).size !== 4) {
    alert("All 4 players must be different.");
    return;
  }

  try {
    const playerIds = [];
    for (const name of names) {
      playerIds.push(await resolvePlayerId(name));
    }
    renderLeaderboard();
    renderPlayersDatalist();

    // Only the top (most balanced) split is shown intentionally — surfacing
    // the other splits' odds tends to get in people's heads before they play.
    const [bestSplit] = await fetchJSON("/api/teams/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerIds }),
    });
    renderSuggestion(bestSplit);
  } catch (err) {
    alert(err.message);
  }
});

function renderSuggestion(split) {
  const container = document.getElementById("team-suggestions");
  const team1Names = split.team1.map((p) => p.name).join(" & ");
  const team2Names = split.team2.map((p) => p.name).join(" & ");
  container.innerHTML = `
    <div class="split-card">
      <div class="split-row">
        <button data-winner="1">${team1Names} won</button>
        <span class="vs">vs</span>
        <button data-winner="2">${team2Names} won</button>
      </div>
    </div>
  `;
  container.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => recordMatch(split, Number(btn.dataset.winner)));
  });
}

async function recordMatch(split, winner) {
  try {
    await fetchJSON("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team1: split.team1.map((p) => p.id),
        team2: split.team2.map((p) => p.id),
        winner,
      }),
    });
    document.querySelectorAll(".player-slot").forEach((input) => (input.value = ""));
    document.getElementById("team-suggestions").innerHTML = "";
    await loadPlayers();
    await loadMatches();
    document.querySelector(".player-slot").focus();
  } catch (err) {
    alert(err.message);
  }
}

loadPlayers();
loadMatches();
