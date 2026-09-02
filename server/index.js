import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { body, param, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import { EncryptJWT, jwtDecrypt } from 'jose';
import { createSecretKey, hkdfSync, randomUUID } from 'node:crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import db from './db.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;
// Bind host. Default 0.0.0.0 (all interfaces) for container/general use; set
// HOST=127.0.0.1 when a local reverse proxy / tunnel (nginx, cloudflared) is
// the only thing that should reach the app.
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

// ---------- CONFIG VALIDATION ----------
// Fail fast on missing or weak secrets instead of running insecure.
const JWT_SECRET = process.env.JWT_SECRET;
const CREW_PASSCODE = process.env.CREW_PASSCODE;
if (IS_PROD && (!JWT_SECRET || !CREW_PASSCODE)) {
  console.error('❌ JWT_SECRET and CREW_PASSCODE must be set in production');
  process.exit(1);
}
if (IS_PROD && JWT_SECRET && JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET must be at least 32 characters in production (openssl rand -hex 32)');
  process.exit(1);
}

// Use the *fallback* variables consistently everywhere (bug fix)
const jwtSecret = JWT_SECRET || 'smocha-dev-secret';
// Normalize to UPPERCASE at boot: the passcode comparison uppercases input,
// so the stored value must be normalized too (otherwise mixed/lowercase
// passcodes like a hex string never match). Passcode remains case-insensitive.
const crewPasscode = (CREW_PASSCODE || 'SMOCHA').toUpperCase();

const JWT_ISSUER = 'smocha';
const JWT_AUDIENCE = 'smocha-client';
const JWT_TTL = process.env.JWT_TTL || '24h';

// ---------- JWT ENCRYPTION (JWE) ----------
// The crew's tokens are fully ENCRYPTED (JWE, AES-256-GCM, 'dir' key
// management) — not just signed. The payload is opaque to anyone who reads
// the token, so no claims (id, username) can leak even if a token is
// exfiltrated. A 32-byte AES key is deterministically derived from
// JWT_SECRET via HKDF-SHA256, so any-length secrets work and the key stays
// stable across restarts. Algorithms are pinned on both encrypt and decrypt.
const JWE_SALT = Buffer.from('smocha-jwe-salt-v1');
const JWE_INFO = Buffer.from('smocha-jwe-key-v1');
const jweKey = createSecretKey(
  hkdfSync('sha256', Buffer.from(jwtSecret), JWE_SALT, JWE_INFO, 32)
);

// Encrypt (issue) a token — payload is AES-256-GCM encrypted, not just signed.
async function signToken(user) {
  return new EncryptJWT({
    id: user.id,
    username: user.username,
    tver: user.token_version ?? 0,
  })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(JWT_TTL)
    .setIssuedAt()
    .setJti(randomUUID())
    .encrypt(jweKey);
}

// Verify (decrypt) a token — strict alg/enc/issuer/audience pinning.
async function verifyToken(token) {
  const { payload } = await jwtDecrypt(token, jweKey, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    contentEncryptionAlgorithms: ['A256GCM'],
    keyManagementAlgorithms: ['dir'],
  });
  return payload;
}

// Admin usernames from env (comma-separated), plus the seeded dyllan account
const ADMIN_USERNAMES = (process.env.ADMIN_USERNAMES || 'dyllan')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// ---------- SEED DATA ----------
async function seedCrew() {
  // Production defaults to NOT seeding known-password demo accounts; an
  // explicit SEED_DEMO=true still opts in. Dev seeds by default.
  const raw = String(process.env.SEED_DEMO ?? '').toLowerCase();
  const explicit = raw !== '';
  const seed = explicit ? !['false', '0'].includes(raw) : !IS_PROD;
  if (!seed) return;
  const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (count > 0) return;

  const demo = [
    { username: 'dyllan', nickname: 'Dyllan', bio: 'plans everything, forgets his keys', online: true },
    { username: 'maya', nickname: 'Maya', bio: 'always down for a rooftop', online: true },
    { username: 'kofi', nickname: 'Kofi', bio: 'brings the speaker, always', online: true },
    { username: 'zuri', nickname: 'Zuri', bio: 'photographer of the crew', online: false },
    { username: 'leo', nickname: 'Leo', bio: 'budget king', online: false },
  ];

  for (const m of demo) {
    const hash = await bcrypt.hash('smocha123', 10);
    const lastSeen = m.online
      ? new Date().toISOString()
      : new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString();
    const isAdmin = ADMIN_USERNAMES.includes(m.username.toLowerCase()) ? 1 : 0;
    db.prepare(
      'INSERT INTO users (username, password_hash, nickname, bio, last_seen, is_admin) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(m.username, hash, m.nickname, m.bio, lastSeen, isAdmin);
  }
  console.log('☕ Seeded demo crew members');
}

// Ensure any env-listed admin usernames are flagged as admin (idempotent)
function ensureAdmins() {
  for (const username of ADMIN_USERNAMES) {
    db.prepare('UPDATE users SET is_admin = 1 WHERE lower(username) = ?').run(username);
  }
}

// Helper: compute online status from last_seen (within 5 min = online)
function isOnline(lastSeen) {
  if (!lastSeen) return false;
  const diff = Date.now() - new Date(lastSeen).getTime();
  return diff < 5 * 60 * 1000;
}

// ---------- IMAGE FILE GUARD ----------
// Validate actual file signatures (magic bytes), not just the mimetype claim.
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function detectImageType(filepath) {
  const fd = fs.openSync(filepath, 'r');
  const buf = Buffer.alloc(16);
  try {
    fs.readSync(fd, buf, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(PNG_SIG)) return 'png';
  if (buf.subarray(0, 4).toString('ascii') === 'GIF8') return 'gif';
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return 'webp';
  return null;
}

// Delete uploaded files referenced by DB URLs (path-traversal safe: only /uploads/)
function deleteFilesFromDbUrls(urls) {
  for (const url of urls || []) {
    if (!url || !url.startsWith('/uploads/')) continue;
    const filepath = path.join(__dirname, url);
    try {
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    } catch {
      // ignore — orphaned files are non-fatal
    }
  }
}

// ---------- CORS ----------
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// ---------- TRUSTED PROXY ----------
// Number of reverse-proxy hops to trust so `req.ip` resolves the *real*
// client IP (which rate limiting keys on). 0 = direct internet, no proxy.
// Validated at boot — a wrong value silently breaks per-IP limiting, so we
// refuse to start on invalid input rather than guess.
const TRUST_PROXY = (process.env.TRUST_PROXY ?? (IS_PROD ? '1' : '0')).toString().toLowerCase();
const TRUST_PROXY_HOPS = TRUST_PROXY === 'false' ? 0 : Number.parseInt(TRUST_PROXY, 10);
if (!Number.isInteger(TRUST_PROXY_HOPS) || TRUST_PROXY_HOPS < 0 || TRUST_PROXY_HOPS > 10) {
  console.error(`❌ TRUST_PROXY must be an integer 0–10 (got "${TRUST_PROXY}"). Set it to how many proxy hops sit in front of this server.`);
  process.exit(1);
}
app.set('trust proxy', TRUST_PROXY_HOPS);

// Resolve the real client IP for rate-limit buckets and logs. Normalizes
// IPv6-mapped IPv4 (::ffff:1.2.3.4 → 1.2.3.4) so buckets don't split.
function clientIpKey(req) {
  let ip = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
}

// express-rate-limit requires custom IP-based key generators to be wrapped in
// ipKeyGenerator() — it collapses IPv6 /56 subnets so v6 users can't bypass
// limits by rotating the low 80 bits of their address.
const ipKey = (req) => ipKeyGenerator(clientIpKey(req));

app.use(helmet({
  // Only enforce a strict CSP in production — dev needs Vite's inline styles/HMR
  ...(NODE_ENV === 'production'
    ? {
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            connectSrc: ["'self'"],
            scriptSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'none'"],
          },
        },
      }
    : { contentSecurityPolicy: false }),
  crossOriginEmbedderPolicy: false,
}));

app.use((req, res, next) => {
  const corsMw = cors({
    origin(origin, cb) {
      // Non-browser clients (curl, mobile) send no Origin header — allow.
      if (!origin) return cb(null, true);
      // Explicitly whitelisted origins (cross-origin dev, separate API host).
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      // Same-origin always allowed — the app is served from the same host it
      // calls (/api), including behind Cloudflare Tunnel / a custom domain.
      try {
        if (new URL(origin).host === req.headers.host) return cb(null, true);
      } catch {
        /* malformed origin → reject below */
      }
      cb(new Error('CORS: origin not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  corsMw(req, res, next);
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ---------- REQUEST LOGGING ----------
// Tiny structured JSON logger (one line per request). No external dependency.
// LOG_LEVEL: dev|info|warn|silent — dev/info log everything, warn logs non-2xx,
// silent disables. Never logs bodies, tokens, or query strings.
const LOG_LEVEL = (process.env.LOG_LEVEL || (IS_PROD ? 'info' : 'dev')).toLowerCase();
function shouldLog(status) {
  if (LOG_LEVEL === 'silent') return false;
  if (LOG_LEVEL === 'warn' || LOG_LEVEL === 'error') return status >= 400;
  return true; // dev | info | anything else
}
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    if (!shouldLog(res.statusCode)) return;
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(JSON.stringify({
      t: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms: Math.round(ms),
      ip: clientIpKey(req),
      user: req.user ? req.user.id : null,
    }));
  });
  next();
});

// Serve uploaded images (avatars + hangout photos)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---------- RATE LIMITING ----------
// Every limiter keys on the *real* client IP (clientIpKey), so users behind
// a reverse proxy get their own buckets instead of all sharing one. Limits
// are env-tunable (RATE_* vars) for deploy-time tuning without code changes.
function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const RATE = {
  globalWindowMs: envInt('RATE_GLOBAL_WINDOW_MS', 15 * 60 * 1000),
  globalMax: envInt('RATE_GLOBAL_MAX', 200),
  authWindowMs: envInt('RATE_AUTH_WINDOW_MS', 15 * 60 * 1000),
  authMax: envInt('RATE_AUTH_MAX', 15),
  userWindowMs: envInt('RATE_USER_WINDOW_MS', 15 * 60 * 1000),
  userMax: envInt('RATE_USER_MAX', 300),
  uploadWindowMs: envInt('RATE_UPLOAD_WINDOW_MS', 15 * 60 * 1000),
  uploadMax: envInt('RATE_UPLOAD_MAX', 30),
  refreshMax: envInt('RATE_REFRESH_MAX', 5),
  importMax: envInt('RATE_IMPORT_MAX', 10),
};

// Global limiter — applies to /api routes only. Static assets (uploads,
// client bundle, event images) are exempt: otherwise a feed full of image
// cards would exhaust the API budget and lock users out.
const limiter = rateLimit({
  windowMs: RATE.globalWindowMs, // 15 min
  max: RATE.globalMax, // per IP
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKey,
  skip: (req) => !req.path.startsWith('/api') || req.path.startsWith('/uploads'),
});
app.use(limiter);

// Stricter limiter for auth routes (brute-force protection)
const authLimiter = rateLimit({
  windowMs: RATE.authWindowMs,
  max: RATE.authMax,
  message: { error: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKey,
});

// Strict limiters for endpoints that trigger external network scrapes or
// disk writes — these are the expensive operations worth protecting.
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: RATE.refreshMax,
  message: { error: 'Too many refresh attempts, slow down' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKey,
});

const importLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: RATE.importMax,
  message: { error: 'Too many imports, slow down' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKey,
});

const uploadLimiter = rateLimit({
  windowMs: RATE.uploadWindowMs,
  max: RATE.uploadMax,
  message: { error: 'Too many uploads, slow down' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKey,
});

// Ensure uploads dirs exist
const uploadsDir = path.join(__dirname, 'uploads');
const avatarsDir = path.join(uploadsDir, 'avatars');
const photosDir = path.join(uploadsDir, 'photos');
[uploadsDir, avatarsDir, photosDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ---------- MULTER (UPLOADS) ----------
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = req.path.includes('avatar') ? avatarsDir : photosDir;
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ALLOWED_EXT.includes(ext) ? ext : '.jpg'}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype.startsWith('image/') && ALLOWED_EXT.includes(ext)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// Presence throttling: update last_seen max once per 60 seconds per user
const lastSeenUpdate = new Map();

// Per-user rate limiting for authenticated routes
const userRateBuckets = new Map();
function enforceUserRateLimit(req, res, next) {
  const now = Date.now();
  const key = `u${req.user.id}`;
  const windowMs = RATE.userWindowMs;
  const max = RATE.userMax;
  const bucket = userRateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    userRateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return res.status(429).json({ error: 'Too many requests, slow down' });
  }
  next();
}

// Periodically clear stale presence + rate-limit buckets
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of lastSeenUpdate) if (now - v > 10 * 60 * 1000) lastSeenUpdate.delete(k);
  for (const [k, v] of userRateBuckets) if (now >= v.resetAt) userRateBuckets.delete(k);
}, 10 * 60 * 1000).unref();

// ---------- AUTH MIDDLEWARE ----------
async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    // Decrypt + verify the JWE (alg/enc/issuer/audience pinned).
    const payload = await verifyToken(header.split(' ')[1]);

    // Reject tokens issued before the user's current token_version — lets an
    // admin (or a "log out everywhere") bump it to revoke all existing tokens.
    const row = db.prepare('SELECT token_version FROM users WHERE id = ?').get(payload.id);
    if (!row || row.token_version !== (payload.tver ?? 0)) {
      return res.status(401).json({ error: 'Session revoked — please log in again' });
    }

    req.user = { id: payload.id, username: payload.username };

    // Throttled last_seen update (presence tracking)
    const now = Date.now();
    const lastUpdate = lastSeenUpdate.get(req.user.id) || 0;
    if (now - lastUpdate > 60 * 1000) {
      lastSeenUpdate.set(req.user.id, now);
      db.prepare('UPDATE users SET last_seen = ? WHERE id = ?')
        .run(new Date().toISOString(), req.user.id);
    }

    // Per-user rate limit
    return enforceUserRateLimit(req, res, next);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ---------- VALIDATION HELPERS ----------
function checkValid(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }
  next();
}

// Async route wrapper — forwards rejected promises to the global error handler
// (Express 4 doesn't do this automatically, so an unhandled rejection could
// otherwise crash the process).
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const validateId = param('id').isInt({ min: 1 }).withMessage('Invalid id');

const signupValidators = [
  body('passcode').trim().isLength({ min: 1, max: 100 }).withMessage('Passcode is required'),
  body('username')
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage('Username must be 3–20 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('password').isLength({ min: 8, max: 100 }).withMessage('Password must be at least 8 characters'),
  body('nickname').trim().isLength({ min: 1, max: 50 }).withMessage('Nickname must be 1–50 characters'),
  body('bio').optional({ nullable: true }).isLength({ max: 200 }).withMessage('Bio is too long'),
];

const loginValidators = [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

const updateMeValidators = [
  body('nickname').optional().trim().isLength({ min: 1, max: 50 }).withMessage('Nickname must be 1–50 characters'),
  body('bio').optional({ nullable: true }).isLength({ max: 200 }).withMessage('Bio is too long'),
];

const hangoutValidators = [
  body('title').trim().isLength({ min: 1, max: 80 }).withMessage('Title must be 1–80 characters'),
  body('location').trim().isLength({ min: 1, max: 100 }).withMessage('Location must be 1–100 characters'),
  body('date').isISO8601().withMessage('A valid date is required'),
  body('budget').optional().isFloat({ min: 0, max: 1_000_000 }).withMessage('Invalid budget'),
  body('description').optional({ nullable: true }).isLength({ max: 1000 }).withMessage('Description is too long'),
];

const rsvpValidators = [
  body('status').isIn(['down', 'maybe', 'no']).withMessage('Status must be down, maybe, or no'),
];

// ---------- AUTH ROUTES ----------

// Check passcode
app.post('/api/check-passcode', authLimiter, [
  body('passcode').trim().isLength({ min: 1, max: 100 }).withMessage('Passcode is required'),
], checkValid, (req, res) => {
  const { passcode } = req.body;
  if (passcode && passcode.trim().toUpperCase() === crewPasscode) {
    return res.json({ valid: true });
  }
  return res.status(401).json({ valid: false, error: 'Wrong passcode, try again' });
});

// Signup
app.post('/api/signup', authLimiter, signupValidators, checkValid, ah(async (req, res) => {
  const { passcode, username, password, nickname, bio } = req.body;
  if (!passcode || passcode.trim().toUpperCase() !== crewPasscode) {
    return res.status(401).json({ error: 'Invalid crew passcode' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const hash = await bcrypt.hash(password, 10);
  const result = db
    .prepare('INSERT INTO users (username, password_hash, nickname, bio) VALUES (?, ?, ?, ?)')
    .run(username, hash, nickname, bio || '');

  const userId = Number(result.lastInsertRowid);
  const user = db
    .prepare('SELECT id, username, nickname, avatar, bio, is_admin, token_version FROM users WHERE id = ?')
    .get(userId);
  const token = await signToken(user);
  res.status(201).json({ token, user });
}));

// Login
app.post('/api/login', authLimiter, loginValidators, checkValid, ah(async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = await signToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      bio: user.bio,
      is_admin: user.is_admin,
    },
  });
}));

// Get current user
app.get('/api/me', auth, (req, res) => {
  const user = db
    .prepare('SELECT id, username, nickname, avatar, bio, is_admin, created_at FROM users WHERE id = ?')
    .get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// Update profile
app.put('/api/me', auth, updateMeValidators, checkValid, (req, res) => {
  const { nickname, bio } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('UPDATE users SET nickname = ?, bio = ? WHERE id = ?').run(
    nickname || user.nickname,
    bio !== undefined ? bio : user.bio,
    req.user.id
  );
  const updated = db
    .prepare('SELECT id, username, nickname, avatar, bio, is_admin FROM users WHERE id = ?')
    .get(req.user.id);
  res.json(updated);
});

// Upload avatar
app.post('/api/me/avatar', auth, uploadLimiter, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  // Magic-byte check — reject anything that isn't a real image
  if (!detectImageType(req.file.path)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Invalid image file' });
  }

  const oldAvatar = db.prepare('SELECT avatar FROM users WHERE id = ?').get(req.user.id)?.avatar;
  const avatarUrl = `/uploads/avatars/${req.file.filename}`;
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatarUrl, req.user.id);

  // Delete the replaced avatar file from disk
  deleteFilesFromDbUrls([oldAvatar]);

  res.json({ avatar: avatarUrl });
});

// Heartbeat — keeps presence fresh while the app is open, and returns live crew status
app.post('/api/heartbeat', auth, (req, res) => {
  const now = Date.now();
  const lastUpdate = lastSeenUpdate.get(req.user.id) || 0;
  if (now - lastUpdate > 60 * 1000) {
    lastSeenUpdate.set(req.user.id, now);
    db.prepare('UPDATE users SET last_seen = ? WHERE id = ?')
      .run(new Date().toISOString(), req.user.id);
  }
  const crew = db
    .prepare('SELECT id, username, nickname, avatar, bio, last_seen FROM users ORDER BY nickname')
    .all()
    .map((u) => ({ ...u, online: isOnline(u.last_seen) }));
  res.json({ ok: true, crew });
});

// ---------- CREW ----------

// Get all crew members
app.get('/api/crew', auth, (req, res) => {
  const crew = db
    .prepare('SELECT id, username, nickname, avatar, bio, last_seen FROM users ORDER BY nickname')
    .all()
    .map((u) => ({ ...u, online: isOnline(u.last_seen) }));
  res.json(crew);
});

// Get single user profile
app.get('/api/users/:id', auth, validateId, checkValid, (req, res) => {
  const user = db
    .prepare('SELECT id, username, nickname, avatar, bio, last_seen, is_admin, created_at FROM users WHERE id = ?')
    .get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.online = isOnline(user.last_seen);

  const hangouts = db
    .prepare(`
      SELECT h.*, u.nickname as creator_nickname, u.avatar as creator_avatar
      FROM hangouts h
      JOIN users u ON h.created_by = u.id
      JOIN rsvps r ON r.hangout_id = h.id AND r.user_id = ?
      WHERE r.status IN ('down', 'maybe')
      ORDER BY h.date
    `)
    .all(req.params.id);

  res.json({ ...user, hangouts });
});

// ---------- HANGOUTS ----------

// List hangouts (upcoming + past)
app.get('/api/hangouts', auth, (req, res) => {
  const hangouts = db
    .prepare(`
      SELECT
        h.*,
        u.nickname as creator_nickname,
        u.avatar as creator_avatar,
        (SELECT COUNT(*) FROM rsvps r WHERE r.hangout_id = h.id AND r.status = 'down') as going_count,
        (SELECT COUNT(*) FROM rsvps r WHERE r.hangout_id = h.id AND r.status = 'maybe') as maybe_count,
        (SELECT COUNT(*) FROM hangout_photos p WHERE p.hangout_id = h.id) as photo_count
      FROM hangouts h
      JOIN users u ON h.created_by = u.id
      ORDER BY h.date
    `)
    .all();

  // Attach current user's RSVP status
  const withMyRsvp = hangouts.map((h) => {
    const myRsvp = db
      .prepare('SELECT status FROM rsvps WHERE hangout_id = ? AND user_id = ?')
      .get(h.id, req.user.id);
    return { ...h, my_status: myRsvp ? myRsvp.status : null };
  });

  res.json(withMyRsvp);
});

// Get single hangout
app.get('/api/hangouts/:id', auth, validateId, checkValid, (req, res) => {
  const hangout = db
    .prepare(`
      SELECT
        h.*,
        u.nickname as creator_nickname,
        u.avatar as creator_avatar,
        (SELECT COUNT(*) FROM rsvps r WHERE r.hangout_id = h.id AND r.status = 'down') as going_count,
        (SELECT COUNT(*) FROM rsvps r WHERE r.hangout_id = h.id AND r.status = 'maybe') as maybe_count
      FROM hangouts h
      JOIN users u ON h.created_by = u.id
      WHERE h.id = ?
    `)
    .get(req.params.id);

  if (!hangout) return res.status(404).json({ error: 'Hangout not found' });

  const rsvps = db
    .prepare(`
      SELECT r.status, u.id as user_id, u.nickname, u.avatar
      FROM rsvps r
      JOIN users u ON r.user_id = u.id
      WHERE r.hangout_id = ?
      ORDER BY r.created_at
    `)
    .all(req.params.id);

  const photos = db
    .prepare(`
      SELECT p.id, p.photo_url, p.created_at, u.nickname as uploaded_by_nickname, u.avatar as uploaded_by_avatar
      FROM hangout_photos p
      JOIN users u ON p.uploaded_by = u.id
      WHERE p.hangout_id = ?
      ORDER BY p.created_at DESC
    `)
    .all(req.params.id);

  const myRsvp = db
    .prepare('SELECT status FROM rsvps WHERE hangout_id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);

  res.json({ ...hangout, rsvps, photos, my_status: myRsvp ? myRsvp.status : null });
});

// Create hangout
app.post('/api/hangouts', auth, upload.single('cover'), hangoutValidators, checkValid, (req, res) => {
  const { title, description, location, date, budget } = req.body;

  // Magic-byte check on cover upload
  if (req.file && !detectImageType(req.file.path)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Invalid image file' });
  }

  const coverPhoto = req.file ? `/uploads/photos/${req.file.filename}` : null;
  const result = db
    .prepare('INSERT INTO hangouts (title, description, location, date, budget, cover_photo, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(title.trim(), description || '', location.trim(), date, parseFloat(budget) || 0, coverPhoto, req.user.id);

  const hangoutId = Number(result.lastInsertRowid);
  const hangout = db
    .prepare(`
      SELECT h.*, u.nickname as creator_nickname, u.avatar as creator_avatar
      FROM hangouts h
      JOIN users u ON h.created_by = u.id
      WHERE h.id = ?
    `)
    .get(hangoutId);

  res.status(201).json(hangout);
});

// RSVP to hangout
app.post('/api/hangouts/:id/rsvp', auth, validateId, rsvpValidators, checkValid, (req, res) => {
  const { status } = req.body;
  const hangout = db.prepare('SELECT id FROM hangouts WHERE id = ?').get(req.params.id);
  if (!hangout) return res.status(404).json({ error: 'Hangout not found' });

  db.prepare(`
    INSERT INTO rsvps (hangout_id, user_id, status) VALUES (?, ?, ?)
    ON CONFLICT(hangout_id, user_id) DO UPDATE SET status = excluded.status
  `).run(req.params.id, req.user.id, status);

  res.json({ success: true, status });
});

// Upload photo to hangout
app.post('/api/hangouts/:id/photos', auth, validateId, checkValid, uploadLimiter, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  // Magic-byte check
  if (!detectImageType(req.file.path)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Invalid image file' });
  }

  const hangout = db.prepare('SELECT id FROM hangouts WHERE id = ?').get(req.params.id);
  if (!hangout) {
    fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: 'Hangout not found' });
  }

  const photoUrl = `/uploads/photos/${req.file.filename}`;
  const result = db
    .prepare('INSERT INTO hangout_photos (hangout_id, photo_url, uploaded_by) VALUES (?, ?, ?)')
    .run(req.params.id, photoUrl, req.user.id);

  res.status(201).json({ id: Number(result.lastInsertRowid), photo_url: photoUrl });
});

// Delete hangout (creator only) — also removes cover + photos from disk
app.delete('/api/hangouts/:id', auth, validateId, checkValid, (req, res) => {
  const hangout = db.prepare('SELECT * FROM hangouts WHERE id = ?').get(req.params.id);
  if (!hangout) return res.status(404).json({ error: 'Hangout not found' });
  if (hangout.created_by !== req.user.id) {
    return res.status(403).json({ error: 'Only the creator can delete this hangout' });
  }

  const photoUrls = db
    .prepare('SELECT photo_url FROM hangout_photos WHERE hangout_id = ?')
    .all(req.params.id)
    .map((r) => r.photo_url);

  db.prepare('DELETE FROM hangouts WHERE id = ?').run(req.params.id); // cascades rsvps + photos

  deleteFilesFromDbUrls([hangout.cover_photo, ...photoUrls]);
  res.json({ success: true });
});

// ---------- ADMIN ----------

// Admin middleware
function admin(req, res, next) {
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.user.id);
  if (!user || !user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Admin: stats
app.get('/api/admin/stats', auth, admin, (req, res) => {
  const users = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const admins = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_admin = 1').get().c;
  const hangouts = db.prepare('SELECT COUNT(*) as c FROM hangouts').get().c;
  const photos = db.prepare('SELECT COUNT(*) as c FROM hangout_photos').get().c;
  const rsvps = db.prepare('SELECT COUNT(*) as c FROM rsvps').get().c;
  res.json({ users, admins, hangouts, photos, rsvps });
});

// Admin: list all users
app.get('/api/admin/users', auth, admin, (req, res) => {
  const users = db
    .prepare('SELECT id, username, nickname, avatar, bio, last_seen, is_admin, created_at FROM users ORDER BY created_at DESC')
    .all()
    .map((u) => ({ ...u, online: isOnline(u.last_seen) }));
  res.json(users);
});

// Admin: list all hangouts (with creator + going count)
app.get('/api/admin/hangouts', auth, admin, (req, res) => {
  const hangouts = db
    .prepare(`
      SELECT
        h.*,
        u.nickname as creator_nickname,
        u.username as creator_username,
        (SELECT COUNT(*) FROM rsvps r WHERE r.hangout_id = h.id AND r.status = 'down') as going_count,
        (SELECT COUNT(*) FROM rsvps r WHERE r.hangout_id = h.id AND r.status = 'maybe') as maybe_count
      FROM hangouts h
      JOIN users u ON h.created_by = u.id
      ORDER BY h.date DESC
    `)
    .all();
  res.json(hangouts);
});

// Admin: promote / demote a user to admin
app.post('/api/admin/users/:id/toggle-admin', auth, admin, validateId, checkValid, (req, res) => {
  const target = db.prepare('SELECT id, is_admin FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (Number(target.id) === Number(req.user.id)) {
    return res.status(400).json({ error: 'You can\'t change your own admin status' });
  }
  const newVal = target.is_admin ? 0 : 1;
  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(newVal, req.params.id);
  res.json({ success: true, is_admin: newVal });
});

// Admin: revoke every existing session for a user (force re-login) by bumping
// their token_version — all previously issued JWTs become invalid immediately.
app.post('/api/admin/users/:id/revoke', auth, admin, validateId, checkValid, (req, res) => {
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'All sessions revoked for that user' });
});

// Admin: delete non-admin user + cascade their data + remove files from disk
app.delete('/api/admin/users/:id', auth, admin, validateId, checkValid, (req, res) => {
  const target = db.prepare('SELECT id, is_admin, avatar FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.is_admin) return res.status(403).json({ error: 'Cannot delete an admin' });

  // Collect files to remove: their avatar, covers of hangouts they created,
  // and any photos on those hangouts or uploaded by them
  const covers = db
    .prepare('SELECT cover_photo FROM hangouts WHERE created_by = ?')
    .all(req.params.id)
    .map((r) => r.cover_photo);
  const photoUrls = db
    .prepare(`
      SELECT p.photo_url FROM hangout_photos p
      JOIN hangouts h ON p.hangout_id = h.id
      WHERE h.created_by = ? OR p.uploaded_by = ?
    `)
    .all(req.params.id, req.params.id)
    .map((r) => r.photo_url);

  db.prepare('DELETE FROM rsvps WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM hangout_photos WHERE uploaded_by = ?').run(req.params.id);
  db.prepare('DELETE FROM hangouts WHERE created_by = ?').run(req.params.id); // cascades
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);

  deleteFilesFromDbUrls([target.avatar, ...covers, ...photoUrls]);
  res.json({ success: true });
});

// Admin: delete any hangout (removes files too)
app.delete('/api/admin/hangouts/:id', auth, admin, validateId, checkValid, (req, res) => {
  const hangout = db.prepare('SELECT cover_photo FROM hangouts WHERE id = ?').get(req.params.id);
  if (!hangout) return res.status(404).json({ error: 'Hangout not found' });

  const photoUrls = db
    .prepare('SELECT photo_url FROM hangout_photos WHERE hangout_id = ?')
    .all(req.params.id)
    .map((r) => r.photo_url);

  db.prepare('DELETE FROM hangouts WHERE id = ?').run(req.params.id); // cascades rsvps + photos

  deleteFilesFromDbUrls([hangout.cover_photo, ...photoUrls]);
  res.json({ success: true });
});

// Admin: delete any photo
app.delete('/api/admin/photos/:id', auth, admin, validateId, checkValid, (req, res) => {
  const photo = db.prepare('SELECT photo_url FROM hangout_photos WHERE id = ?').get(req.params.id);
  if (photo) {
    deleteFilesFromDbUrls([photo.photo_url]);
    db.prepare('DELETE FROM hangout_photos WHERE id = ?').run(req.params.id);
  }
  res.json({ success: true });
});

// Admin: reset all demo data (wipe non-admin users + their content + files)
app.post('/api/admin/reset-demo', auth, admin, (req, res) => {
  // Collect all files before wiping
  const avatarUrls = db.prepare("SELECT avatar FROM users WHERE is_admin = 0").all().map((r) => r.avatar);
  const coverUrls = db.prepare('SELECT cover_photo FROM hangouts').all().map((r) => r.cover_photo);
  const photoUrls = db.prepare('SELECT photo_url FROM hangout_photos').all().map((r) => r.photo_url);

  db.prepare('DELETE FROM rsvps').run();
  db.prepare('DELETE FROM hangout_photos').run();
  db.prepare('DELETE FROM hangouts').run();
  db.prepare('DELETE FROM users WHERE is_admin = 0').run();

  deleteFilesFromDbUrls([...avatarUrls, ...coverUrls, ...photoUrls]);
  res.json({ success: true, message: 'All demo data wiped' });
});

// ---------- EVENTS (scraper feed) ----------

import { refreshEvents, getLastRefresh, seedEventSources, CATEGORIES } from './scrapers/index.js';
import { upsertEvent } from './scrapers/util.js';
import { importInstagramPost } from './scrapers/instagram.js';
import { importTikTokVideo } from './scrapers/tiktok.js';
import { importTweet } from './scrapers/x.js';

// Public (crew) feed — upcoming events, newest first, optional category filter.
app.get('/api/events', auth, (req, res) => {
  const category = req.query.category;
  let rows;
  const whereFresh = `(ends_at IS NULL OR ends_at >= datetime('now','-1 day'))`;
  if (category && CATEGORIES.includes(String(category))) {
    rows = db
      .prepare(`SELECT * FROM scraped_events WHERE hidden = 0 AND ${whereFresh} AND category = ? ORDER BY COALESCE(starts_at, created_at) DESC LIMIT 100`)
      .all(String(category));
  } else {
    rows = db
      .prepare(`SELECT * FROM scraped_events WHERE hidden = 0 AND ${whereFresh} ORDER BY COALESCE(starts_at, created_at) DESC LIMIT 100`)
      .all();
  }
  res.json({ events: rows, fetched_at: getLastRefresh(), categories: CATEGORIES });
});

// Manual refresh (admin) — triggers a live scrape across all active sources.
app.post('/api/events/refresh', auth, admin, refreshLimiter, ah(async (req, res) => {
  const summary = await refreshEvents();
  res.json(summary);
}));

// Admin: list all event sources (including paused/unreachable).
app.get('/api/admin/event-sources', auth, admin, (req, res) => {
  const sources = db.prepare('SELECT * FROM event_sources ORDER BY platform, handle').all();
  res.json(sources);
});

// Admin: add an event source.
app.post('/api/admin/event-sources', auth, admin, (req, res) => {
  const { platform, handle, label, category_bias } = req.body || {};
  if (!['eventbrite', 'instagram', 'tiktok', 'x'].includes(platform)) {
    return res.status(400).json({ error: 'platform must be eventbrite, instagram, tiktok or x' });
  }
  if (!handle || typeof handle !== 'string' || handle.trim().length < 2) {
    return res.status(400).json({ error: 'handle is required' });
  }
  const bias = CATEGORIES.includes(category_bias) ? category_bias : 'community';
  const dup = db.prepare('SELECT id FROM event_sources WHERE platform = ? AND handle = ?').get(platform, handle.trim());
  if (dup) return res.status(409).json({ error: 'That source already exists' });
  const result = db
    .prepare('INSERT INTO event_sources (platform, handle, label, category_bias) VALUES (?, ?, ?, ?)')
    .run(platform, handle.trim().replace(/^@/, ''), label || '', bias);
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

// Admin: update an event source (active flag, label, category bias).
app.put('/api/admin/event-sources/:id', auth, admin, validateId, checkValid, (req, res) => {
  const src = db.prepare('SELECT * FROM event_sources WHERE id = ?').get(req.params.id);
  if (!src) return res.status(404).json({ error: 'Source not found' });
  const { active, label, category_bias } = req.body || {};
  db.prepare(`
    UPDATE event_sources SET
      active = COALESCE(?, active),
      label = COALESCE(?, label),
      category_bias = COALESCE(?, category_bias),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    typeof active === 'boolean' ? (active ? 1 : 0) : null,
    typeof label === 'string' ? label : null,
    CATEGORIES.includes(category_bias) ? category_bias : null,
    req.params.id
  );
  res.json({ success: true });
});

// Admin: delete an event source.
app.delete('/api/admin/event-sources/:id', auth, admin, validateId, checkValid, (req, res) => {
  const src = db.prepare('SELECT id FROM event_sources WHERE id = ?').get(req.params.id);
  if (!src) return res.status(404).json({ error: 'Source not found' });
  db.prepare('DELETE FROM event_sources WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Admin: hide/show a scraped event in the feed.
app.put('/api/admin/events/:id/hidden', auth, admin, validateId, checkValid, (req, res) => {
  const { hidden } = req.body || {};
  if (typeof hidden !== 'boolean') return res.status(400).json({ error: 'hidden must be a boolean' });
  const ev = db.prepare('SELECT id FROM scraped_events WHERE id = ?').get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  db.prepare("UPDATE scraped_events SET hidden = ?, updated_at = datetime('now') WHERE id = ?")
    .run(hidden ? 1 : 0, req.params.id);
  res.json({ success: true });
});

// Admin: import a single post URL (Instagram / TikTok / X) into the feed.
app.post('/api/admin/events/import', auth, admin, importLimiter, ah(async (req, res) => {
  const { url } = req.body || {};
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url is required' });
  try {
    let ev = null;
    if (/instagram\.com\/(p|reel)\//.test(url)) ev = await importInstagramPost(url);
    else if (/tiktok\.com\/@[^/]+\/video\//.test(url)) ev = await importTikTokVideo(url);
    else if (/(twitter\.com|x\.com)\/[^/]+\/status\//.test(url)) ev = await importTweet(url);
    else return res.status(400).json({ error: 'Unsupported URL — paste an Instagram post, TikTok video or tweet link' });
    if (!ev) return res.status(502).json({ error: 'Could not fetch that post' });
    const r = upsertEvent(ev);
    const row = db.prepare('SELECT * FROM scraped_events WHERE remote_url = ?').get(ev.remote_url);
    res.status(r === 'added' ? 201 : 200).json({ result: r, event: row });
  } catch (err) {
    res.status(502).json({ error: `Import failed: ${err.message}` });
  }
}));

// ---------- HEALTH & FALLBACKS ----------

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    crew: 'SMOCHA',
    env: NODE_ENV,
    uptime: Math.round(process.uptime()),
    now: new Date().toISOString(),
  });
});

// ---------- PRODUCTION: serve the built client from this process ----------
// Single-service deployment: Express serves the Vite build + SPA fallback,
// so a free-tier host only needs to run ONE node process.
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  // Hashed assets — cache aggressively
  app.use('/assets', express.static(path.join(clientDist, 'assets'), {
    maxAge: '30d',
    immutable: true,
  }));
  // Everything else from the dist root (favicon, etc.)
  app.use(express.static(clientDist, { maxAge: '1h' }));

  // SPA fallback: any non-API GET renders the client router
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  console.log('📦 Serving built client from client/dist');
}

// 404 handler — JSON, not HTML
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler — never leak stack traces in production
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large — max 10MB' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err?.message === 'CORS: origin not allowed') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  console.error('⚠️', err);
  const status = err.status || 500;
  res.status(status).json({
    error: NODE_ENV === 'production' ? 'Something went wrong' : err.message,
  });
});

// ---------- START ----------
let schedulerTimer = null;
let serverInstance = null;

async function start() {
  await seedCrew();
  ensureAdmins();

  // Events scraper: seed sources + schedule background refresh.
  seedEventSources();
  if (process.env.EVENTS_ENABLED !== 'false') {
    const hours = parseFloat(process.env.EVENTS_REFRESH_HOURS) || 6;
    const interval = Math.max(1, hours) * 60 * 60 * 1000;
    // Initial refresh shortly after boot, then on an interval (spread over the day).
    setTimeout(() => {
      refreshEvents().catch((e) => console.error('[events] refresh failed:', e.message));
    }, 10 * 1000);
    schedulerTimer = setInterval(() => {
      refreshEvents().catch((e) => console.error('[events] refresh failed:', e.message));
    }, interval);
    console.log(`📅 Events scraper enabled — refreshing every ${Math.max(1, hours)}h`);
  }

  serverInstance = app.listen(PORT, HOST, () => {
    console.log(`☕ SMOCHA server running on http://${HOST}:${PORT} (${NODE_ENV})`);
  });
  serverInstance.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use — pick a free PORT`);
    } else {
      console.error('❌ Server error:', err);
    }
    process.exit(1);
  });
}

// Graceful shutdown — platforms send SIGTERM on redeploys/stops.
// Finish in-flight responses, stop the scheduler, close SQLite cleanly
// (WAL checkpoint) so the DB is never left half-written.
function shutdown(signal, exitCode = 0) {
  console.log(`\n${signal} received — shutting down…`);
  if (schedulerTimer) clearInterval(schedulerTimer);
  const finish = () => {
    try {
      db.close();
      console.log('👋 DB closed — bye');
    } catch (err) {
      console.error('DB close error:', err.message);
    }
    process.exit(exitCode);
  };
  if (!serverInstance) return finish(); // never started listening
  const force = setTimeout(() => process.exit(exitCode || 1), 8000); // never hang the host
  serverInstance.close(() => {
    clearTimeout(force);
    finish();
  });
}

// ---------- PROCESS GUARDS ----------
// Never let an unhandled rejection or exception take the process down
// silently mid-flight. Log it, then shut down cleanly if it's fatal.
process.on('unhandledRejection', (reason) => {
  console.error('❌ unhandledRejection:', reason instanceof Error ? reason.stack || reason.message : reason);
});
process.on('uncaughtException', (err) => {
  console.error('❌ uncaughtException:', err.stack || err.message);
  shutdown('uncaughtException', 1);
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});