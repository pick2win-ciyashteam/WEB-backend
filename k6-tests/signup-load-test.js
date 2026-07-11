import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api/user/user-auth';
const RUN_ID   = __ENV.RUN_ID || `${Date.now()}`;
const TOTAL    = Number(__ENV.TOTAL || 100);
const VUS      = Number(__ENV.VUS || 20);

export const options = {
  scenarios: {
    signup_load: {
      executor: 'shared-iterations',
      vus: VUS,
      iterations: TOTAL,
      maxDuration: '5m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    signup_success_rate: ['rate>0.95'],
  },
};

const signupDuration    = new Trend('signup_duration', true);
const signupSuccessRate = new Rate('signup_success_rate');
const signupFailures    = new Counter('signup_failures');

export default function () {
  const uid = `${RUN_ID}_${__VU}_${__ITER}`;
  const mobile =
    '9' +
    String(RUN_ID).slice(-5) +
    String(__VU).padStart(2, '0') +
    String(__ITER).padStart(3, '0');

  const payload = JSON.stringify({
    fullname:      `K6 Test User ${uid}`,
    email:         `k6user_${uid}@p2wtest.com`,
    mobile,
    country:       'India',
    date_of_birth: '1995-05-15',
    password:      'Test@123',
  });

  const params = { headers: { 'Content-Type': 'application/json' } };
  const res = http.post(`${BASE_URL}/signup`, payload, params);

  signupDuration.add(res.timings.duration);

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'success true': (r) => {
      try { return JSON.parse(r.body).success === true; } catch (e) { return false; }
    },
  });

  signupSuccessRate.add(ok);
  if (!ok) {
    signupFailures.add(1);
    console.error(`FAILED [VU:${__VU} ITER:${__ITER}] status=${res.status} body=${res.body}`);
  }

  sleep(0.3);
}
