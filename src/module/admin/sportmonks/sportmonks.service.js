import axios from "axios";
import db from  "../../../config/db.js";
import { sendPushToAll } from "../../../utils/notification.js";

const TOKEN = process.env.SPORTMONKS_TOKEN;
const BASE_URL = "https://api.sportmonks.com/v3/football";




const apiGet = async (endpoint, params = {}, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data } = await axios.get(`${BASE_URL}${endpoint}`, {
        params: { api_token: TOKEN, ...params },
      });
      return data;
    } catch (err) {
      // Don't retry on 404 — fixture doesn't exist on provider
      if (err?.response?.status === 404) {
        console.warn(`⚠️  404 — skipping ${endpoint}`);
        throw err;
      }

      if (attempt === retries) throw err;
      const delay = 1000 * attempt;
      console.warn(`API retry ${attempt}/${retries} for ${endpoint} in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
};

const mapStatus = (stateId) => {
  if (stateId === 5)  return "RESULT";   // FT - Full Time
  if (stateId === 1)  return "UPCOMING"; // NS - Not Started
  if (stateId === 17) return "UPCOMING"; // Postponed
  if (stateId === 18) return "UPCOMING"; // Cancelled
  if (stateId === 19) return "UPCOMING"; // Abandoned
  return "LIVE"; // All other states = LIVE (2,3,4,6-16,22,etc.)
};

const mapPosition = (pos) => {
  if (!pos) return "MID";
  const p = pos.toUpperCase();
  if (p.includes("GOAL") || p === "G" || p === "GK") return "GK";
  if (p.includes("DEF") || p === "D")                return "DEF";
  if (p.includes("MID") || p === "M")                return "MID";
  if (p.includes("FOR") || p === "F" || p === "ATT" || p.includes("ATT")) return "FWD";
  return "MID";
};

const getDateRange = (days = 60) => {
  const today  = new Date().toISOString().split("T")[0];
  const future = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];
  return { today, future };
};

const positionIdMap = {
  24: "GK",
  25: "DEF",
  26: "MID",
  27: "FWD",
};

/* ══════════════════════════════════════════
   PLAYING XI (match_players table only)
══════════════════════════════════════════ */
export const syncPlayingXIService = async (providerMatchId) => {

  const [[matchRow]] = await db.query(
    `SELECT id, provider_match_id, home_team_id, away_team_id, lineup_status
     FROM matches
     WHERE provider_match_id = ?
     LIMIT 1`,
    [String(providerMatchId)]
  );

  if (!matchRow) {
    return { count: 0, reason: `Match not found in DB: ${providerMatchId}` };
  }

  const data = await apiGet(`/fixtures/${providerMatchId}`, {
    include: "lineups.player",
  });

  const fixture = data?.data;
  const allLineups = fixture?.lineups || [];

  if (!allLineups.length) {
    await db.query(
      `UPDATE matches
       SET lineupavailable = 0,
           lineup_status = 'not_available'
       WHERE id = ?`,
      [matchRow.id]
    );

    return {
      count: 0,
      reason: "Lineup not published yet on Sportmonks",
    };
  }

  const startingXI = allLineups.filter((p) => p.type_id === 11);
  const bench = allLineups.filter((p) => p.type_id === 12);

  console.log(
    `📋 Match ${providerMatchId} — Starting XI: ${startingXI.length} | Bench: ${bench.length}`
  );

  const [teamRows] = await db.query(
    `SELECT id, provider_team_id
     FROM teams
     WHERE id IN (?, ?)`,
    [matchRow.home_team_id, matchRow.away_team_id]
  );

  const teamMap = new Map(
    teamRows.map((t) => [String(t.provider_team_id), t.id])
  );

  const positionIdMap = {
    24: "GK",
    25: "DEF",
    26: "MID",
    27: "FWD",
  };

  const seen = new Set();

  await db.query(`DELETE FROM match_players WHERE match_id = ?`, [
    matchRow.id,
  ]);

  const insertPlayer = async (entry, isPlaying, isSubstitute) => {
    const pid = String(entry.player_id);
    const dbTeamId = teamMap.get(String(entry.team_id));

    if (!dbTeamId) {
      console.warn(
        `⚠️ Team not in DB: provider_team_id=${entry.team_id}`
      );
      return 0;
    }

    if (seen.has(pid)) {
      console.warn(`⚠️ Duplicate skipped: player_id=${pid}`);
      return 0;
    }

    seen.add(pid);

    const position = positionIdMap[entry.position_id] || "MID";
    const logo = entry.player?.image_path || null;

    await db.query(
      `INSERT INTO match_players
      (
        match_id,
        team_id,
        player_name,
        position,
        is_playing,
        is_substitute,
        provider_player_id,
        jersey_number,
        logo
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        is_playing = VALUES(is_playing),
        is_substitute = VALUES(is_substitute),
        player_name = VALUES(player_name),
        position = VALUES(position),
        jersey_number = VALUES(jersey_number),
        logo = VALUES(logo)`,
      [
        matchRow.id,
        dbTeamId,
        entry.player_name ||
          entry.player?.display_name ||
          `Player ${pid}`,
        position,
        isPlaying,
        isSubstitute,
        pid,
        entry.jersey_number || null,
        logo,
      ]
    );

    return 1;
  };

  let count = 0;

  for (const p of startingXI) {
    count += await insertPlayer(p, 1, 0);
  }

  for (const p of bench) {
    count += await insertPlayer(p, 0, 1);
  }

  // Notification only once
  const shouldNotify = matchRow.lineup_status !== "confirmed";

  await db.query(
    `UPDATE matches
     SET lineupavailable = 1,
         lineup_status = 'confirmed'
     WHERE id = ?`,
    [matchRow.id]
  );

  if (shouldNotify) {
    await sendPushToAll({
      title: "Lineup Released ⚽",
      body: "Playing XI has been announced. Generate your UCT teams now!",
      data: {
        match_id: String(matchRow.id),
        type: "lineup_released",
      },
    });

    console.log(`📲 Notification sent for match ${matchRow.id}`);
  }

  console.log(
    `✅ Playing XI synced: ${count} players for match ${providerMatchId}`
  );

  return {
    count,
    reason: null,
    type: "lineup",
  };
};

/* ══════════════════════════════════════════
   SERIES
══════════════════════════════════════════ */

export const getAvailableSeriesService = async () => {
  // Step 1: Fetch all leagues
  let allLeagues = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const data = await apiGet("/leagues", { per_page: 100, page });
    allLeagues.push(...(data.data || []));
    hasMore = data.pagination?.has_more || false;
    page++;
    if (page > 5) break;
  }

  if (!allLeagues.length) return [];

  // Step 2: Fetch upcoming fixtures to find active league IDs
  const today  = new Date().toISOString().split("T")[0];
  const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];

  const upcomingLeagueIds = new Set();
  page = 1;
  hasMore = true;

  while (hasMore) {
    const data = await apiGet(`/fixtures/between/${today}/${future}`, {
      per_page: 100,
      page,
    });

    for (const fixture of data.data || []) {
      if (fixture.league_id) upcomingLeagueIds.add(String(fixture.league_id));
    }

    hasMore = data.pagination?.has_more || false;
    page++;

    if (upcomingLeagueIds.size >= allLeagues.length) break;
    if (page > 50) break;
  }

  console.log(`✅ Upcoming league IDs found: ${upcomingLeagueIds.size}`);

  if (!upcomingLeagueIds.size) return [];

  // Step 3: Filter leagues that have upcoming fixtures
  const filteredLeagues = allLeagues.filter((l) =>
    upcomingLeagueIds.has(String(l.id))
  );

  if (!filteredLeagues.length) return [];

  // Step 4: DB lookup
  const leagueIds = filteredLeagues.map((l) => String(l.id));
  const [dbRows] = await db.query(
    `SELECT seriesid, status, is_selected FROM series WHERE seriesid IN (?)`,
    [leagueIds]
  );
  const dbMap = new Map(dbRows.map((r) => [String(r.seriesid), r]));

  return filteredLeagues
    .map((l) => {
      const dbRow = dbMap.get(String(l.id));
      return {
        cid:          String(l.id),
        name:         l.name,
        short_code:   l.short_code || null,
        league_image: l.image_path || null,
        type:         l.type,
        sub_type:     l.sub_type,
        category:     l.category,
        last_played:  l.last_played_at || null,
        is_active:    dbRow ? dbRow.is_selected === 1 : false,
        status:       dbRow ? dbRow.status : "pending",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const toggleSeriesService = async (seriesIds, isActive) => {
  const results  = [];
  const uniqueIds = [...new Set(seriesIds.map(String))];

  for (const seriesid of uniqueIds) {
    const [[existing]] = await db.query(
      `SELECT id, name FROM series WHERE seriesid = ? LIMIT 1`,
      [seriesid]
    );

    if (existing) {
      await db.query(
        `UPDATE series SET status = ?, is_selected = ? WHERE seriesid = ?`,
        [isActive ? "active" : "inactive", isActive ? 1 : 0, seriesid]
      );
      results.push({ seriesid, name: existing.name, is_active: isActive });
      continue;
    }

    if (!isActive) {
      results.push({ seriesid, error: "Series not in DB — toggle ON " });
      continue;
    }

    let league = null;
    try {
      const data = await apiGet(`/leagues/${seriesid}`);
      league = data?.data ?? null;
      console.log(`Fetched league: ${league?.name} (id: ${league?.id})`);
    } catch (e) {
      console.error(`League fetch error for ${seriesid}:`, e.response?.data || e.message);
    }

    if (!league) {
      results.push({ seriesid, error: "League not found in API" });
      continue;
    }

    await db.query(
      `INSERT INTO series
         (seriesid, name,  start_date, end_date, status, is_selected, created_at)
       VALUES (?, ?, ?, ?,  'active', 1, NOW())
       ON DUPLICATE KEY UPDATE
         name        = VALUES(name),
         status      = 'active',
         is_selected = 1`,
      [seriesid, league.name, null, null]
    );

    results.push({ seriesid, name: league.name, is_active: true });
  }

  return results;
};

export const getActiveSeriesService = async () => {
  const [series] = await db.query(`
    SELECT
      id,
      seriesid,
      name,
      country_name ,

      logo         ,

      start_date,
      end_date,
      status,
      is_selected,
      created_at
    FROM series
    WHERE is_selected = 1
    ORDER BY created_at DESC
  `);

  if (!series.length) {
    return { success: true, data: [] };
  }

  const seriesIds = series.map((s) => String(s.seriesid));
  const placeholders = seriesIds.map(() => "?").join(",");

  // ✅ Fetch ALL LIVE + future UPCOMING matches with team details
  const [matches] = await db.query(
    `SELECT
       m.id,
       m.provider_match_id,
       m.series_id,
       m.start_time,
       m.status,
       m.lineupavailable,
       m.lineup_status,
       m.is_active,

       COALESCE(ht.short_name, ht.name, 'TBA')  AS home_team_name,
       COALESCE(awt.short_name, awt.name, 'TBA') AS away_team_name,
       ht.logo  AS home_team_logo,
       awt.logo AS away_team_logo

     FROM matches m
     LEFT JOIN teams ht  ON m.home_team_id = ht.id
     LEFT JOIN teams awt ON m.away_team_id = awt.id

     WHERE m.series_id IN (${placeholders})
       AND m.is_active = 1
       AND (
         m.status = 'LIVE'
         OR (m.status = 'UPCOMING' AND m.start_time >= NOW())
       )
     ORDER BY
       CASE WHEN m.status = 'LIVE' THEN 1 ELSE 2 END,
       m.start_time ASC`,
    seriesIds
  );

  // ✅ Group all matches under their series (not just first one)
  const matchesBySeriesId = new Map();
  for (const match of matches) {
    const key = String(match.series_id);
    if (!matchesBySeriesId.has(key)) {
      matchesBySeriesId.set(key, []);
    }
    matchesBySeriesId.get(key).push(match);
  }

  // ✅ Filter out series with no active matches
  const result = series
    .map((s) => {
      const seriesMatches = matchesBySeriesId.get(String(s.seriesid)) || [];
      return {
        ...s,
        total_matches: seriesMatches.length,
        matches: seriesMatches,
      };
    })
    .filter((s) => s.total_matches > 0);

  return { success: true, data: result };
};

/* ══════════════════════════════════════════
   MATCHES
══════════════════════════════════════════ */

export const getAvailableMatchesService = async (seriesid) => {
  const { today, future } = getDateRange(60);
  let allFixtures = [];
  let page        = 1;
  let hasMore     = true;

  while (hasMore) {
    const data = await apiGet(`/fixtures/between/${today}/${future}`, {
      include:  "participants",
      per_page: 100,
      page,
    });

    const filtered = (data.data || []).filter(
      (f) => String(f.league_id) === String(seriesid)
    );
    allFixtures.push(...filtered);

    hasMore = data.pagination?.has_more || false;
    page++;
    if (page > 10) break;
  }

  const providerIds = allFixtures.map((f) => String(f.id));
  let activeSet     = new Set();

  if (providerIds.length) {
    const [dbRows] = await db.query(
      `SELECT provider_match_id FROM matches
       WHERE provider_match_id IN (?) AND is_active = 1`,
      [providerIds]
    );
    activeSet = new Set(dbRows.map((r) => String(r.provider_match_id)));
  }

  return allFixtures.map((f) => {
    const home = f.participants?.find((p) => p.meta?.location === "home");
    const away = f.participants?.find((p) => p.meta?.location === "away");

    const startTimeUTC = toUTCDateTime(f.starting_at_timestamp, f.starting_at);

    return {
      match_id:   String(f.id),
      home:       home?.name        || "",
      home_image: home?.image_path  || null,
      away:       away?.name        || "",
      away_image: away?.image_path  || null,
      start_time: startTimeUTC,
      status:     mapStatus(f.state_id),
      is_active:  activeSet.has(String(f.id)),
    };
  });
};

export const getMatchesService = async (seriesid) => {
  const [matches] = await db.query(
    `SELECT id, series_id, seriesname, home_team_id, hometeamname,
            away_team_id, awayteamname, matchdate, start_time,
            status, provider_match_id, is_active, created_at
     FROM matches WHERE series_id = ?
     ORDER BY matchdate ASC, start_time ASC`,
    [seriesid]
  );
  return { success: true, data: matches };
};

/* ══════════════════════════════════════════
   HELPER — timestamp to UTC datetime
══════════════════════════════════════════ */
const toUTCDateTime = (timestamp, fallback) => {
  if (timestamp) {
    return new Date(timestamp * 1000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
  }
  return fallback || null;
};

export const toggleMatchesService = async (matchIds, isActive, seriesId) => {
  const results   = [];
  const uniqueIds = [...new Set(matchIds.map(String))];

  for (const matchId of uniqueIds) {
    const [[existing]] = await db.query(
      `SELECT id, hometeamname, awayteamname, start_time, lineupavailable
       FROM matches WHERE provider_match_id = ? LIMIT 1`,
      [matchId]
    );

    if (existing) {
      await db.query(
        `UPDATE matches SET is_active = ? WHERE provider_match_id = ?`,
        [isActive ? 1 : 0, matchId]
      );
      results.push({
        match_id:   matchId,
        home:       existing.hometeamname,
        away:       existing.awayteamname,
        start_time: existing.start_time,
        is_active:  isActive,
        note:       isActive
          ? "Match activated — lineup sync via cron when announced"
          : "Match deactivated",
      });
      continue;
    }

    if (!isActive) {
      results.push({ match_id: matchId, error: "Match not found in DB" });
      continue;
    }

    /* ── ✅ include venue ── */
    const data    = await apiGet(`/fixtures/${matchId}`, {
      include: "participants;league;league.country;venue",
    });
    const fixture = data?.data;

    if (!fixture) {
      results.push({ match_id: matchId, error: "Match not found in API" });
      continue;
    }

    const home      = fixture.participants?.find((p) => p.meta?.location === "home");
    const away      = fixture.participants?.find((p) => p.meta?.location === "away");
    const lookupCid = seriesId ? String(seriesId) : String(fixture.league_id);

    /* ── Series upsert (same as before) ── */
    let seriesRow = null;

    const [[existingSeries]] = await db.query(
      `SELECT id, seriesid FROM series WHERE seriesid = ? LIMIT 1`,
      [lookupCid]
    );

    if (!existingSeries) {
      const leagueName  = fixture.league?.name           || `Series ${lookupCid}`;
      const leagueLogo  = fixture.league?.image_path     || null;
      const shortCode   = fixture.league?.short_code     || null;
      const type        = fixture.league?.type           || null;
      const subType     = fixture.league?.sub_type       || null;
      const category    = fixture.league?.category       || null;
      const lastPlayed  = fixture.league?.last_played_at || null;
      const countryName = fixture.league?.country?.name  || null;

      await db.query(
        `INSERT INTO series
           (seriesid, name, short_code, start_date, end_date,
            country_name, logo, league_image,
            type, sub_type, category, last_played,
            status, is_selected, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, NOW())
         ON DUPLICATE KEY UPDATE
           name         = VALUES(name),
           short_code   = VALUES(short_code),
           start_date   = VALUES(start_date),
           end_date     = VALUES(end_date),
           country_name = VALUES(country_name),
           logo         = VALUES(logo),
           league_image = VALUES(league_image),
           type         = VALUES(type),
           sub_type     = VALUES(sub_type),
           category     = VALUES(category),
           last_played  = VALUES(last_played),
           status       = 'active',
           is_selected  = 1`,
        [
          lookupCid, leagueName, shortCode, null, null,
          countryName, leagueLogo, leagueLogo,
          type, subType, category, lastPlayed,
        ]
      );

      const [[refetched]] = await db.query(
        `SELECT id, seriesid FROM series WHERE seriesid = ? LIMIT 1`,
        [lookupCid]
      );
      seriesRow = refetched;

    } else {
      await db.query(
        `UPDATE series SET status = 'active', is_selected = 1 WHERE seriesid = ?`,
        [lookupCid]
      );
      seriesRow = existingSeries;
    }

    if (!seriesRow) {
      results.push({ match_id: matchId, error: "Series insert failed" });
      continue;
    }

    /* ── Teams upsert ── */
    const teamIds = {};
    for (const participant of [home, away]) {
      if (!participant) continue;

      await db.query(
        `INSERT INTO teams (name, short_name, series_id, provider_team_id, logo)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name       = VALUES(name),
           short_name = VALUES(short_name),
           logo       = VALUES(logo)`,
        [
          participant.name,
          participant.short_code || participant.name.substring(0, 3),
          seriesRow.seriesid,
          String(participant.id),
          participant.image_path || null,
        ]
      );

      const [[teamRow]] = await db.query(
        `SELECT id FROM teams WHERE provider_team_id = ? LIMIT 1`,
        [String(participant.id)]
      );
      teamIds[participant.meta.location] = teamRow?.id || null;
    }

    /* ── ✅ Venue data ── */
    const venue        = fixture.venue || null;
    const venueId       = venue?.id          || null;
    const venueName     = venue?.name        || null;
    const venueCity     = venue?.city_name   || null;
    const venueCountry  = venue?.country_id  || null;

    /* ── Match upsert — venue add చేయి ── */
    const startingAt    = fixture.starting_at;
    const matchDateOnly = startingAt?.split(" ")[0] || null;

    await db.query(
      `INSERT INTO matches
         (provider_match_id, series_id, home_team_id, away_team_id,
          start_time, status, seriesname, hometeamname, awayteamname,
          matchdate, lineupavailable, lineup_status, is_active,
          venue, venue_name, venue_city, venue_country_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'not_available', 1, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         is_active        = 1,
         lineup_status    = 'not_available',
         series_id        = VALUES(series_id),
         home_team_id     = VALUES(home_team_id),
         away_team_id     = VALUES(away_team_id),
         status           = VALUES(status),
         seriesname       = VALUES(seriesname),
         hometeamname     = VALUES(hometeamname),
         awayteamname     = VALUES(awayteamname),
         matchdate        = VALUES(matchdate),
         start_time       = VALUES(start_time),
         venue            = VALUES(venue),
         venue_name       = VALUES(venue_name),
         venue_city       = VALUES(venue_city),
         venue_country_id = VALUES(venue_country_id)`,
      [
        matchId,
        seriesRow.seriesid,
        teamIds["home"] || null,
        teamIds["away"] || null,
        startingAt,
        mapStatus(fixture.state_id),
        fixture.league?.name || "",
        home?.name || "",
        away?.name || "",
        matchDateOnly,
        venueId,
        venueName,
        venueCity,
        venueCountry,
      ]
    );

    results.push({
      match_id:   matchId,
      home:       home?.name,
      away:       away?.name,
      start_time: startingAt,
      venue:      venueName,
      is_active:  true,
      note:       "Match added with venue. Series auto-created if not exists.",
    });
  }

  return results;
};

/* ══════════════════════════════════════════
   FIXTURES BY DATE RANGE
══════════════════════════════════════════ */

/* ─── Fetch Fixtures Between Two Dates ─── */
export const getFixturesBetween = async (fromDate, toDate, page = 1) => {

  const url = `${BASE_URL}/fixtures/between/${fromDate}/${toDate}` +
    `?include=participants;league;state;venue` +
    `&per_page=50` +
    `&page=${page}` +
    `&api_token=${TOKEN}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.errors) {
    throw new Error(data.message || "SportMonks API error");
  }

  return data;
};

/* ─── Fetch ALL pages ─── */
export const getAllFixturesBetween = async (fromDate, toDate) => {

  const first = await getFixturesBetween(fromDate, toDate, 1);

  const totalPages = first.pagination?.last_page || 1;
  let allFixtures = [...(first.data || [])];

  if (totalPages > 1) {
    const promises = [];
    for (let p = 2; p <= totalPages; p++) {
      promises.push(getFixturesBetween(fromDate, toDate, p));
    }
    const rest = await Promise.all(promises);
    rest.forEach(r => allFixtures.push(...(r.data || [])));
  }

  return allFixtures;
};


export const getMatchesByDateRangeService = async (fromDate, toDate) => {
  // ── All pages fetch ──
  const first = await (async (page) => {
    const url = `${BASE_URL}/fixtures/between/${fromDate}/${toDate}` +
      `?include=participants;league;state;venue;lineups` +
      `&per_page=50` +
      `&page=${page}` +
      `&api_token=${TOKEN}`;
    const res  = await fetch(url);
    const data = await res.json();
    if (!res.ok || data.errors) throw new Error(data.message || "SportMonks API error");
    return data;
  })(1);

  const totalPages  = first.pagination?.last_page || 1;
  let   allFixtures = [...(first.data || [])];

  if (totalPages > 1) {
    const promises = [];
    for (let p = 2; p <= totalPages; p++) {
      promises.push((async (page) => {
        const url = `${BASE_URL}/fixtures/between/${fromDate}/${toDate}` +
          `?include=participants;league;state;venue;lineups` +
          `&per_page=50` +
          `&page=${page}` +
          `&api_token=${TOKEN}`;
        const res  = await fetch(url);
        const data = await res.json();
        return data;
      })(p));
    }
    const rest = await Promise.all(promises);
    rest.forEach(r => allFixtures.push(...(r.data || [])));
  }

  // ── Date filter ──
  const fromDt = new Date(fromDate); fromDt.setHours(0,  0,  0,   0);
  const toDt   = new Date(toDate);   toDt.setHours(23, 59, 59, 999);

  const dateFiltered = allFixtures.filter(f => {
    if (!f.starting_at) return false;
    const d = new Date(f.starting_at);
    return d >= fromDt && d <= toDt;
  });

  // ── Lineup filter — Starting XI ──
  const withLineup = dateFiltered.filter(f => {
    const lineups = f.lineups || [];
    return lineups.some(l => l.type_id === 11);
  });

  // ── Format ──
  return withLineup.map(f => {
    const home = f.participants?.find(p => p.meta?.location === "home");
    const away = f.participants?.find(p => p.meta?.location === "away");

    const homeLineupCount = (f.lineups || []).filter(
      l => String(l.team_id) === String(home?.id) && l.type_id === 11
    ).length;
    const awayLineupCount = (f.lineups || []).filter(
      l => String(l.team_id) === String(away?.id) && l.type_id === 11
    ).length;

    return {
      id:     f.id,
      name:   f.name,
      date:   f.starting_at,
      status: f.state?.name || "Unknown",

      lineup_ready: {
        home: homeLineupCount >= 11,
        away: awayLineupCount >= 11,
        both: homeLineupCount >= 11 && awayLineupCount >= 11,
      },

      league: {
        id:      f.league?.id,
        name:    f.league?.name,
        country: f.league?.country_id,
      },

      venue: {
        id:   f.venue?.id,
        name: f.venue?.name,
        city: f.venue?.city_name,
      },

      home: {
        id:    home?.id,
        name:  home?.name,
        image: home?.image_path,
      },

      away: {
        id:    away?.id,
        name:  away?.name,
        image: away?.image_path,
      },

      score: {
        home: f.scores?.find(
          s => s.description === "CURRENT" && s.score?.participant === "home"
        )?.score?.goals ?? null,
        away: f.scores?.find(
          s => s.description === "CURRENT" && s.score?.participant === "away"
        )?.score?.goals ?? null,
      },
    };
  });
};

/* ══════════════════════════════════════════
   MANUAL PLAYING XI SYNC (admin-triggered, includes venue)
══════════════════════════════════════════ */
export const manualSyncPlayingXIService = async (providerMatchId) => {

  const [[matchRow]] = await db.query(
    `SELECT id, provider_match_id, home_team_id, away_team_id,
            venue_name, venue_city
     FROM matches WHERE provider_match_id = ? LIMIT 1`,
    [String(providerMatchId)]
  );

  if (!matchRow)
    return { count: 0, reason: `Match not found in DB: ${providerMatchId}` };

  /* ── ✅ include lineups.player (logo) + venue ── */
  const data       = await apiGet(`/fixtures/${providerMatchId}`, {
    include: "lineups.player;venue",
  });
  const fixture    = data?.data;
  const allLineups = fixture?.lineups || [];

  const venue = fixture.venue || null;
  console.log("🏟️ Venue raw data:", JSON.stringify(venue, null, 2));

  if (!allLineups.length) {
    await db.query(
      `UPDATE matches SET lineupavailable = 0, lineup_status = 'not_available' WHERE id = ?`,
      [matchRow.id]
    );
    return { count: 0, reason: "Lineup not published yet on Sportmonks" };
  }

  const startingXI = allLineups.filter(p => p.type_id === 11);
  const bench      = allLineups.filter(p => p.type_id === 12);

  console.log(`📋 Match ${providerMatchId} — Starting XI: ${startingXI.length} | Bench: ${bench.length}`);

  const [teamRows] = await db.query(
    `SELECT id, provider_team_id FROM teams WHERE id IN (?, ?)`,
    [matchRow.home_team_id, matchRow.away_team_id]
  );
  const teamMap = new Map(teamRows.map(t => [String(t.provider_team_id), t.id]));

  const positionIdMapManual = { 24: "GK", 25: "DEF", 26: "MID", 27: "FWD" };

  await db.query(`DELETE FROM match_players WHERE match_id = ?`, [matchRow.id]);

  const insertPlayer = async (entry, isPlaying, isSubstitute) => {
    const dbTeamId = teamMap.get(String(entry.team_id));

    if (!dbTeamId) {
      console.warn(`⚠️ Team not in DB: provider_team_id=${entry.team_id}`);
      return 0;
    }

    const position = positionIdMapManual[entry.position_id] || "MID";

    /* ── ✅ logo — entry.player.image_path ── */
    const logo = entry.player?.image_path || null;

    await db.query(
      `INSERT INTO match_players
         (match_id, team_id, player_name, position,
          is_playing, is_substitute,
          provider_player_id, jersey_number, logo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         is_playing    = VALUES(is_playing),
         is_substitute = VALUES(is_substitute),
         player_name   = VALUES(player_name),
         position      = VALUES(position),
         jersey_number = VALUES(jersey_number),
         logo          = VALUES(logo)`,
      [
        matchRow.id,
        dbTeamId,
        entry.player_name || entry.player?.display_name || `Player ${entry.player_id}`,
        position,
        isPlaying,
        isSubstitute,
        String(entry.player_id),
        entry.jersey_number || null,
        logo,
      ]
    );
    return 1;
  };

  let count = 0;
  for (const p of startingXI) count += await insertPlayer(p, 1, 0);
  for (const p of bench)      count += await insertPlayer(p, 0, 1);

  await db.query(
    `UPDATE matches SET lineupavailable = 1, lineup_status = 'confirmed' WHERE id = ?`,
    [matchRow.id]
  );

  /* ── ✅ venue fields from matchRow (already in DB from toggleMatchesService) ── */
  const venueName = matchRow.venue_name || null;
  const venueCity = matchRow.venue_city || null;

  console.log(`✅ Playing XI synced: ${count} players for match ${providerMatchId}`);
  return {
    count,
    reason:     null,
    type:       "lineup",
    venue_name: venueName,
    venue_city: venueCity,
  };
};
