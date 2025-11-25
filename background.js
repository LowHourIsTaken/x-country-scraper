let state = {
  isActive: false,
  scrapedCount: 0,
  data: []
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'scrapingStarted':
      state.isActive = true;
      state.data = [];
      state.scrapedCount = 0;
      updateBadge();
      break;

    case 'scrapingStopped':
      state.isActive = false;
      state.scrapedCount = message.count || 0;
      if (message.data) state.data = message.data;
      updateBadge();
      saveData();
      break;

    case 'progress':
      state.scrapedCount = message.count;
      if (message.latest) state.data.push(message.latest);
      updateBadge();
      break;

    case 'getState':
      sendResponse(state);
      return true;

    case 'clearState':
      state = { isActive: false, scrapedCount: 0, data: [] };
      chrome.storage.local.remove('scrapedData');
      updateBadge();
      sendResponse({ status: 'cleared' });
      return true;

    case 'lookupUser':
      handleLookup(message.username, sender.tab?.id)
        .then(data => sendResponse(data))
        .catch(err => sendResponse({ error: err.message }));
      return true;
  }
});

async function handleLookup(username, tabId) {
  if (!tabId) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab');
    tabId = tab.id;
  }

  const tab = await chrome.tabs.get(tabId);
  if (!tab.url?.includes('x.com') && !tab.url?.includes('twitter.com')) {
    throw new Error('Please open X/Twitter first');
  }

  const handle = username.replace('@', '').trim();
  if (!handle) throw new Error('Invalid username');

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: lookupUserInPage,
    args: [handle]
  });

  if (!results?.[0]?.result) throw new Error('Lookup failed');
  if (results[0].result.error) throw new Error(results[0].result.error);

  return results[0].result;
}

function lookupUserInPage(handle) {
  return new Promise(async (resolve) => {
    const csrf = document.cookie.match(/ct0=([^;]+)/)?.[1];
    if (!csrf) {
      resolve({ error: 'Not logged in to X/Twitter' });
      return;
    }

    const BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
    const headers = {
      'authorization': `Bearer ${BEARER}`,
      'x-csrf-token': csrf,
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-active-user': 'yes',
      'content-type': 'application/json',
    };

    const userVars = { screen_name: handle, withSafetyModeUserFields: true };
    const userFeatures = {
      hidden_profile_subscriptions_enabled: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      responsive_web_graphql_timeline_navigation_enabled: true,
      hidden_profile_likes_enabled: true,
      blue_business_profile_image_shape_enabled: true,
      responsive_web_twitter_blue_verified_badge_is_enabled: true,
    };

    const params = new URLSearchParams({
      variables: JSON.stringify(userVars),
      features: JSON.stringify(userFeatures),
      fieldToggles: JSON.stringify({ withAuxiliaryUserLabels: false })
    });

    const queryIds = ['NimuplG1OB7Fd2btCLdBOw', 'sLVLhk0bGj3MVFEKTdax1w', 'xc8f1g7BYqr6VTzTbvNlGw'];

    let userData = null;
    for (const qid of queryIds) {
      try {
        const resp = await fetch(`https://x.com/i/api/graphql/${qid}/UserByScreenName?${params}`, {
          headers, credentials: 'include'
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data?.data?.user?.result) {
            userData = data.data.user.result;
            break;
          }
        }
      } catch (e) {}
    }

    if (!userData) {
      resolve({ error: 'User not found' });
      return;
    }

    const legacy = userData.legacy || {};
    let location = '';

    try {
      const aboutParams = new URLSearchParams({
        variables: JSON.stringify({ screenName: handle })
      });
      const aboutResp = await fetch(`https://x.com/i/api/graphql/XRqGa7EeokUU5kppkh13EA/AboutAccountQuery?${aboutParams}`, {
        headers, credentials: 'include'
      });
      if (aboutResp.ok) {
        const aboutData = await aboutResp.json();
        const basedIn = aboutData?.data?.user_result_by_screen_name?.result?.about_profile?.account_based_in;
        if (basedIn) location = basedIn;
      }
    } catch (e) {}

    const region = (() => {
      if (!location) return 'Unknown';
      const loc = location.toLowerCase().trim();

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
    })();

    resolve({
      handle: legacy.screen_name || handle,
      displayName: legacy.name || '',
      location: location,
      region: region,
      profileUrl: `https://x.com/${legacy.screen_name || handle}`,
      followersCount: legacy.followers_count,
      verified: userData.is_blue_verified || false,
      scrapedAt: new Date().toISOString()
    });
  });
}

function updateBadge() {
  const text = state.scrapedCount > 0 ? String(state.scrapedCount) : '';
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({
    color: state.isActive ? '#1DA1F2' : '#657786'
  });
}

async function saveData() {
  await chrome.storage.local.set({
    scrapedData: state.data,
    lastSaved: new Date().toISOString()
  });
}

async function loadData() {
  const result = await chrome.storage.local.get(['scrapedData']);
  if (result.scrapedData) {
    state.data = result.scrapedData;
    state.scrapedCount = result.scrapedData.length;
    updateBadge();
  }
}

chrome.runtime.onInstalled.addListener(() => loadData());
loadData();
