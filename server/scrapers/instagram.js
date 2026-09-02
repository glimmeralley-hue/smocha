// Instagram adapter — direct profile fetch, no login.
// Confirmed working for public profiles (e.g. diplomattrekkers) as of this build.
// Strategy: pull profile HTML, extract embedded post JSON, fall back to profile-pic.
// IG throttles aggressively per-IP: the orchestrator paces calls.

import {
  classifyPost,
  cleanHtml,
  downloadImage,
  titleFromCaption,
  jitterSleep,
  upsertEvent,
  markSourceScrape,
} from './util.js';

// Browser-ish UAs. The mobile-web UA works best for the feed JSON endpoint.
const UA_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const UA_MOBILE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

// Build the logged-in cookie jar. IG issues ds_user_id (the account's numeric
// id, derivable from the sessionid prefix) alongside sessionid and expects
// both echoed back — sending only sessionid triggers a redirect loop.
function sessionCookie() {
  const sid = process.env.IG_SESSIONID;
  if (!sid) return '';
  const dsUserId = sid.split('%3A')[0];
  return `sessionid=${sid}; ds_user_id=${dsUserId}; `;
}

async function fetchPage(url, { ua = UA_DESKTOP, extraHeaders = {} } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const jar = sessionCookie();
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': ua,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(jar ? { Cookie: jar } : {}),
        ...extraHeaders,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// Instagram embeds post data in inline scripts. Handle both known shapes:
//  - "xdt_api__v1__feed__user_timeline_graphql_connection" edges (current)
//  - "edge_owner_to_timeline_media" edges (older)
function extractEmbeddedPosts(html) {
  const posts = [];
  const push = (node) => {
    if (!node || typeof node !== 'object') return;
    const edges = node.edge_media_to_caption?.edges || [];
    const caption =
      (Array.isArray(edges) && edges[0]?.node?.text) ||
      node.caption?.text ||
      node.caption ||
      '';
    const code = node.code || node.shortcode || '';
    const url = code ? `https://www.instagram.com/p/${code}/` : null;
    if (!url) return;
    const ts =
      typeof node.taken_at === 'number'
        ? new Date(node.taken_at * 1000).toISOString()
        : typeof node.taken_at_timestamp === 'number'
          ? new Date(node.taken_at_timestamp * 1000).toISOString()
          : null;
    const img =
      node.display_url ||
      (Array.isArray(node.display_resources) &&
        node.display_resources[node.display_resources.length - 1]?.src) ||
      (Array.isArray(node.carousel_media) && node.carousel_media[0]?.display_url) ||
      null;
    posts.push({ caption: String(caption || ''), url, image: img, ts });
  };

  const re = /xdt_api__v1__feed__user_timeline_graphql_connection\((\{[\s\S]{0,600000}?\})\)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      for (const e of data?.edges || []) push(e.node);
    } catch {
      // partial blob — best effort
    }
  }
  if (posts.length === 0) {
    const m2 = html.match(/"edge_owner_to_timeline_media":\{[\s\S]*?"edges":(\[[\s\S]*?\])\}/);
    if (m2) {
      try {
        for (const e of JSON.parse(m2[1])) push(e.node);
      } catch {
        // skip
      }
    }
  }
  return posts;
}

function extractProfilePic(html) {
  const m = html.match(/"profile_pic_url_hd":"([^"]+)"/) || html.match(/"profile_pic_url":"([^"]+)"/);
  if (!m) return null;
  try {
    return JSON.parse(`"${m[1]}"`);
  } catch {
    return m[1];
  }
}

// Pull the profile's numeric user id out of the profile HTML. IG exposes it in
// the page container (`profilePage_123…`) and in embedded user JSON.
function extractUserId(html) {
  const patterns = [
    /"profilePage_([0-9]{5,20})"/,
    /"user":\s*\{[^{}]{0,400}?"id":"([0-9]{5,20})"/,
    /\\\\"profilePage_([0-9]{5,20})\\\\"/,
    /"pk":"([0-9]{5,20})"/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1];
  }
  return null;
}

// Resolve a handle to its numeric user id via IG's topsearch endpoint.
// Verified working even when the profile HTML is a logged-out JS shell
// (no embedded ids); requires the cookie jar.
async function lookupUserId(handle) {
  if (!process.env.IG_SESSIONID) throw new Error('user lookup needs IG_SESSIONID');
  const url = `https://www.instagram.com/web/search/topsearch/?context=blended&query=${encodeURIComponent(handle)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA_DESKTOP,
        Accept: 'application/json',
        'x-ig-app-id': '936619743392459',
        Referer: 'https://www.instagram.com/',
        Cookie: sessionCookie(),
      },
    });
    if (!res.ok) throw new Error(`lookup HTTP ${res.status}`);
    const data = await res.json();
    const users = Array.isArray(data?.users) ? data.users : [];
    // Prefer the exact handle match to avoid grabbing a lookalike account.
    const exact = users.find((u) => (u?.user?.username || '').toLowerCase() === handle.toLowerCase());
    const id = exact?.user?.pk || exact?.user?.id || users[0]?.user?.pk || users[0]?.user?.id || null;
    if (!id) throw new Error('handle not found in lookup');
    return String(id);
  } finally {
    clearTimeout(timer);
  }
}

// The verified working path: fetch the user's feed JSON from IG's mobile-web
// API. Requires the full cookie jar (sessionid + ds_user_id) and an app id.
// Returns the raw items array (12 latest posts) or throws.
async function fetchUserFeed(userId) {
  if (!process.env.IG_SESSIONID) throw new Error('feed endpoint needs IG_SESSIONID');
  const url = `https://www.instagram.com/api/v1/feed/user/${userId}/`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA_MOBILE,
        Accept: 'application/json',
        'x-ig-app-id': '936619743392459',
        'x-requested-with': 'XMLHttpRequest',
        Referer: `https://www.instagram.com/`,
        Cookie: sessionCookie(),
      },
    });
    if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    if (items.length === 0) throw new Error('feed returned no items');
    return items;
  } finally {
    clearTimeout(timer);
  }
}

// Normalize a v1 feed item (or embedded graph node) into the common post shape.
function pushFeedItem(items, raw) {
  const media = raw?.media || raw; // v1 wraps in .media, some shapes don't
  if (!media || typeof media !== 'object') return;
  const caption =
    media.caption?.text ||
    (Array.isArray(media.edge_media_to_caption?.edges) && media.edge_media_to_caption.edges[0]?.node?.text) ||
    (typeof media.caption === 'string' ? media.caption : '') ||
    '';
  const code = media.code || media.shortcode || '';
  if (!code) return;
  const ts = typeof media.taken_at === 'number' ? new Date(media.taken_at * 1000).toISOString() : null;
  const candidates = Array.isArray(media.image_versions2?.candidates) ? media.image_versions2.candidates : [];
  // Candidates are sorted hi-res → lo-res; grab a middle one (fast + good enough).
  const img = candidates[Math.min(2, candidates.length - 1)]?.url || candidates[0]?.url || null;
  if (!img) return;
  items.push({
    caption: String(caption || ''),
    url: `https://www.instagram.com/p/${code}/`,
    image: img,
    ts,
  });
}

// Try admin-configured mirror viewers (event_sources.mirror_urls JSON array).
// Each entry is a URL template containing {handle}, e.g. "https://imginn.com/{handle}/".
// Mirrors are volatile — best effort only: look for linked IG posts + og:image metadata.
async function fetchFromMirrors(source) {
  let mirrors = [];
  try {
    mirrors = JSON.parse(source.mirror_urls || '[]');
  } catch {
    mirrors = [];
  }
  for (const tpl of mirrors) {
    if (typeof tpl !== 'string' || !tpl.includes('{handle}')) continue;
    try {
      const html = await fetchPage(tpl.replace('{handle}', encodeURIComponent(source.handle)));
      if (html && html.length > 500) return html;
    } catch {
      // mirror dead or gated — try the next one
    }
  }
  return null;
}

export async function scrapeInstagramSource(source, { aggressive = false } = {}) {
  const out = { added: 0, updated: 0, error: null };
  let html = null;
  try {
    html = await fetchPage(`https://www.instagram.com/${encodeURIComponent(source.handle)}/`);
  } catch (err) {
    // Direct fetch failed — try admin-configured mirror viewers before giving up.
    html = await fetchFromMirrors(source);
    if (!html) {
      out.error = err.message;
      markSourceScrape(source.id, false, err.message);
      if (!aggressive) await jitterSleep();
      return out;
    }
  }
  try {
    const hasPostData = /xdt_api__v1__feed__user_timeline_graphql_connection|edge_owner_to_timeline_media/.test(html);
    // Only treat it as a real login wall when the served page IS the login
    // page. Loose matching false-positives on JS strings inside the shell HTML.
    const isLoginPage =
      /<body[^>]*class="[^"]*LoginAndSignupPage/.test(html) ||
      /<title[^>]*>\s*Login[^<]*Instagram/.test(html);
    if (isLoginPage) throw new Error('login wall');
    const posts = hasPostData ? extractEmbeddedPosts(html) : [];
    let feedPosts = [...posts];
    if (feedPosts.length === 0) {
      // Fallback (verified path): topsearch lookup → numeric user id → feed JSON.
      try {
        const userId = extractUserId(html) || (await lookupUserId(source.handle));
        if (userId) {
          const items = await fetchUserFeed(userId);
          for (const item of items) pushFeedItem(feedPosts, item);
        }
      } catch {
        // Feed endpoint unavailable — fall through to the profile-pic stand-in.
      }
    }
    if (feedPosts.length === 0) {
      // Profile reachable but posts not exposed — stand-in card from profile pic.
      const pic = extractProfilePic(html);
      if (!pic) throw new Error('no posts exposed');
      const url = `https://www.instagram.com/${source.handle}/`;
      const r = upsertEvent({
        source: 'instagram',
        remote_url: url,
        external_account: `@${source.handle}`,
        title: `@${source.handle} on Instagram`,
        description: 'Latest from this creator — open the link for full details.',
        location: '',
        city: 'Nairobi',
        category: source.category_bias || 'community',
        starts_at: null,
        ends_at: null,
        price: null,
        organizer: `@${source.handle}`,
        image_path: await downloadImage(pic),
        link: url,
      });
      if (r === 'added') out.added += 1;
      else if (r === 'updated') out.updated += 1;
      markSourceScrape(source.id, true, 'profile-only (no post JSON)');
      return out;
    }
    for (const p of feedPosts.slice(0, 12)) {
      const category = classifyPost(p.caption, 'instagram', source.category_bias);
      if (!category) continue; // not an outing post — skip
      const r = upsertEvent({
        source: 'instagram',
        remote_url: p.url,
        external_account: `@${source.handle}`,
        title: titleFromCaption(p.caption, `@${source.handle} outing`),
        description: p.caption.slice(0, 600),
        location: '',
        city: 'Nairobi',
        category,
        starts_at: p.ts,
        ends_at: null,
        price: null,
        organizer: `@${source.handle}`,
        image_path: await downloadImage(p.image),
        link: p.url,
      });
      if (r === 'added') out.added += 1;
      else if (r === 'updated') out.updated += 1;
    }
    markSourceScrape(source.id, true, `${feedPosts.length} posts seen`);
  } catch (err) {
    out.error = err.message;
    markSourceScrape(source.id, false, err.message);
  }
  if (!aggressive) await jitterSleep();
  return out;
}

// Import a single Instagram post URL (admin-curated path).
export async function importInstagramPost(url) {
  const html = await fetchPage(url);
  const ogTitle = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] || '';
  const ogDesc = html.match(/<meta property="og:description" content="([^"]*)"/)?.[1] || '';
  const ogImg = html.match(/<meta property="og:image" content="([^"]*)"/)?.[1] || null;
  const handle = (ogTitle.match(/@([A-Za-z0-9._]+)/) || [])[1] || 'instagram';
  const caption = cleanHtml(ogDesc).replace(/^\d[\d,]*\s*likes?[·,\s]*/i, '');
  const category = classifyPost(caption, 'instagram') || 'community';
  return {
    source: 'instagram',
    remote_url: url.split('?')[0],
    external_account: `@${handle}`,
    title: titleFromCaption(caption, `Post by @${handle}`),
    description: caption.slice(0, 600),
    location: '',
    city: 'Nairobi',
    category,
    starts_at: null,
    ends_at: null,
    price: null,
    organizer: `@${handle}`,
    image_path: await downloadImage(ogImg),
    link: url,
  };
}
