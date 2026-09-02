// Shared helpers for the events scraper engine.
// Classifies raw posts into outing categories, normalizes them into the feed shape,
// downloads images locally (CSP-safe,and paces requests so we don't hammer sources.

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVENTS_IMG_DIR = path.join(__dirname, '..', 'uploads', 'events');

export const CATEGORIES = [
  'hiking',
  'nightlife',
  'arts',
  'food',
  'fitness',
  'third-space',
  'community',
];

export const CATEGORY_LABELS = {
  hiking: 'Hiking',
  nightlife: 'Nightlife',
  arts: 'Arts',
  food: 'Food & Drink',
  fitness: 'Fitness',
  'third-space': 'Third Spaces',
  community: 'Community',
};

// Keyword → category matcher. Order matters (more specific first.

export function classifyPost(text, source, categoryBias) {
  const t = String(text || '').toLowerCase();
  const STOP = [
    'giveaway', 'give away', 'followers', 'dm to', 'link in bio', 'birthday',
    'congrats', 'memes', 'repost', 'promo', 'sponsor', 'advert',
    'order now', 'shop now', 'sale', 'discount code', 'news',
    'update', 'announcement', 'results', 'winner', 'winners',
  ];
  for (const s of STOP) if (t.includes(s)) return null;
  // Word-boundary match — avoids false hits like "partnership" containing "art".
  const RULES = [
    { cat: 'hiking', words: ['hike', 'hiking', 'trek', 'trekking', 'trail', 'waterfall', 'falls', 'mountain', 'forest', 'cave', 'climb', 'summit', 'picnic', 'karura', 'longonot', 'ngong', 'escapade', 'hiker', 'camping', 'camp', 'outdoor', 'nature walk', 'nature'] },
    { cat: 'fitness', words: ['run club', 'running', 'fitness', 'workout', 'marathon', 'fun run', '5k', '10k', 'yoga', 'morning run', 'jog'] },
    { cat: 'nightlife', words: ['karaoke', 'open mic', 'comedy', 'live band', 'concert', 'dj set', 'night out', 'rooftop', 'afterparty', 'after party', 'party', 'club night', 'tasting', 'brewery', 'bar hop', 'wine', 'paint and sip', 'paint-and-sip', 'gig'] },
    { cat: 'arts', words: ['gallery', 'art', 'pottery', 'craft', 'ceramic', 'theatre', 'theater', 'exhibition', 'paint', 'museum', 'workshop', 'studio'] },
    { cat: 'food', words: ['café', 'cafe', 'restaurant', 'food', 'brunch', 'dinner', 'lunch', 'street kitchen', 'farmers market', 'coffee', 'bakery', 'bistro', 'dining', 'happy hour', 'burger', 'sushi', 'pizza', 'date spot', 'cheap eats', 'eats'] },
    { cat: 'third-space', words: ['study', 'workspace', 'co-work', 'coworking', 'third space', 'solo date', 'library', 'reading', 'chill spot', 'hangout', 'aesthetic', 'vibes', 'garden', 'park', 'picnic spot', 'quiet spot', 'relax'] },
  ];
  for (const rule of RULES) {
    if (rule.words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(t))) return rule.cat;
  }
  if (categoryBias && CATEGORIES.includes(categoryBias)) return categoryBias;
  return null;
}
// Clean one-line title from a caption (up to 90 chars.
export function titleFromCaption(caption, fallback = 'Adventure in Nairobi') {
  const clean = String(caption || '' ).replace(/\s+/g, ' ' ).trim();
  if (!clean) return fallback;
  const firstLine = clean.split(/[.\n?!]/)[0].trim();
  const cut = firstLine.length > 90 ? firstLine.slice(0, 87) + '…' : firstLine;
  return cut || fallback;
}

// Location hints from a caption. "at X" / "in X" / "near X".
export function locationFromCaption(caption) {
  const t = String(caption || '');
  const atMatch = t.match(/\b(?:at|in|near)\s+([A-Z][A-Za-z0-9&'.\-\s]{2,60})\b/);
  if (atMatch) return atMatch[1].trim();
  return '';
}

export function looksLikePostUrl(urlThat) {
  return /instagram\.com\/(p|reel)\/|tiktok\.com\/@[^/]+\/video\/|(twitter\.com|x\.com)\/[^/]+\/status\//i.test(String(urlThat || ''));
}

// Sleep to pace requests between social-platform hits.
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function jitterSleep(baseMs = 9000) {
  const jitter = Math.floor(Math.random() * (6000 - 2500 + 1)) + 2500;
  return sleep(baseMs + jitter);
}

// HTML entity/whitespace cleanup for scraped text.
export function cleanHtml(htmlThat = '') {
  return String(htmlThat || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
// ---------- LOCAL IMAGE PIPELINE (CSP-safe) ----------

export function ensureEventsImageDir() {
  if (!fs.existsSync(EVENTS_IMG_DIR)) fs.mkdirSync(EVENTS_IMG_DIR, { recursive: true });
  return EVENTS_IMG_DIR;
}

// Mirror of the magic-byte guard in index.js. Accepts jpeg/png/gif/webp.
export function detectImageType(filepath) {
  try {
    const fd = fs.openSync(filepath, 'r');
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
    if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x00 && buf[3] === 0x1c) return 'webp';
    return null;
  } catch {
    return null;
  }
}

// Download a remote image to /uploads/events/, validate magic bytes, return the local URL path.

export async function downloadImage(remoteUrlThat) {
  if (!remoteUrlThat) return null;
  ensureEventsImageDir();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(remoteUrlThat, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SMOCHA-events/1.0)' },
    });
    clearTimeout(timer);
    if (!res.ok || !res.headers.get('content-type')?.includes('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 4 || buf.length > 8 * 1024 * 1024) return null;
    const tmp = path.join(EVENTS_IMG_DIR, `tmp-${Date.now()}-${Math.round(Math.random() * 1e9)}`);
    fs.writeFileSync(tmp, buf);
    const type = detectImageType(tmp);
    if (!type) {
      fs.unlinkSync(tmp);
      return null;
    }
    const finalName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${type}`;
    const finalPath = path.join(EVENTS_IMG_DIR, finalName);
    fs.renameSync(tmp, finalPath);
    return `/uploads/events/${finalName}`;
  } catch {
    return null;
  }
}
// ---------- DB UPSERT + PRUNE ----------

export function upsertEvent(ev) {
  if (!ev || !ev.remote_url || !ev.title) return null;
  const existing = db.prepare('SELECT id FROM scraped_events WHERE remote_url = ?').get(ev.remote_url);
  if (existing) {
    // Keep the first (usually more accurate) classification; only fill defaults.
    const row = db.prepare('SELECT category FROM scraped_events WHERE id = ?').get(existing.id);
    const category = row.category && row.category !== 'community' ? row.category : (ev.category || 'community');
    db.prepare(`
      UPDATE scraped_events SET
        title = ?, description = ?, location = ?, city = ?, category = ?,
        starts_at = COALESCE(?, starts_at), ends_at = ?, price = ?, organizer = ?, external_account = ?,
        image_path = COALESCE(?, image_path), link = ?, hidden = 0, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      ev.title,
      ev.description || '',
      ev.location || '',
      ev.city || 'Nairobi',
      category,
      ev.starts_at || null,
      ev.ends_at || null,
      ev.price ?? null,
      ev.organizer || null,
      ev.external_account || null,
      ev.image_path || null,
      ev.link || ev.remote_url,
      existing.id
    );
    return 'updated';
  }
  db.prepare(`
    INSERT INTO scraped_events
      (source, remote_url, external_account, title, description, location, city,
       category, starts_at, ends_at, price, organizer, image_path, link)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ev.source,
    ev.remote_url,
    ev.external_account || null,
    ev.title,
    ev.description || '',
    ev.location || '',
    ev.city || 'Nairobi',
    ev.category || 'community',
    ev.starts_at || null,
    ev.ends_at || null,
    ev.price ?? null,
    ev.organizer || null,
    ev.image_path || null,
    ev.link || ev.remote_url
  );
  return 'added';
}

// Delete events that ended more than 7 days ago (and their downloaded images).
export function pruneOldEvents() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const old = db
    .prepare("SELECT id, image_path FROM scraped_events WHERE ends_at IS NOT NULL AND ends_at < ?")
    .all(cutoff);
  for (const row of old) {
    if (row.image_path && row.image_path.startsWith('/uploads/events/')) {
      const full = path.join(__dirname, '..', row.image_path);
      try {
        if (fs.existsSync(full)) fs.unlinkSync(full);
      } catch {
        // best effort
      }
    }
    db.prepare('DELETE FROM scraped_events WHERE id = ?').run(row.id);
  }
  return old.length;
}

// Record the outcome of a source scrape for the admin panel.
export function markSourceScrape(sourceId, ok, statusText) {
  const src = db.prepare('SELECT consecutive_failures FROM event_sources WHERE id = ?').get(sourceId);
  if (!src) return;
  const failures = ok ? 0 : (src.consecutive_failures || 0) + 1;
  db.prepare(`
    UPDATE event_sources
    SET last_scraped_at = datetime('now'), last_status = ?, consecutive_failures = ?,
        status = CASE WHEN ? = 1 THEN 'active'
                      WHEN ? >= 5 THEN 'unreachable'
                      ELSE status END
    WHERE id = ?
  `).run(statusText || '', failures, ok ? 1 : 0, failures, sourceId);
}
