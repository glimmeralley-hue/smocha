// TikTok adapter — official oEmbed endpoint (public, no key) for known video URLs.
// Profile scraping is bot-check walled from datacenter IPs; profile URLs are
// best-effort: we record a source card and rely on curated imports for posts.

import {
  classifyPost,
  cleanHtml,
  downloadImage,
  jitterSleep,
  titleFromCaption,
  upsertEvent,
  markSourceScrape,
} from './util.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function oembed(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    if (res.status === 429) throw new Error('rate limited');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Best-effort: record a profile-level card so the account shows in the feed even
// when individual videos can't be auto-pulled.
export async function scrapeTikTokSource(source) {
  const out = { added: 0, updated: 0, error: null };
  const profileUrl = `https://www.tiktok.com/@${source.handle}`;
  const remoteUrl = profileUrl;
  try {
    // TikTok oEmbed only accepts video URLs, not profiles — try it to detect walls.
    const existing = upsertEvent({
      source: 'tiktok',
      remote_url: remoteUrl,
      external_account: `@${source.handle}`,
      title: `@${source.handle} on TikTok`,
      description: 'Latest from this creator — paste a video link in the admin panel to feature a specific post.',
      location: '',
      city: 'Nairobi',
      category: source.category_bias || 'community',
      starts_at: null,
      ends_at: null,
      price: null,
      organizer: `@${source.handle}`,
      image_path: null,
      link: profileUrl,
    });
    if (existing === 'added') out.added += 1;
    else if (existing === 'updated') out.updated += 1;
    markSourceScrape(source.id, true, 'import-only (profile bot-checked)');
  } catch (err) {
    out.error = err.message;
    markSourceScrape(source.id, false, err.message);
  }
  await jitterSleep();
  return out;
}

// Import a single TikTok video URL via the official oEmbed endpoint.
export async function importTikTokVideo(url) {
  const data = await oembed(url);
  const title = cleanHtml(data.title || '').slice(0, 140);
  const handle = (data.author_unique_id || data.author_url?.split('@')?.[1] || 'tiktok').replace(/^@/, '');
  const caption = title;
  const category = classifyPost(caption, 'tiktok') || 'community';
  return {
    source: 'tiktok',
    remote_url: url.split('?')[0],
    external_account: `@${handle}`,
    title: title || titleFromCaption(caption, `Video by @${handle}`),
    description: caption,
    location: '',
    city: 'Nairobi',
    category,
    starts_at: null,
    ends_at: null,
    price: null,
    organizer: data.author_name || `@${handle}`,
    image_path: await downloadImage(data.thumbnail_url),
    link: url,
  };
}