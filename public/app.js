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

// The current on-screen team arrangement, as 4 slots: [team1, team1, team2,
// team2]. Starts as the suggestion, but dragging swaps entries around, and
// whatever is here when a "won" button is pressed is what actually gets
// logged — so a suggestion is just a starting point, not the final word.
let currentAssignment = null;

function renderSuggestion(split) {
  currentAssignment = [...split.team1, ...split.team2];
  renderTeamsArena();
}

function renderTeamsArena() {
  const container = document.getElementById("team-suggestions");
  const [a, b, c, d] = currentAssignment;
  container.innerHTML = `
    <p class="drag-hint">Drag a name to swap players between teams.</p>
    <div class="teams-arena">
      <div class="team-column">
        <div class="team-slot" data-slot="0">${a.name}</div>
        <div class="team-slot" data-slot="1">${b.name}</div>
        <button class="record-win-btn" data-winner="1">This team won</button>
      </div>
      <div class="vs-divider">vs</div>
      <div class="team-column">
        <div class="team-slot" data-slot="2">${c.name}</div>
        <div class="team-slot" data-slot="3">${d.name}</div>
        <button class="record-win-btn" data-winner="2">This team won</button>
      </div>
    </div>
  `;

  container.querySelectorAll(".team-slot").forEach(attachDragHandlers);
  container.querySelectorAll(".record-win-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const winner = Number(btn.dataset.winner);
      const split = {
        team1: [currentAssignment[0], currentAssignment[1]],
        team2: [currentAssignment[2], currentAssignment[3]],
      };
      recordMatch(split, winner);
    });
  });
}

/**
 * Lets a name chip be dragged onto another chip to swap the two players'
 * slots. Built on Pointer Events (not HTML5 drag-and-drop) specifically so
 * it works the same way with a mouse or a finger on a phone.
 */
let dragState = null;

function attachDragHandlers(slotEl) {
  slotEl.addEventListener("pointerdown", (e) => {
    slotEl.setPointerCapture(e.pointerId);
    slotEl.classList.add("dragging");
    dragState = { fromSlot: Number(slotEl.dataset.slot), el: slotEl, startX: e.clientX, startY: e.clientY };
  });

  slotEl.addEventListener("pointermove", (e) => {
    if (!dragState || dragState.el !== slotEl) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    slotEl.style.transform = `translate(${dx}px, ${dy}px)`;
    highlightDropTarget(e, slotEl);
  });

  slotEl.addEventListener("pointerup", (e) => endDrag(e, slotEl));
  slotEl.addEventListener("pointercancel", (e) => endDrag(e, slotEl, true));
}

/** Finds whatever slot is under the pointer, ignoring the chip being dragged itself. */
function slotUnderPointer(e, draggedEl) {
  draggedEl.style.pointerEvents = "none";
  const target = document.elementFromPoint(e.clientX, e.clientY)?.closest(".team-slot");
  draggedEl.style.pointerEvents = "";
  return target && target !== draggedEl ? target : null;
}

function highlightDropTarget(e, draggedEl) {
  document.querySelectorAll(".team-slot.drop-target").forEach((el) => el.classList.remove("drop-target"));
  slotUnderPointer(e, draggedEl)?.classList.add("drop-target");
}

function endDrag(e, slotEl, cancelled = false) {
  if (!dragState || dragState.el !== slotEl) return;
  slotEl.classList.remove("dragging");
  slotEl.style.transform = "";
  document.querySelectorAll(".team-slot.drop-target").forEach((el) => el.classList.remove("drop-target"));

  const target = cancelled ? null : slotUnderPointer(e, slotEl);
  if (target) {
    const toSlot = Number(target.dataset.slot);
    [currentAssignment[dragState.fromSlot], currentAssignment[toSlot]] = [
      currentAssignment[toSlot],
      currentAssignment[dragState.fromSlot],
    ];
    renderTeamsArena();
  }
  dragState = null;
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
    currentAssignment = null;
    await loadPlayers();
    await loadMatches();
    document.querySelector(".player-slot").focus();
  } catch (err) {
    alert(err.message);
  }
}

loadPlayers();
loadMatches();
