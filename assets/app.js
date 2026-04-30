const dataFiles = [
  "./data/team.json",
  "./data/players.json",
  "./data/matches.json",
];

const state = {
  team: null,
  players: [],
  matches: [],
};

const elements = {
  teamName: document.querySelector("#team-name"),
  teamSubtitle: document.querySelector("#team-subtitle"),
  heroMeta: document.querySelector("#hero-meta"),
  overviewGrid: document.querySelector("#overview-grid"),
  rosterGrid: document.querySelector("#roster-grid"),
  playerStatsBody: document.querySelector("#player-stats-body"),
  matchesList: document.querySelector("#matches-list"),
  standingsBody: document.querySelector("#standings-body"),
  competition: document.querySelector("#team-competition"),
  sourceLink: document.querySelector("#source-link"),
  lastUpdated: document.querySelector("#last-updated"),
  drawer: document.querySelector("#detail-drawer"),
  drawerContent: document.querySelector("#drawer-content"),
  drawerClose: document.querySelector("#drawer-close"),
};

const playerStatsColumns = [
  "Jugador",
  "Partidos jugados",
  "Goles totales",
  "Goles",
  "Goles en propia puerta",
  "Tarjetas amarillas",
  "Tarjetas rojas",
];

const standingsColumns = [
  "#",
  "Equipo",
  "Puntos",
  "Partidos jugados",
  "Victorias",
  "Empates",
  "Derrotas",
  "Goles a favor",
  "Goles en contra",
  "Diferencia",
];

async function loadData() {
  const responses = await Promise.all(
    dataFiles.map((path) => fetch(path).then((response) => response.json())),
  );
  state.team = responses[0];
  state.players = responses[1].players || [];
  state.matches = responses[2].matches || [];
}

function playerMetric(player, field) {
  const stats = player.stats || {};
  switch (field) {
    case "played":
      return stats.played ?? stats.matches ?? 0;
    case "totalGoals":
      return stats.totalGoals ?? stats.goals ?? 0;
    case "goals":
      return stats.goals ?? 0;
    case "ownGoals":
      return stats.ownGoals ?? 0;
    case "yellowCards":
      return stats.yellowCards ?? 0;
    case "redCards":
      return stats.redCards ?? 0;
    default:
      return 0;
  }
}

function renderHero() {
  document.title = state.team.name;
  elements.teamName.textContent = state.team.name;
  elements.teamSubtitle.textContent =
    state.team.subtitle || state.team.clubName || "";
  elements.competition.textContent = [state.team.competition, state.team.group]
    .filter(Boolean)
    .join(" · ");
  elements.sourceLink.href = state.team.sourceUrl;
  elements.lastUpdated.textContent = formatDateTime(state.team.lastUpdated);
  elements.heroMeta.innerHTML = "";

  (state.team.heroStats || []).forEach((entry) => {
    const chip = document.createElement("div");
    chip.className = "stat-chip";
    chip.innerHTML = `<span>${entry.label}</span><strong>${entry.value}</strong>`;
    elements.heroMeta.append(chip);
  });
}

function renderOverview() {
  elements.overviewGrid.innerHTML = "";
  (state.team.overview || []).forEach((entry) => {
    const card = document.createElement("article");
    card.className = "metric-card";
    card.innerHTML = `<p class="muted">${entry.label}</p><strong>${entry.value}</strong>`;
    elements.overviewGrid.append(card);
  });
}

function renderRoster() {
  elements.rosterGrid.innerHTML = "";
  const players = [...state.players].sort((left, right) =>
    left.name.localeCompare(right.name, "es"),
  );

  players.forEach((player) => {
    const card = document.createElement("article");
    card.className = "player-card";
    card.innerHTML = `
      <div class="player-card__summary">
        <p class="eyebrow">Jugador</p>
        <h3>${player.name}</h3>
      </div>
      <div class="drawer-metrics player-card__metrics">
        <div class="metric-card"><p class="muted">Partidos jugados</p><strong>${playerMetric(player, "played")}</strong></div>
        <div class="metric-card"><p class="muted">Goles totales</p><strong>${playerMetric(player, "totalGoals")}</strong></div>
      </div>
      <div class="card-actions">
        ${player.sourceUrl ? `<a class="card-link" href="${player.sourceUrl}" target="_blank" rel="noreferrer">Ficha oficial</a>` : ""}
        <button type="button" data-player-id="${player.id}">Ver ficha</button>
      </div>
    `;

    card
      .querySelector("button")
      .addEventListener("click", () => openPlayerDrawer(player.id));
    elements.rosterGrid.append(card);
  });
}

function renderPlayerStats() {
  elements.playerStatsBody.innerHTML = "";
  const players = [...state.players].sort((left, right) =>
    left.name.localeCompare(right.name, "es"),
  );

  players.forEach((player) => {
    const row = document.createElement("tr");
    const values = [
      `<a href="#jugador/${player.id}">${player.name}</a>`,
      playerMetric(player, "played"),
      playerMetric(player, "totalGoals"),
      playerMetric(player, "goals"),
      playerMetric(player, "ownGoals"),
      playerMetric(player, "yellowCards"),
      playerMetric(player, "redCards"),
    ];

    row.innerHTML = values
      .map(
        (value, index) =>
          `<td data-label="${playerStatsColumns[index]}">${value}</td>`,
      )
      .join("");
    elements.playerStatsBody.append(row);
  });
}

function renderMatches() {
  elements.matchesList.innerHTML = "";

  state.matches.forEach((match) => {
    const card = document.createElement("article");
    card.className = `match-card ${match.status === "played" ? "match-card--played" : "match-card--upcoming"}`;
    const statusLabel = match.status === "upcoming" ? "Próximo" : "Finalizado";
    const displayScore = match.score
      ? `${match.score.home} - ${match.score.away}`
      : match.dateLabel || "Pendiente";
    const subline =
      [match.dateLabel, match.venue].filter(Boolean).join(" · ") ||
      [match.competition, match.group].filter(Boolean).join(" · ");
    card.innerHTML = `
      <p class="eyebrow">${match.phase || "Partido"}</p>
      <h3>${match.homeTeam} vs ${match.awayTeam}</h3>
      <div class="match-card__meta">
        <span class="status-badge">${statusLabel}</span>
        ${match.isHome ? '<span class="status-badge">Local</span>' : '<span class="status-badge">Visitante</span>'}
      </div>
      <p class="muted">${subline}</p>
      <div class="match-card__score">${displayScore}</div>
      <p>${match.summary || "Sin resumen adicional."}</p>
      <div class="card-actions">
        ${match.sourceUrl ? `<a class="card-link" href="${match.sourceUrl}" target="_blank" rel="noreferrer">Resultado oficial</a>` : ""}
        <button type="button" data-match-id="${match.id}">Abrir detalle</button>
      </div>
    `;

    card
      .querySelector("button")
      .addEventListener("click", () => openMatchDrawer(match.id));
    elements.matchesList.append(card);
  });
}

function renderStandings() {
  elements.standingsBody.innerHTML = "";
  (state.team.standings || []).forEach((entry) => {
    const row = document.createElement("tr");
    if (entry.team === state.team.name) {
      row.style.fontWeight = "700";
    }
    const values = [
      entry.position,
      entry.team,
      entry.points,
      entry.played,
      entry.won,
      entry.drawn,
      entry.lost,
      entry.goalsFor ?? "-",
      entry.goalsAgainst ?? "-",
      entry.goalDifference,
    ];

    row.innerHTML = values
      .map(
        (value, index) =>
          `<td data-label="${standingsColumns[index]}">${value}</td>`,
      )
      .join("");
    elements.standingsBody.append(row);
  });
}

function openPlayerDrawer(playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) {
    return;
  }

  showDrawer(`
    <article class="drawer-card">
      <p class="eyebrow">Jugador</p>
      <h3>${player.name}</h3>
      <p class="drawer-subtitle">Registro oficial del equipo ${state.team.name}</p>
      <div class="drawer-metrics">
        ${drawerMetric("Partidos jugados", playerMetric(player, "played"))}
        ${drawerMetric("Goles totales", playerMetric(player, "totalGoals"))}
        ${drawerMetric("Goles", playerMetric(player, "goals"))}
        ${drawerMetric("Goles en propia puerta", playerMetric(player, "ownGoals"))}
        ${drawerMetric("Tarjetas amarillas", playerMetric(player, "yellowCards"))}
        ${drawerMetric("Tarjetas rojas", playerMetric(player, "redCards"))}
      </div>
      <div>
        <h4>Lectura rápida</h4>
        <ul class="drawer-list">
          <li>Equipo actual: ${state.team.name}</li>
          <li>Competición: ${state.team.competition || "No disponible"}</li>
          <li>Estado de vinculación: ${player.linked ? "Sí" : "No indicado"}</li>
        </ul>
      </div>
      ${player.sourceUrl ? `<a class="drawer-link" href="${player.sourceUrl}" target="_blank" rel="noreferrer">Abrir ficha oficial</a>` : ""}
    </article>
  `);
  window.location.hash = `jugador/${player.id}`;
}

function openMatchDrawer(matchId) {
  const match = state.matches.find((entry) => entry.id === matchId);
  if (!match) {
    return;
  }

  const details = [
    ["Fase", match.phase],
    [
      "Competición",
      [match.competition, match.group].filter(Boolean).join(" · "),
    ],
    ["Condición", match.isHome ? "Local" : "Visitante"],
    ["Fecha", match.dateLabel || "Pendiente"],
    ["Sede", match.venue || "Sin sede publicada"],
    [
      "Estado",
      match.status === "upcoming" ? "Pendiente de disputar" : "Finalizado",
    ],
  ].filter(([, value]) => value);

  showDrawer(`
    <article class="drawer-card">
      <p class="eyebrow">Partido</p>
      <h3>${match.homeTeam} vs ${match.awayTeam}</h3>
      <p class="drawer-subtitle">${[match.phase, match.dateLabel].filter(Boolean).join(" · ")}</p>
      <div class="score-band">${match.score ? `${match.score.home} - ${match.score.away}` : "Pendiente"}</div>
      <div>
        <h4>Resumen</h4>
        <p>${match.summary || "Sin resumen adicional."}</p>
      </div>
      <div>
        <h4>Detalles</h4>
        <ul class="drawer-list">
          ${details.map(([label, value]) => `<li>${label}: ${value}</li>`).join("")}
        </ul>
      </div>
      ${match.sourceUrl ? `<a class="drawer-link" href="${match.sourceUrl}" target="_blank" rel="noreferrer">Abrir resultado oficial</a>` : ""}
    </article>
  `);
  window.location.hash = `partido/${match.id}`;
}

function drawerMetric(label, value) {
  return `<div class="metric-card"><p>${label}</p><strong>${value}</strong></div>`;
}

function showDrawer(content) {
  elements.drawerContent.innerHTML = content;
  elements.drawer.dataset.open = "true";
  elements.drawer.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  elements.drawer.dataset.open = "false";
  elements.drawer.setAttribute("aria-hidden", "true");
}

function handleHashRoute() {
  const hash = window.location.hash.replace(/^#/, "");
  if (
    !hash ||
    ["resumen", "plantilla", "jugadores", "partidos", "clasificacion"].includes(
      hash,
    )
  ) {
    closeDrawer();
    return;
  }

  const [route, id] = hash.split("/");
  if (route === "jugador") {
    openPlayerDrawer(id);
    return;
  }
  if (route === "partido") {
    openMatchDrawer(id);
    return;
  }

  closeDrawer();
}

function formatDateTime(value) {
  if (!value) {
    return "Sin fecha";
  }

  return new Date(value).toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function init() {
  try {
    await loadData();
    renderHero();
    renderOverview();
    renderRoster();
    renderPlayerStats();
    renderMatches();
    renderStandings();
    handleHashRoute();
  } catch (error) {
    elements.teamName.textContent = "No fue posible cargar los datos";
    elements.teamSubtitle.textContent = error.message;
  }
}

elements.drawerClose.addEventListener("click", () => {
  closeDrawer();
  if (
    window.location.hash.startsWith("#jugador/") ||
    window.location.hash.startsWith("#partido/")
  ) {
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search + "#resumen",
    );
  }
});

window.addEventListener("hashchange", handleHashRoute);

init();
