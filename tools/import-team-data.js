const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const TEAM_URL = "https://fafutsala.com/es/team/15680295";
const RANKING_URL =
  "https://fafutsala.com/es/tournament/1321813/ranking/3672928";
const OUTPUT_DIR = path.resolve(__dirname, "..", "data");

function normalize(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function stripVer(value) {
  return normalize(value).replace(/^Ver\s+/, "");
}

function extractMatchId(url) {
  const match = String(url).match(/\/match\/(\d+)/);
  return match ? match[1] : String(Date.now());
}

function parseScore(scoreLabel) {
  const match = String(scoreLabel).match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!match) {
    return null;
  }

  return {
    home: Number(match[1]),
    away: Number(match[2]),
  };
}

function parseUpcomingMeta(rawValue) {
  const normalized = normalize(rawValue);
  const match = normalized.match(/^(.*?\d{2}:\d{2})(.*)$/);
  if (!match) {
    return {
      dateLabel: normalized,
      venue: "",
    };
  }

  return {
    dateLabel: normalize(match[1]),
    venue: normalize(match[2]),
  };
}

function summarizePlayedMatch(match, teamName) {
  if (!match.score) {
    return "Resultado no disponible en el portal oficial.";
  }

  const teamGoals = match.isHome ? match.score.home : match.score.away;
  const rivalGoals = match.isHome ? match.score.away : match.score.home;
  const rivalName = match.isHome ? match.awayTeam : match.homeTeam;
  if (teamGoals > rivalGoals) {
    return `Victoria de ${teamName} ante ${rivalName} por ${teamGoals}-${rivalGoals}.`;
  }
  if (teamGoals < rivalGoals) {
    return `Derrota de ${teamName} frente a ${rivalName} por ${teamGoals}-${rivalGoals}.`;
  }
  return `Empate de ${teamName} frente a ${rivalName} por ${teamGoals}-${rivalGoals}.`;
}

function summarizeUpcomingMatch(match) {
  const rivalName = match.isHome ? match.awayTeam : match.homeTeam;
  const venueText = match.venue ? ` en ${match.venue}` : "";
  if (match.dateLabel) {
    return `Próximo partido contra ${rivalName}${venueText} el ${match.dateLabel}.`;
  }
  return `Partido pendiente de programación contra ${rivalName}.`;
}

async function gotoAndSettle(page, url) {
  let lastError;
  const retryableErrors = [
    "ERR_HTTP2_PROTOCOL_ERROR",
    "ERR_NETWORK_CHANGED",
    "ERR_CONNECTION_RESET",
    "ERR_EMPTY_RESPONSE",
  ];

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      if (attempt > 1) {
        await page.waitForTimeout(4000 * attempt);
      }

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
      await page
        .waitForLoadState("networkidle", { timeout: 45000 })
        .catch(() => {});
      await page.waitForTimeout(5000);
      return;
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error);
      const shouldRetry = retryableErrors.some((entry) =>
        message.includes(entry),
      );

      if (!shouldRetry || attempt === 3) {
        throw error;
      }

      await page.waitForTimeout(6000 * attempt);
    }
  }

  throw lastError;
}

async function extractTeamMeta(page) {
  return page.evaluate(() => {
    const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();
    const titleParts = document.title.split("|").map((item) => normalize(item));
    const triggers = Array.from(document.querySelectorAll("main a.ml-trigger"));
    const firstTrigger = triggers[0];
    const tournamentLinks = Array.from(
      document.querySelectorAll('a[href*="/es/tournament/"]'),
    ).map((anchor) => ({
      text: normalize(anchor.textContent),
      href: anchor.href,
    }));

    return {
      teamName: normalize(document.querySelector("main h1")?.textContent),
      clubName: normalize(
        document.querySelector('main a[href*="/es/club/"]')?.textContent,
      ),
      clubUrl: document.querySelector('main a[href*="/es/club/"]')?.href || "",
      competition: titleParts[1] || "",
      organization: titleParts[2] || "",
      csrfToken:
        firstTrigger?.querySelector('input[name="csrf_token"]')?.value || "",
      tabController: firstTrigger?.getAttribute("ml-controller") || "",
      tournamentLinks,
    };
  });
}

async function requestTeamTab(page, controller, csrfToken, tab) {
  return page.evaluate(
    async ({ controller, csrfToken, tab }) => {
      const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();
      const response = await fetch(controller, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: new URLSearchParams({ csrf_token: csrfToken, tab }).toString(),
        credentials: "include",
      });
      const payload = await response.json();
      const doc = new DOMParser().parseFromString(payload.content, "text/html");
      return {
        headers: Array.from(doc.querySelectorAll("table thead th")).map(
          (node) => normalize(node.textContent),
        ),
        rows: Array.from(doc.querySelectorAll("table tbody tr")).map((row) => ({
          cells: Array.from(row.querySelectorAll("td")).map((cell) =>
            normalize(cell.textContent),
          ),
          links: Array.from(row.querySelectorAll("a")).map(
            (anchor) => anchor.href,
          ),
        })),
      };
    },
    { controller, csrfToken, tab },
  );
}

async function extractVisiblePlayers(page) {
  return page.evaluate(() => {
    const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();
    const stripVer = (value) => normalize(value).replace(/^Ver\s+/, "");
    return Array.from(document.querySelectorAll("table tbody tr")).map(
      (row) => {
        const cells = Array.from(row.querySelectorAll("td")).map((cell) =>
          normalize(cell.textContent),
        );
        const playerLink = row.querySelector('a[href*="/es/players/"]');
        const linkState =
          row.querySelector(".fa-check, .glyphicon-ok, .icon-check") ||
          row.textContent.includes("");
        return {
          id: playerLink?.href.match(/\/players\/(\d+)/)?.[1] || "",
          name: stripVer(cells[0]),
          sourceUrl: playerLink?.href || "",
          linked: Boolean(linkState),
          stats: {
            played: Number(cells[1] || 0),
            totalGoals: Number(cells[2] || 0),
            goals: Number(cells[3] || 0),
            ownGoals: Number(cells[4] || 0),
            yellowCards: Number(cells[5] || 0),
            redCards: Number(cells[6] || 0),
          },
        };
      },
    );
  });
}

async function extractStandings(page) {
  return page.evaluate(() => {
    const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();
    const calendarUrl =
      Array.from(document.querySelectorAll('a[href*="/calendar/"]')).find(
        (anchor) => normalize(anchor.textContent) === "Calendario",
      )?.href || "";
    const groupName =
      Array.from(document.querySelectorAll('main a[href*="/ranking/"]'))
        .map((anchor) => normalize(anchor.textContent))
        .find(
          (text) => text && text !== "Clasificación" && text !== "Calendario",
        ) || "";
    const standings = Array.from(
      document.querySelectorAll("table tbody tr"),
    ).map((row) => {
      const cells = Array.from(row.querySelectorAll("td")).map((cell) =>
        normalize(cell.textContent),
      );
      const teamLink = row.querySelector('a[href*="/es/team/"]');
      return {
        position: Number(cells[1] || 0),
        team: cells[2] || "",
        points: Number(cells[3] || 0),
        played: Number(cells[4] || 0),
        won: Number(cells[5] || 0),
        drawn: Number(cells[6] || 0),
        lost: Number(cells[7] || 0),
        goalsFor: Number(cells[8] || 0),
        goalsAgainst: Number(cells[9] || 0),
        goalDifference: Number(cells[10] || 0),
        teamUrl: teamLink?.href || "",
      };
    });

    return {
      standings,
      calendarUrl,
      groupName,
    };
  });
}

function buildMatchRecord(row, status, teamName, teamContext) {
  const homeTeam = stripVer(row.cells[0]);
  const awayTeam = normalize(row.cells[2]);
  const isHome = homeTeam === teamName;
  const score = status === "played" ? parseScore(row.cells[1]) : null;
  const meta =
    status === "upcoming"
      ? parseUpcomingMeta(row.cells[1])
      : { dateLabel: "", venue: "" };
  const record = {
    id: extractMatchId(row.links[0]),
    phase: status === "played" ? "Últimos resultados" : "Próximos partidos",
    status,
    competition: teamContext.competition,
    group: teamContext.group,
    homeTeam,
    awayTeam,
    isHome,
    dateLabel: meta.dateLabel,
    venue: meta.venue,
    score,
    sourceUrl: row.links[0] || "",
    summary: "",
  };

  record.summary =
    status === "played"
      ? summarizePlayedMatch(record, teamName)
      : summarizeUpcomingMatch(record);
  return record;
}

async function writeJson(fileName, payload) {
  const filePath = path.join(OUTPUT_DIR, fileName);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-http2", "--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1800 },
    locale: "es-ES",
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  });
  const teamPage = await context.newPage();
  const rankingPage = await context.newPage();

  try {
    await gotoAndSettle(teamPage, TEAM_URL);
    const teamMeta = await extractTeamMeta(teamPage);
    const players = await extractVisiblePlayers(teamPage);
    const [upcomingTab, lastResultsTab, competitionsTab] = await Promise.all([
      requestTeamTab(
        teamPage,
        teamMeta.tabController,
        teamMeta.csrfToken,
        "upcoming-matches",
      ),
      requestTeamTab(
        teamPage,
        teamMeta.tabController,
        teamMeta.csrfToken,
        "last-results",
      ),
      requestTeamTab(
        teamPage,
        teamMeta.tabController,
        teamMeta.csrfToken,
        "tournaments",
      ),
    ]);

    await gotoAndSettle(rankingPage, RANKING_URL);
    const rankingData = await extractStandings(rankingPage);
    const currentStanding = rankingData.standings.find(
      (entry) => entry.team === teamMeta.teamName,
    );
    const currentCompetition = competitionsTab.rows.find((row) =>
      row.links.includes(TEAM_URL),
    );
    const teamContext = {
      competition: currentCompetition?.cells[1] || teamMeta.competition,
      season: currentCompetition?.cells[2] || "",
      category: currentCompetition?.cells[3] || "",
      group: rankingData.groupName,
    };

    const upcomingMatches = upcomingTab.rows.map((row) =>
      buildMatchRecord(row, "upcoming", teamMeta.teamName, teamContext),
    );
    const playedMatches = lastResultsTab.rows.map((row) =>
      buildMatchRecord(row, "played", teamMeta.teamName, teamContext),
    );
    const matches = [...upcomingMatches, ...playedMatches];

    const teamData = {
      id: TEAM_URL.match(/\/team\/(\d+)/)?.[1] || "15680295",
      name: teamMeta.teamName,
      clubName: teamMeta.clubName,
      clubUrl: teamMeta.clubUrl,
      competition: teamContext.competition,
      group: teamContext.group,
      season: teamContext.season,
      category: teamContext.category,
      sourceUrl: TEAM_URL,
      subtitle: [teamMeta.clubName, teamContext.competition, teamContext.group]
        .filter(Boolean)
        .join(" · "),
      lastUpdated: new Date().toISOString(),
      heroStats: [
        { label: "Jugadores", value: String(players.length) },
        { label: "Resultados", value: String(playedMatches.length) },
        { label: "Próximos", value: String(upcomingMatches.length) },
        {
          label: "Posición",
          value: currentStanding ? `${currentStanding.position}ª` : "-",
        },
      ],
      overview: [
        {
          label: "Puntos",
          value: currentStanding ? String(currentStanding.points) : "-",
        },
        {
          label: "Balance",
          value: currentStanding
            ? `${currentStanding.won}V · ${currentStanding.drawn}E · ${currentStanding.lost}D`
            : "-",
        },
        {
          label: "Goles",
          value: currentStanding
            ? `${currentStanding.goalsFor} a favor · ${currentStanding.goalsAgainst} en contra`
            : "-",
        },
        {
          label: "Temporada",
          value: teamContext.season || "Sin temporada publicada",
        },
      ],
      standings: rankingData.standings,
    };

    await writeJson("team.json", teamData);
    await writeJson("players.json", { players });
    await writeJson("matches.json", { matches });

    console.log(
      `Imported ${players.length} players, ${playedMatches.length} results, and ${upcomingMatches.length} upcoming fixtures.`,
    );
  } finally {
    await Promise.allSettled([
      teamPage.close(),
      rankingPage.close(),
      context.close(),
    ]);
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
