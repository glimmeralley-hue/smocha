// Events scraper orchestrator.
// Runs enabled adapters per platform, seeds the default source registry on first
// boot, paces social-platform hits, and prunes stale events afterwards.

import db from '../db.js';
import {
  CATEGORIES,
  pruneOldEvents,
} from './util.js';
import { scrapeEventbrite } from './eventbrite.js';
import { scrapeInstagramSource } from './instagram.js';
import { scrapeTikTokSource } from './tiktok.js';
import { scrapeXSource } from './x.js';

// Default source registry — seeded once; everything is admin-editable at runtime.
// Only handles confirmed/curated by the crew. category_bias steers classification.
const DEFAULT_SOURCES = [
  { platform: 'eventbrite', handle: 'kenya--nairobi', label: 'Eventbrite Nairobi', category_bias: 'community' },
  { platform: 'instagram', handle: 'diplomattrekkers', label: 'Diplomat Trekkers — trails, off-roading, camping', category_bias: 'hiking' },
  { platform: 'instagram', handle: 'watuwahike_ke', label: 'Watu wa Hike — budget group hikes', category_bias: 'hiking' },
  { platform: 'instagram', handle: 'mona_trails', label: 'Mona Trails — beginner trails & waterfalls', category_bias: 'hiking' },
  { platform: 'tiktok', handle: 'wambuitheexplorer', label: 'Wambui the Explorer — urban outdoor', category_bias: 'hiking' },
  { platform: 'tiktok', handle: 'foodcorenairobi', label: 'Food Core Nairobi — aesthetic cafés', category_bias: 'food' },
  { platform: 'tiktok', handle: 'sandramotho', label: 'Sandra Motho — food & travel with price breakdowns', category_bias: 'food' },
  { platform: 'tiktok', handle: 'rinah.muthoni', label: 'Rinah Muthoni — solo date & third spaces', category_bias: 'third-space' },
  { platform: 'tiktok', handle: 'belindasprivatestory', label: 'Belinda — under-KSh 1,000 weekend guides', category_bias: 'third-space' },
  { platform: 'tiktok', handle: 'iamnkirote', label: 'Nkirote — galleries, thrifting, creative hubs', category_bias: 'arts' },
];

export function seedEventSources() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM event_sources').get().c;
  if (count > 0) return;
  const insert = db.prepare(`
    INSERT INTO event_sources (platform, handle, label, category_bias) VALUES (?, ?, ?, ?)
  `);
  for (const s of DEFAULT_SOURCES) insert.run(s.platform, s.handle, s.label, s.category_bias);
  console.log(`[events] seeded ${DEFAULT_SOURCES.length} default sources`);
}

export function getActiveSources() {
  return db
    .prepare("SELECT * FROM event_sources WHERE active = 1 AND status != 'unreachable' ORDER BY platform, handle")
    .all();
}

let running = false;

export async function refreshEvents({ aggressive = false } = {}) {
  if (running) return { skipped: true, reason: 'refresh already running' };
  running = true;
  const started = Date.now();
  const summary = { added: 0, updated: 0, errors: [], sources: 0, pruned: 0 };
  try {
    seedEventSources();
    const sources = getActiveSources();
    summary.sources = sources.length;

    // Eventbrite is one consolidated sweep (not per-source) — run it if any EB source is active.
    if (sources.some((s) => s.platform === 'eventbrite')) {
      const r = await scrapeEventbrite();
      summary.added += r.added;
      summary.updated += r.updated;
      summary.errors.push(...r.errors);
    }

    for (const source of sources) {
      try {
        if (source.platform === 'instagram') {
          const r = await scrapeInstagramSource(source, { aggressive });
          summary.added += r.added;
          summary.updated += r.updated;
          if (r.error) summary.errors.push(`@${source.handle}: ${r.error}`);
        } else if (source.platform === 'tiktok') {
          const r = await scrapeTikTokSource(source);
          summary.added += r.added;
          summary.updated += r.updated;
          if (r.error) summary.errors.push(`@${source.handle}: ${r.error}`);
        } else if (source.platform === 'x') {
          const r = await scrapeXSource(source);
          summary.added += r.added;
          summary.updated += r.updated;
          if (r.error) summary.errors.push(`@${source.handle}: ${r.error}`);
        }
      } catch (err) {
        summary.errors.push(`@${source.handle}: ${err.message}`);
      }
    }

    summary.pruned = pruneOldEvents();
    db.prepare("INSERT INTO app_meta (key, value) VALUES ('events_last_refresh', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(new Date().toISOString());
  } finally {
    running = false;
  }
  summary.ms = Date.now() - started;
  return summary;
}

// Meta helpers for the API layer.
export function getLastRefresh() {
  try {
    const row = db.prepare("SELECT value FROM app_meta WHERE key = 'events_last_refresh'").get();
    return row?.value || null;
  } catch {
    return null;
  }
}

export { CATEGORIES };