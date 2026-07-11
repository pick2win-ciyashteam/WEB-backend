// Plain Node.js load test for team generation (k6 CLI not installed on this
// machine). Logs in each of the 100 users from results/login_users.json,
// generates teams for match_id=5 (Spain vs Belgium, UPCOMING, lineup
// confirmed) for either draftkings or fanduel, and verifies the 1-coin
// deduction per user.
// Run: GAME=draftkings node team-generation-test.js
// Run: GAME=fanduel    node team-generation-test.js
import { readFileSync, writeFileSync } from "fs";

const BASE_URL     = process.env.BASE_URL || "http://localhost:3000/api/user";
const MATCH_ID     = Number(process.env.MATCH_ID || 5);
const GAME         = process.env.GAME || "draftkings";
const SPORT        = process.env.SPORT || "football";
const CONCURRENCY  = Number(process.env.CONCURRENCY || 10);
const USERS_FILE   = process.env.USERS_FILE || "./results/login_users.json";

const users = JSON.parse(readFileSync(new URL(USERS_FILE, import.meta.url)));

/* 20-player pool (10/side, mix of playing XI + substitutes) for match_id=5.
   Composition per side: 1 GK, 3 DEF, 3 MID, 3 FWD (within UCT's max-4-per-role
   cap, total 20 within its 10-22 squad-size window). UCT decides the actual
   per-lineup roster shape itself (8 players for draftkings, 7 for fanduel) —
   we only supply the pool + per-player salary + captain-pool tags. */

/* DraftKings: real UCT salary_cap = $50,000, salaries requested in 1000-15000 */
const DK_TEAM_A = [
  { name: "Unai Simón",      role: "GK",  salary: 4000 },
  { name: "Pedro Porro",     role: "DEF", salary: 3200 },
  { name: "Aymeric Laporte", role: "DEF", salary: 3800 },
  { name: "Pau Cubarsí",     role: "DEF", salary: 2800 },
  { name: "Dani Olmo",       role: "MID", salary: 4500 },
  { name: "Rodri",           role: "MID", salary: 14000, captain: "CVC" },
  { name: "Lamine Yamal",    role: "MID", salary: 15000, captain: "CVC" },
  { name: "Mikel Oyarzabal", role: "FWD", salary: 5200 },
  { name: "Nico Williams",   role: "FWD", salary: 6000 },
  { name: "Ferran Torres",   role: "FWD", salary: 4200 },
];
const DK_TEAM_B = [
  { name: "Thibaut Courtois",     role: "GK",  salary: 4200 },
  { name: "Timothy Castagne",     role: "DEF", salary: 3000 },
  { name: "Nathan Ngoy",          role: "DEF", salary: 2500 },
  { name: "Maxim De Cuyper",      role: "DEF", salary: 2900 },
  { name: "Leandro Trossard",     role: "MID", salary: 4300 },
  { name: "Jérémy Doku",          role: "MID", salary: 5000 },
  { name: "Kevin De Bruyne",      role: "MID", salary: 14500, captain: "CVC" },
  { name: "Charles De Ketelaere", role: "FWD", salary: 6500, captain: "CVC" },
  { name: "Romelu Lukaku",        role: "FWD", salary: 7000 },
  { name: "Alexis Saelemaekers",  role: "FWD", salary: 3800 },
];

/* FanDuel: real UCT salary_cap = 100 (not thousands) — salaries 1-29 as given */
const FD_TEAM_A = [
  { name: "Unai Simón",      role: "GK",  salary: 8 },
  { name: "Pedro Porro",     role: "DEF", salary: 6 },
  { name: "Aymeric Laporte", role: "DEF", salary: 7 },
  { name: "Pau Cubarsí",     role: "DEF", salary: 5 },
  { name: "Dani Olmo",       role: "MID", salary: 9 },
  { name: "Rodri",           role: "MID", salary: 27, captain: "CVC" },
  { name: "Lamine Yamal",    role: "MID", salary: 29, captain: "CVC" },
  { name: "Mikel Oyarzabal", role: "FWD", salary: 10 },
  { name: "Nico Williams",   role: "FWD", salary: 11 },
  { name: "Ferran Torres",   role: "FWD", salary: 8 },
];
const FD_TEAM_B = [
  { name: "Thibaut Courtois",     role: "GK",  salary: 8 },
  { name: "Timothy Castagne",     role: "DEF", salary: 6 },
  { name: "Nathan Ngoy",          role: "DEF", salary: 5 },
  { name: "Maxim De Cuyper",      role: "DEF", salary: 6 },
  { name: "Leandro Trossard",     role: "MID", salary: 9 },
  { name: "Jérémy Doku",          role: "MID", salary: 10 },
  { name: "Kevin De Bruyne",      role: "MID", salary: 28, captain: "CVC" },
  { name: "Charles De Ketelaere", role: "FWD", salary: 13, captain: "CVC" },
  { name: "Romelu Lukaku",        role: "FWD", salary: 14 },
  { name: "Alexis Saelemaekers",  role: "FWD", salary: 7 },
];

const TEAM_A = GAME === "fanduel" ? FD_TEAM_A : DK_TEAM_A;
const TEAM_B = GAME === "fanduel" ? FD_TEAM_B : DK_TEAM_B;

async function runOne(user) {
  const start = Date.now();
  const result = { email: user.email, ok: false, stage: null, error: null,
    coinsBefore: null, coinsAfter: null, coinsUsed: null, durationMs: null };

  try {
    const loginRes = await fetch(`${BASE_URL}/user-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password: user.password }),
    });
    const loginBody = await loginRes.json();
    if (loginRes.status !== 200 || !loginBody.token) {
      result.stage = "login";
      result.error = `status=${loginRes.status} body=${JSON.stringify(loginBody)}`;
      return result;
    }
    const authHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${loginBody.token}`,
    };

    const walletBeforeRes = await fetch(`${BASE_URL}/deposite/my-coins`, { headers: authHeaders });
    const walletBefore = await walletBeforeRes.json();
    result.coinsBefore = walletBefore?.wallet?.available_coins ?? null;

    const genRes = await fetch(`${BASE_URL}/teams/generate-teams`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        match_id: MATCH_ID,
        game: GAME,
        sport: SPORT,
        team_a: TEAM_A,
        team_b: TEAM_B,
      }),
    });
    const genBody = await genRes.json();

    if (genRes.status !== 200 || genBody.success !== true) {
      result.stage = "generate-teams";
      result.error = `status=${genRes.status} body=${JSON.stringify(genBody)}`;
      return result;
    }

    result.coinsUsed = genBody.coins_used;
    result.coinsAfter = genBody.coins_remaining;

    const deductionOk =
      genBody.coins_used === 1 &&
      (result.coinsBefore === null || genBody.coins_remaining === result.coinsBefore - 1);

    if (!deductionOk) {
      result.stage = "coin-check";
      result.error = `before=${result.coinsBefore} coins_used=${genBody.coins_used} remaining=${genBody.coins_remaining}`;
      return result;
    }

    result.ok = true;
    return result;
  } catch (err) {
    result.stage = result.stage || "exception";
    result.error = err.message;
    return result;
  } finally {
    result.durationMs = Date.now() - start;
  }
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runner() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, runner));
  return results;
}

(async () => {
  console.log(`Running team-generation test: ${users.length} users, concurrency=${CONCURRENCY}, match_id=${MATCH_ID}, game=${GAME}`);
  const startedAt = Date.now();
  const results = await runPool(users, CONCURRENCY, runOne);
  const totalMs = Date.now() - startedAt;

  const passed = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total: ${results.length}  Passed: ${passed.length}  Failed: ${failed.length}`);
  console.log(`Total wall time: ${(totalMs / 1000).toFixed(1)}s`);
  const avgMs = results.reduce((s, r) => s + (r.durationMs || 0), 0) / results.length;
  console.log(`Avg per-user time: ${avgMs.toFixed(0)}ms`);

  if (failed.length) {
    console.log(`\n=== FAILURES (first 20) ===`);
    for (const f of failed.slice(0, 20)) {
      console.log(`[${f.email}] stage=${f.stage} error=${f.error}`);
    }
  }

  const outFile = new URL(`./results/team_generation_${GAME}_${Date.now()}.json`, import.meta.url);
  writeFileSync(outFile, JSON.stringify({ MATCH_ID, GAME, SPORT, CONCURRENCY, totalMs, results }, null, 2));
  console.log(`\nFull results written to ${outFile.pathname.replace(/^\/([A-Za-z]):/, "$1:")}`);
})();
