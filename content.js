let isScrapingActive = false;
let collectedUsernames = [];
let scrapedUsers = new Map();
let capturedQueryIds = {};

// Load saved AboutAccountQuery ID from storage
chrome.storage.local.get(['aboutAccountQueryId'], (result) => {
  if (result.aboutAccountQueryId) {
    capturedQueryIds['AboutAccountQuery'] = result.aboutAccountQueryId;
    console.log('[X-Scraper] Loaded saved AboutAccountQuery ID:', result.aboutAccountQueryId);
  }
});

// Save AboutAccountQuery ID when captured
function saveAboutAccountQueryId(id) {
  chrome.storage.local.set({ aboutAccountQueryId: id });
  console.log('[X-Scraper] Saved AboutAccountQuery ID:', id);
}

// Capture query IDs from X's network requests
try {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const m = entry.name.match(/\/i\/api\/graphql\/([^/]+)\/(\w+)/);
      if (m) {
        capturedQueryIds[m[2]] = m[1];
        if (m[2] === 'AboutAccountQuery') {
          console.log('[X-Scraper] Captured AboutAccountQuery ID:', m[1]);
          saveAboutAccountQueryId(m[1]);
        }
      }
    }
  });
  observer.observe({ entryTypes: ['resource'] });
} catch (e) {}

// Scan requests that already happened
try {
  const entries = performance.getEntriesByType('resource');
  for (const entry of entries) {
    const m = entry.name.match(/\/i\/api\/graphql\/([^/]+)\/(\w+)/);
    if (m) {
      capturedQueryIds[m[2]] = m[1];
      if (m[2] === 'AboutAccountQuery') {
        saveAboutAccountQueryId(m[1]);
      }
    }
  }
} catch (e) {}

// Listen for query IDs from injector.js (MAIN world fetch interceptor)
window.addEventListener('message', (e) => {
  if (e.data?.type === 'X_QUERY_ID') {
    capturedQueryIds[e.data.op] = e.data.id;
    if (e.data.op === 'AboutAccountQuery') {
      console.log('[X-Scraper] Captured AboutAccountQuery ID:', e.data.id);
      saveAboutAccountQueryId(e.data.id);
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'startScraping':
      startScraping();
      sendResponse({ status: 'started' });
      break;
    case 'stopScraping':
      stopScraping();
      sendResponse({ status: 'stopped' });
      break;
    case 'getStatus':
      sendResponse({
        isActive: isScrapingActive,
        count: scrapedUsers.size,
        total: collectedUsernames.length
      });
      break;
    case 'getData':
      sendResponse({ data: Array.from(scrapedUsers.values()) });
      break;
  }
  return true;
});

function isOnValidPage() {
  const url = window.location.href;
  return url.includes('/following') ||
         url.includes('/followers') ||
         url.includes('/verified_followers');
}

async function startScraping() {
  if (!isOnValidPage()) {
    chrome.runtime.sendMessage({
      action: 'error',
      message: 'Please navigate to a /following or /followers page'
    });
    return;
  }

  let qid = capturedQueryIds['AboutAccountQuery'];

  if (!qid) {
    chrome.runtime.sendMessage({
      action: 'error',
      message: 'No query ID captured. Go to any profile → click ⋯ → "About this account", then try again.'
    });
    return;
  }

  isScrapingActive = true;
  collectedUsernames = [];
  scrapedUsers.clear();

  chrome.runtime.sendMessage({ action: 'scrapingStarted' });
  chrome.runtime.sendMessage({ action: 'phase', message: 'Collecting usernames...' });

  await collectUsernames();

  if (!isScrapingActive || collectedUsernames.length === 0) {
    stopScraping();
    return;
  }

  chrome.runtime.sendMessage({
    action: 'phase',
    message: `Fetching locations for ${collectedUsernames.length} users...`
  });

  await fetchLocations();
  stopScraping();
}

function stopScraping() {
  isScrapingActive = false;
  chrome.runtime.sendMessage({
    action: 'scrapingStopped',
    count: scrapedUsers.size,
    data: Array.from(scrapedUsers.values())
  });
}

async function collectUsernames() {
  const seen = new Set();
  let lastHeight = 0;
  let noNewCount = 0;

  while (isScrapingActive && noNewCount < 3) {
    const cells = document.querySelectorAll('[data-testid="UserCell"]');

    for (const cell of cells) {
      const links = cell.querySelectorAll('a[href^="/"]');
      for (const link of links) {
        const href = link.getAttribute('href');
        if (href && /^\/[a-zA-Z0-9_]+$/.test(href)) {
          const handle = href.substring(1);
          if (!seen.has(handle)) {
            seen.add(handle);
            collectedUsernames.push(handle);
            chrome.runtime.sendMessage({
              action: 'usernameCollected',
              count: collectedUsernames.length,
              username: handle
            });
          }
          break;
        }
      }
    }

    window.scrollTo(0, document.documentElement.scrollHeight);
    await sleep(800);

    const newHeight = document.documentElement.scrollHeight;
    if (newHeight === lastHeight) {
      noNewCount++;
    } else {
      noNewCount = 0;
      lastHeight = newHeight;
    }
  }

  window.scrollTo(0, 0);
}

async function fetchLocations() {
  const qid = capturedQueryIds['AboutAccountQuery'];
  const BATCH_SIZE = 50;

  for (let i = 0; i < collectedUsernames.length; i++) {
    if (!isScrapingActive) break;

    // At batch boundaries (after first 50, 100, etc.), ask user to continue
    if (i > 0 && i % BATCH_SIZE === 0) {
      chrome.runtime.sendMessage({
        action: 'batchComplete',
        completed: i,
        total: collectedUsernames.length,
        remaining: collectedUsernames.length - i
      });

      const shouldContinue = await waitForBatchApproval();
      if (!shouldContinue) {
        stopScraping();
        return;
      }
    }

    const handle = collectedUsernames[i];

    try {
      const userData = await fetchUserLocation(handle, qid);
      if (userData) {
        scrapedUsers.set(handle, userData);
        chrome.runtime.sendMessage({
          action: 'progress',
          current: i + 1,
          total: collectedUsernames.length,
          count: scrapedUsers.size,
          latest: userData
        });
      }
    } catch (e) {}

    await sleep(500);
  }
}

let batchApprovalResolver = null;

function waitForBatchApproval() {
  return new Promise(resolve => {
    batchApprovalResolver = resolve;
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'continueBatch') {
    if (batchApprovalResolver) {
      batchApprovalResolver(true);
      batchApprovalResolver = null;
    }
    sendResponse({ status: 'continuing' });
  } else if (message.action === 'stopBatch') {
    if (batchApprovalResolver) {
      batchApprovalResolver(false);
      batchApprovalResolver = null;
    }
    sendResponse({ status: 'stopped' });
  }
  return true;
});

async function fetchUserLocation(handle, qid) {
  const csrf = getCsrf();
  if (!csrf) {
    return { handle, displayName: '', location: '', region: 'Unknown', profileUrl: `https://x.com/${handle}`, followersCount: 0, verified: false, scrapedAt: new Date().toISOString() };
  }

  const BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

  const headers = {
    'authorization': `Bearer ${BEARER}`,
    'x-csrf-token': csrf,
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-active-user': 'yes',
    'content-type': 'application/json',
  };

  let location = '';

  try {
    const params = new URLSearchParams({ variables: JSON.stringify({ screenName: handle }) });
    const resp = await fetch(`https://x.com/i/api/graphql/${qid}/AboutAccountQuery?${params}`, {
      headers,
      credentials: 'include'
    });
    if (resp.ok) {
      const data = await resp.json();
      const basedIn = data?.data?.user_result_by_screen_name?.result?.about_profile?.account_based_in;
      if (basedIn) location = basedIn;
    }
  } catch (e) {}

  return {
    handle: handle,
    displayName: '',
    location: location,
    region: getRegionLabel(location),
    profileUrl: `https://x.com/${handle}`,
    followersCount: 0,
    verified: false,
    scrapedAt: new Date().toISOString()
  };
}

function getCsrf() {
  const match = document.cookie.match(/ct0=([^;]+)/);
  return match ? match[1] : null;
}

function getRegionLabel(location) {
  if (!location) return 'Unknown';
  const loc = location.toLowerCase().trim();

  // USA - gets the special treatment
  const usa = [
    'united states', 'usa', 'u.s.a.', 'u.s.', 'america',
    'california', 'texas', 'new york', 'florida', 'washington', 'oregon', 'colorado',
    'arizona', 'illinois', 'ohio', 'michigan', 'pennsylvania', 'georgia', 'virginia',
    'los angeles', 'nyc', 'chicago', 'houston', 'san francisco', 'seattle', 'miami', 'boston'
  ];

  const canada = ['canada', 'toronto', 'vancouver', 'montreal', 'ontario', 'quebec', 'alberta'];

  const latinAmerica = [
    'mexico', 'guatemala', 'cuba', 'haiti', 'dominican republic', 'honduras',
    'nicaragua', 'el salvador', 'costa rica', 'panama', 'jamaica', 'puerto rico',
    'brazil', 'argentina', 'colombia', 'chile', 'peru', 'venezuela', 'ecuador',
    'bolivia', 'paraguay', 'uruguay', 'mexico city', 'sao paulo', 'buenos aires',
    'south america', 'central america', 'caribbean', 'latin america'
  ];

  const uk = ['united kingdom', 'uk', 'great britain', 'britain', 'england', 'scotland', 'wales', 'london'];

  const europe = [
    'europe', 'european union', 'eu',
    'ireland', 'germany', 'france', 'italy', 'spain', 'portugal', 'netherlands', 'holland',
    'belgium', 'switzerland', 'austria', 'sweden', 'norway', 'denmark', 'finland', 'iceland',
    'poland', 'ukraine', 'czech republic', 'czechia', 'czech', 'slovakia', 'hungary',
    'romania', 'bulgaria', 'greece', 'turkey', 'croatia', 'serbia', 'slovenia',
    'paris', 'berlin', 'rome', 'madrid', 'amsterdam', 'warsaw', 'prague', 'budapest'
  ];

  const russia = ['russia', 'moscow', 'russian federation'];

  const australia = ['australia', 'new zealand', 'sydney', 'melbourne', 'brisbane', 'perth', 'auckland'];

  const india = ['india', 'mumbai', 'delhi', 'bangalore', 'hyderabad', 'chennai', 'kolkata', 'pune'];

  const middleEast = [
    'middle east', 'israel', 'palestine', 'lebanon', 'jordan', 'iraq', 'iran',
    'saudi arabia', 'uae', 'qatar', 'kuwait', 'bahrain', 'oman', 'yemen', 'syria',
    'dubai', 'abu dhabi', 'tel aviv', 'riyadh', 'doha'
  ];

  const eastAsia = [
    'japan', 'china', 'south korea', 'korea', 'taiwan', 'hong kong',
    'tokyo', 'seoul', 'beijing', 'shanghai', 'osaka', 'taipei'
  ];

  const asia = [
    'asia', 'pakistan', 'bangladesh', 'sri lanka', 'nepal',
    'indonesia', 'malaysia', 'singapore', 'philippines', 'thailand', 'vietnam',
    'myanmar', 'cambodia', 'laos', 'mongolia',
    'jakarta', 'bangkok', 'kuala lumpur', 'manila', 'ho chi minh'
  ];

  const africa = [
    'africa', 'south africa', 'nigeria', 'egypt', 'kenya', 'ethiopia', 'ghana', 'morocco',
    'cairo', 'lagos', 'johannesburg', 'cape town', 'nairobi'
  ];

  const all = [...usa, ...canada, ...latinAmerica, ...uk, ...europe, ...russia, ...australia, ...india, ...middleEast, ...eastAsia, ...asia, ...africa];
  const sorted = all.sort((a, b) => b.length - a.length);

  for (const place of sorted) {
    const re = new RegExp(`(?:^|[\\s,])${place}(?:[\\s,]|$)`, 'i');
    if (re.test(loc) || loc === place) {
      if (usa.includes(place)) return 'AMERICA';
      if (canada.includes(place)) return 'India 2';
      if (latinAmerica.includes(place)) return 'Latin America';
      if (uk.includes(place)) return 'UK';
      if (europe.includes(place)) return 'Europe';
      if (russia.includes(place)) return 'Russia';
      if (australia.includes(place)) return 'Down Under';
      if (india.includes(place)) return 'India';
      if (middleEast.includes(place)) return 'Middle East';
      if (eastAsia.includes(place)) return 'East Asia';
      if (asia.includes(place)) return 'Asia';
      if (africa.includes(place)) return 'Africa';
    }
  }
  return 'Unknown';
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
