// End-to-end security tests for the SMOCHA server.
//
// Spawns the real server (production mode) on an ephemeral port against a
// throwaway SQLite DB, then exercises JWT encryption (JWE), rate limiting,
// auth revocation, and upload validation over HTTP.
//
// Run from server/:  npm test

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.join(__dirname, '..', 'index.js');

const JWT_SECRET = `test-secret-${randomUUID()}${randomUUID()}`; // long + random
const CREW_PASSCODE = 'TESTPASS';

let proc = null;
let base = '';
let dbPath = '';
let tmpDir = '';
let sqlite = null;
const tokens = {};

async function waitForServer(timeoutMs = 20000) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server did not become healthy: ${lastErr?.message}`);
}

async function createUser(username, password = 'password123') {
  const res = await fetch(`${base}/api/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      passcode: CREW_PASSCODE,
      username,
      password,
      nickname: username,
    }),
  });
  const data = await res.json();
  return { res, data };
}

function userId(username) {
  return sqlite.prepare('SELECT id FROM users WHERE username = ?').get(username)?.id;
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smocha-test-'));
  dbPath = path.join(tmpDir, 'test.db');
  const port = 20000 + Math.floor(Math.random() * 30000);
  base = `http://127.0.0.1:${port}`;

  proc = spawn(process.execPath, [SERVER_ENTRY], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      JWT_SECRET,
      CREW_PASSCODE,
      DB_PATH: dbPath,
      SEED_DEMO: 'false',
      EVENTS_ENABLED: 'false',
      TRUST_PROXY: '0',
      LOG_LEVEL: 'silent',
      RATE_AUTH_MAX: '200',
      RATE_GLOBAL_MAX: '2000',
      RATE_USER_MAX: '5',
      RATE_UPLOAD_MAX: '30',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  proc.stderr.on('data', (d) => process.stderr.write(`[server:err] ${d}`));

  await waitForServer();
  sqlite = new DatabaseSync(dbPath);
});

after(async () => {
  try {
    sqlite?.close();
  } catch {
    /* ignore */
  }
  if (proc && proc.exitCode === null) {
    proc.kill('SIGTERM');
    await new Promise((resolve) => {
      const t = setTimeout(() => {
        proc.kill('SIGKILL');
        resolve();
      }, 3000);
      proc.once('exit', () => {
        clearTimeout(t);
        resolve();
      });
    });
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------- Tests ----------

test('health check reports ok', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
});

test('signup rejects a wrong crew passcode', async () => {
  const res = await fetch(`${base}/api/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      passcode: 'NOPE',
      username: 'nope1',
      password: 'password123',
      nickname: 'Nope',
    }),
  });
  assert.equal(res.status, 401);
});

test('signup rejects a wrong crew passcode', async () => {
  const res = await fetch(`${base}/api/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      passcode: 'NOPE',
      username: 'nope1',
      password: 'password123',
      nickname: 'Nope',
    }),
  });
  assert.equal(res.status, 401);
});

test('passcode is case-insensitive (mixed/lowercase entry works)', async () => {
  // CREW_PASSCODE is 'TESTPASS'; enter it lowercase to guard against the
  // regression where lowercase hex passcodes never matched.
  const res = await fetch(`${base}/api/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      passcode: 'testpass',
      username: 'casey',
      password: 'password123',
      nickname: 'Casey',
    }),
  });
  assert.equal(res.status, 201, 'lowercase passcode entry must succeed');
});
test('signup issues a fully encrypted (JWE) token', async () => {
  const { res, data } = await createUser('alice');
  assert.equal(res.status, 201);
  assert.ok(data.token && typeof data.token === 'string');

  // JWE compact serialization has 5 dot-separated segments.
  const parts = data.token.split('.');
  assert.equal(parts.length, 5, 'JWE compact must have 5 segments');

  // Header reveals only algorithm info — no payload.
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  assert.equal(header.alg, 'dir');
  assert.equal(header.enc, 'A256GCM');

  // A signed (JWS) token would leak the username in plaintext. It must NOT
  // appear anywhere in an encrypted token.
  assert.ok(!data.token.includes('alice'), 'username must not leak in the token');
  tokens.alice = data.token;
});

test('login issues a token that authenticates /api/me', async () => {
  const res = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'password123' }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.token);

  const me = await fetch(`${base}/api/me`, {
    headers: { Authorization: `Bearer ${data.token}` },
  });
  assert.equal(me.status, 200);
  const meBody = await me.json();
  assert.equal(meBody.username, 'alice');
});

test('protected routes reject missing and tampered tokens', async () => {
  const noAuth = await fetch(`${base}/api/crew`);
  assert.equal(noAuth.status, 401);

  const tampered = `${tokens.alice.slice(0, -3)}abc`;
  const bad = await fetch(`${base}/api/crew`, {
    headers: { Authorization: `Bearer ${tampered}` },
  });
  assert.equal(bad.status, 401);
});

test('revoking a token_version invalidates existing JWTs', async () => {
  // Promote alice to admin directly in the DB (ensureAdmins only runs at boot).
  sqlite.prepare('UPDATE users SET is_admin = 1 WHERE username = ?').run('alice');
  const id = userId('alice');
  assert.ok(id, 'alice should exist');

  const revoke = await fetch(`${base}/api/admin/users/${id}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.alice}` },
  });
  assert.equal(revoke.status, 200);

  const afterRevoke = await fetch(`${base}/api/me`, {
    headers: { Authorization: `Bearer ${tokens.alice}` },
  });
  assert.equal(afterRevoke.status, 401, 'revoked token must be rejected');
});

test('per-user rate limiting returns 429', async () => {
  const { res, data } = await createUser('bob');
  assert.equal(res.status, 201);
  tokens.bob = data.token;

  const statuses = [];
  for (let i = 0; i < 6; i++) {
    const r = await fetch(`${base}/api/crew`, {
      headers: { Authorization: `Bearer ${tokens.bob}` },
    });
    statuses.push(r.status);
  }
  assert.ok(
    statuses.slice(0, 5).every((s) => s === 200),
    `first 5 requests should be 200, got ${statuses.join(',')}`
  );
  assert.equal(statuses[5], 429, `6th request should be 429, got ${statuses.join(',')}`);
});

test('invalid (fake) image upload is rejected by magic-byte check', async () => {
  await createUser('carol'); // fresh user, fresh rate bucket
  const login = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'carol', password: 'password123' }),
  });
  const loginData = await login.json();

  const fd = new FormData();
  fd.append('avatar', new Blob(['this is definitely not an image'], { type: 'image/png' }), 'fake.png');
  const uploadAuthed = await fetch(`${base}/api/me/avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${loginData.token}` },
    body: fd,
  });
  assert.equal(uploadAuthed.status, 400, 'fake image bytes must be rejected');
});