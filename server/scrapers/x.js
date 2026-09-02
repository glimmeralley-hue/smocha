// X/Twitter adapter — publish.twitter.com oEmbed (public, no key, confirmed working).
// Profile scraping needs JS + login; posts come in via curated imports or env token later.

import {
  classifyPost,
  cleanHtml,
  downloadImage,
  jitterSleep,
  titleFromCaption,
  upsertEvent,
  markSourceScrape,
} from './util.js';

async function oembed(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const endpoint = process.env.X_API_TOKEN
      ? `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&dnt=true&token=${process.env.X_API_TOKEN}`
      : `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&dnt=true`;
    const res = await fetch(endpoint, {
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

// Profile-level card so the account appears even before any tweet import.
export async function scrapeXSource(source) {
  const out = { added: 0, updated: 0, error: null };
  const profileUrl = `https://x.com/${source.handle}`;
  try {
    const r = upsertEvent({
      source: 'x',
      remote_url: profileUrl,
      external_account: `@${source.handle}`,
      title: `@${source.handle} on X`,
      description: 'Latest from this creator — paste a tweet link in the admin panel to feature a specific post.',
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
    if (r === 'added') out.added += 1;
    else if (r === 'updated') out.updated += 1;
    markSourceScrape(source.id, true, 'import-only (profile JS-walled)');
  } catch (err) {
    out.error = err.message;
    markSourceScrape(source.id, false, err.message);
  }
  await jitterSleep();
  return out;
}

// Import a single tweet URL via the official oEmbed endpoint.
export async function importTweet(url) {
  const data = await oembed(url);
  const rawTitle = cleanHtml(String(data.html || '').replace(/<[^>]*>/g, ' '));
  const handle = (data.author_url?.split('/')?.pop() || data.author || 'x').replace(/^@/, '');
  const text = rawTitle.slice(0, 500);
  const category = classifyPost(text, 'x') || 'community';
  return {
    source: 'x',
    remote_url: url.split('?')[0],
    external_account: `@${handle}`,
    title: titleFromCaption(text, `Post by @${handle}`),
    description: text,
    location: '',
    city: 'Nairobi',
    category,
    starts_at: null,
    ends_at: null,
    price: null,
    organizer: data.author_name || `@${handle}`,
    image_path: null,
    link: url,
  };
}