import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

const BASE_URL  = __ENV.BASE_URL  || 'http://localhost:3000/api/user';
const MATCH_ID  = __ENV.MATCH_ID  || '5';       // Spain vs Belgium — UPCOMING, lineup confirmed
const GAME      = __ENV.GAME      || 'draftkings';
const SPORT     = __ENV.SPORT     || 'football';

const users = new SharedArray('team-gen users', function () {
  return JSON.parse(open('./results/login_users.json'));
});

/* Real playing-XI for match_id=5 (team_id 9 = Spain, team_id 10 = Belgium),
   pulled from match_players. captain:"CVC" marks the captain-candidate pool
   (2–6 required by the UCT engine); salary/cap only matter for the
   salary-cap games (draftkings/fanduel). */
const TEAM_A = [
  { name: 'Unai Simón',       role: 'GK',  salary: 4000 },
  { name: 'Pedro Porro',      role: 'DEF', salary: 3900 },
  { name: 'Aymeric Laporte',  role: 'DEF', salary: 4300 },
  { name: 'Pau Cubarsí',      role: 'DEF', salary: 3800 },
  { name: 'Marc Cucurella',   role: 'DEF', salary: 4100 },
  { name: 'Dani Olmo',        role: 'MID', salary: 4800 },
  { name: 'Álex Baena',       role: 'MID', salary: 4400 },
  { name: 'Rodri',            role: 'MID', salary: 6500, captain: 'CVC' },
  { name: 'Lamine Yamal',     role: 'MID', salary: 6800, captain: 'CVC' },
  { name: 'Fabián Ruiz',      role: 'MID', salary: 4600 },
  { name: 'Mikel Oyarzabal',  role: 'FWD', salary: 5200 },
];

const TEAM_B = [
  { name: 'Thibaut Courtois',     role: 'GK',  salary: 4200 },
  { name: 'Brandon Mechele',      role: 'DEF', salary: 3700 },
  { name: 'Maxim De Cuyper',      role: 'DEF', salary: 3800 },
  { name: 'Timothy Castagne',     role: 'DEF', salary: 4000 },
  { name: 'Nathan Ngoy',          role: 'DEF', salary: 3600 },
  { name: 'Kevin De Bruyne',      role: 'MID', salary: 6900, captain: 'CVC' },
  { name: 'Leandro Trossard',     role: 'MID', salary: 4700 },
  { name: 'Jérémy Doku',          role: 'MID', salary: 5100 },
  { name: 'Hans Vanaken',         role: 'MID', salary: 4500 },
  { name: 'Nicolas Raskin',       role: 'MID', salary: 4200 },
  { name: 'Charles De Ketelaere', role: 'FWD', salary: 5800, captain: 'CVC' },
];

const CAP = Number(__ENV.CAP || 100000);

export const options = {
  scenarios: {
    team_generation: {
      executor: 'shared-iterations',
      vus: Number(__ENV.VUS || 20),
      iterations: users.length,
      maxDuration: '10m',
    },
  },
  thresholds: {
    generation_success_rate: ['rate>0.95'],
  },
};

const loginDuration      = new Trend('login_duration', true);
const generationDuration = new Trend('generation_duration', true);
const generationSuccessRate = new Rate('generation_success_rate');
const generationFailures = new Counter('generation_failures');
const coinsDeductedOk    = new Rate('coins_deducted_correctly');

const jsonParams = { headers: { 'Content-Type': 'application/json' } };

export default function () {
  const globalIter = exec.scenario.iterationInTest;
  const user = users[globalIter % users.length];

  /* ── Login ── */
  const loginRes = http.post(
    `${BASE_URL}/user-auth/login`,
    JSON.stringify({ email: user.email, password: user.password }),
    jsonParams
  );
  loginDuration.add(loginRes.timings.duration);

  let loginBody = {};
  try { loginBody = JSON.parse(loginRes.body); } catch (e) {}

  if (loginRes.status !== 200 || !loginBody.token) {
    generationFailures.add(1);
    generationSuccessRate.add(false);
    console.error(`LOGIN FAILED [${user.email}] status=${loginRes.status} body=${loginRes.body}`);
    return;
  }

  const authParams = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${loginBody.token}`,
    },
  };

  /* ── Wallet balance before generation ── */
  const walletBeforeRes = http.get(`${BASE_URL}/deposite/my-coins`, authParams);
  let coinsBefore = null;
  try { coinsBefore = JSON.parse(walletBeforeRes.body)?.wallet?.available_coins; } catch (e) {}

  /* ── Generate teams ── */
  const genRes = http.post(
    `${BASE_URL}/teams/generate-teams`,
    JSON.stringify({
      match_id: MATCH_ID,
      game: GAME,
      sport: SPORT,
      cap: CAP,
      team_a: TEAM_A,
      team_b: TEAM_B,
    }),
    authParams
  );
  generationDuration.add(genRes.timings.duration);

  let genBody = {};
  try { genBody = JSON.parse(genRes.body); } catch (e) {}

  const ok = check(genRes, {
    'generate-teams status 200': (r) => r.status === 200,
    'generate-teams success true': () => genBody.success === true,
    'coins_used === 1': () => Number(genBody.coins_used) === 1,
  });

  generationSuccessRate.add(ok);
  if (!ok) {
    generationFailures.add(1);
    console.error(`GENERATE TEAMS FAILED [${user.email}] status=${genRes.status} body=${genRes.body}`);
  } else {
    const expectedRemaining = coinsBefore !== null ? coinsBefore - 1 : null;
    const deductionOk = expectedRemaining === null || Number(genBody.coins_remaining) === expectedRemaining;
    coinsDeductedOk.add(deductionOk);
    if (!deductionOk) {
      console.error(
        `COIN MISMATCH [${user.email}] before=${coinsBefore} reported_remaining=${genBody.coins_remaining}`
      );
    }
  }

  sleep(0.2);
}
