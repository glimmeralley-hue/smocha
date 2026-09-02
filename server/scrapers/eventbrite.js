// Eventbrite adapter — server-rendered listing pages for Nairobi/Kenya.
// Confirmed scrapeable: discover page + category/search pages work without JS.
// Uses regex extraction (no DOM dependency) on JSON-LD blocks first, markup second.

import {
  classifyPost,
  cleanHtml,
  downloadImage,
  upsertEvent,
} from './util.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Which listing pages to sweep. Keep the list short — every page is a real request.
const FEEDS = [
  { url: 'https://www.eventbrite.com/d/kenya--nairobi/all-events/', category: null },
  { url: 'https://www.eventbrite.com/d/kenya--nairobi/hiking/', category: 'hiking' },
  { url: 'https://www.eventbrite.com/d/kenya--nairobi/music/', category: 'nightlife' },
  { url: 'https://www.eventbrite.com/d/kenya--nairobi/food--and--drink/', category: 'food' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// Extract all <script type="application/ld+json">…</script> payloads,
// recursing into ItemList containers (Eventbrite wraps events in ItemLists).
function extractJsonLd(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1].trim());
      const queue = Array.isArray(data) ? data : [data];
      while (queue.length > 0) {
        const node = queue.shift();
        if (!node || typeof node !== 'object') continue;
        if (node['@type'] === 'ItemList' && Array.isArray(node.itemListElement)) {
          for (const el of node.itemListElement) {
            if (el && typeof el === 'object') queue.push(el.item || el);
          }
          continue;
        }
        const type = node['@type'];
        const isEvent = type === 'Event' || (Array.isArray(type) && type.includes('Event')) || (node.url && node.startDate);
        if (isEvent) out.push(node);
      }
    } catch {
      // malformed JSON-LD in this script tag — skip
    }
  }
  return out;
}

function jsonLdToEvent(item, sourceCategory) {
  const name = cleanHtml(item.name || '');
  if (!name) return null;
  if (item.eventAttendanceMode && item.eventAttendanceMode.includes('Online')) return null;
  const addr = item.location?.address || {};
  const region = addr.addressRegion || addr.addressLocality || '';
  const venue = item.location?.name || [addr.streetAddress, region].filter(Boolean).join(', ');
  // /d/ pages occasionally include nearby-region events; keep Kenya only.
  if (!/nairobi|kenya/i.test(`${venue} ${region}`)) return null;
  const url = item.url || '';
  if (!url) return null;
  const desc = cleanHtml(item.description || '').slice(0, 500);
  const price = item.offers?.price != null ? parseFloat(item.offers.price) : null;
  const text = `${name} ${desc} ${venue}`;
  const image = Array.isArray(item.image) ? item.image[0] : item.image;
  return {
    source: 'eventbrite',
    remote_url: url.split('?')[0],
    external_account: item.organizer?.name || 'Eventbrite',
    title: name.slice(0, 140),
    description: desc,
    location: venue,
    city: 'Nairobi',
    category: sourceCategory || classifyPost(text, 'eventbrite') || 'community',
    starts_at: item.startDate || null,
    ends_at: item.endDate || null,
    price: Number.isFinite(price) && price > 0 ? price : null,
    organizer: item.organizer?.name || null,
    image: typeof image === 'string' ? image : image?.url || null,
    link: url,
  };
}

// Fallback: parse listing-card anchors (/e/ links) out of the markup.
function domToEvents(html, sourceCategory) {
  const out = [];
  const seen = new Set();
  const re = /<a[^>]+href="(https?:\/\/[^"]*\/e\/[^"#?]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const remoteUrl = m[1].split('?')[0];
    if (seen.has(remoteUrl)) continue;
    seen.add(remoteUrl);
    const title = cleanHtml(m[2]).slice(0, 120);
    if (!title || title.length < 4) continue;
    out.push({
      source: 'eventbrite',
      remote_url: remoteUrl,
      external_account: 'Eventbrite',
      title,
      description: '',
      location: '',
      city: 'Nairobi',
      category: sourceCategory || classifyPost(title, 'eventbrite') || 'community',
      starts_at: null,
      ends_at: null,
      price: null,
      organizer: null,
      image: null,
      link: remoteUrl,
    });
  }
  return out;
}

export async function scrapeEventbrite() {
  const results = { added: 0, updated: 0, errors: [] };
  for (const feed of FEEDS) {
    try {
      const html = await fetchPage(feed.url);
      let events = extractJsonLd(html)
        .map((item) => jsonLdToEvent(item, feed.category))
        .filter(Boolean);
      if (events.length === 0) events = domToEvents(html, feed.category);
      for (const ev of events.slice(0, 25)) {
        ev.image_path = await downloadImage(ev.image);
        delete ev.image;
        const r = upsertEvent(ev);
        if (r === 'added') results.added += 1;
        else if (r === 'updated') results.updated += 1;
      }
    } catch (err) {
      results.errors.push(`eventbrite[${feed.url}]: ${err.message}`);
    }
    await sleep(1500 + Math.random() * 1500);
  }
  return results;
}