import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api/user/user-auth';

const users = new SharedArray('login users', function () {
  return JSON.parse(open('./results/login_users.json'));
});

export const options = {
  scenarios: {
    login_load: {
      executor: 'shared-iterations',
      vus: Number(__ENV.VUS || 20),
      iterations: users.length,
      maxDuration: '5m',
    },
  },
  thresholds: {
    login_success_rate: ['rate>0.95'],
  },
};

const loginDuration    = new Trend('login_duration', true);
const loginSuccessRate = new Rate('login_success_rate');
const loginFailures    = new Counter('login_failures');

const params = { headers: { 'Content-Type': 'application/json' } };

export default function () {
  // __ITER is per-VU (not globally unique) — use the scenario-wide
  // iteration counter so each of the 100 iterations maps to a distinct user.
  const user = users[exec.scenario.iterationInTest % users.length];

  const payload = JSON.stringify({
    email:    user.email,
    password: user.password,
  });

  const res = http.post(`${BASE_URL}/login`, payload, params);
  loginDuration.add(res.timings.duration);

  let body = {};
  try { body = JSON.parse(res.body); } catch (e) {}

  const ok = check(res, {
    'login status 200': (r) => r.status === 200,
    'login success true': () => body.success === true,
    'token present': () => !!body.token,
  });

  loginSuccessRate.add(ok);
  if (!ok) {
    loginFailures.add(1);
    console.error(`LOGIN FAILED [VU:${__VU} ITER:${__ITER}] email=${user.email} status=${res.status} body=${res.body}`);
  }

  sleep(0.2);
}
