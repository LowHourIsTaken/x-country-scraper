let allData = [];
let sortKey = 'handle';
let sortAsc = true;

const searchInput = document.getElementById('search');
const countryFilter = document.getElementById('country-filter');
const tableBody = document.getElementById('table-body');
const totalCount = document.getElementById('total-count');
const filteredCount = document.getElementById('filtered-count');
const emptyState = document.getElementById('empty-state');
const headers = document.querySelectorAll('th[data-sort]');

async function loadData() {
  const result = await chrome.storage.local.get(['scrapedData']);
  allData = result.scrapedData || [];
  totalCount.textContent = `${allData.length} users total`;
  populateCountryFilter();
  renderTable();
}

function populateCountryFilter() {
  const locations = new Set();
  allData.forEach(u => { if (u.location) locations.add(u.location); });
  const sorted = Array.from(locations).sort();
  countryFilter.innerHTML = '<option value="">All Locations</option>' +
    sorted.map(loc => `<option value="${escapeHtml(loc)}">${escapeHtml(loc)}</option>`).join('');
}

function getFilteredData() {
  const query = searchInput.value.toLowerCase().trim();
  const country = countryFilter.value;

  return allData.filter(user => {
    if (country && user.location !== country) return false;
    if (query) {
      const match = [user.handle, user.displayName, user.location]
        .filter(Boolean)
        .some(v => v.toLowerCase().includes(query));
      if (!match) return false;
    }
    return true;
  });
}

function getSortedData(data) {
  return [...data].sort((a, b) => {
    let valA = a[sortKey];
    let valB = b[sortKey];

    if (sortKey === 'followersCount') {
      valA = valA || 0;
      valB = valB || 0;
    } else {
      valA = (valA || '').toString().toLowerCase();
      valB = (valB || '').toString().toLowerCase();
    }

    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  });
}

function renderTable() {
  const filtered = getFilteredData();
  const sorted = getSortedData(filtered);

  filteredCount.textContent = `${sorted.length} shown`;

  headers.forEach(th => {
    th.classList.remove('sorted');
    const icon = th.querySelector('.sort-icon');
    if (icon) icon.textContent = '↕';
    if (th.dataset.sort === sortKey) {
      th.classList.add('sorted');
      if (icon) icon.textContent = sortAsc ? '↑' : '↓';
    }
  });

  if (sorted.length === 0) {
    tableBody.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  tableBody.innerHTML = sorted.map(user => `
    <tr>
      <td class="col-region">${getRegionLabel(user.location)}</td>
      <td class="col-handle">
        <a href="https://x.com/${escapeHtml(user.handle)}" target="_blank">@${escapeHtml(user.handle)}</a>
      </td>
      <td class="col-name">${escapeHtml(user.displayName || '')}</td>
      <td class="col-location">${escapeHtml(user.location || 'No location')}</td>
      <td class="col-followers">${formatNumber(user.followersCount)}</td>
    </tr>
  `).join('');
}

function formatNumber(num) {
  if (!num && num !== 0) return '-';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
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

function csvEscape(str) {
  if (str == null) return '';
  str = String(str);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

headers.forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (sortKey === key) {
      sortAsc = !sortAsc;
    } else {
      sortKey = key;
      sortAsc = true;
    }
    renderTable();
  });
});

searchInput.addEventListener('input', renderTable);
countryFilter.addEventListener('change', renderTable);

document.getElementById('refresh-btn').addEventListener('click', loadData);

document.getElementById('export-btn').addEventListener('click', () => {
  if (allData.length === 0) {
    alert('No data to export');
    return;
  }

  const csvHeaders = ['Handle', 'Display Name', 'Location', 'Region', 'Profile URL', 'Followers', 'Scraped At'];
  const rows = [csvHeaders.join(',')];

  for (const user of allData) {
    rows.push([
      csvEscape(user.handle),
      csvEscape(user.displayName),
      csvEscape(user.location),
      csvEscape(getRegionLabel(user.location)),
      csvEscape(user.profileUrl),
      csvEscape(user.followersCount),
      csvEscape(user.scrapedAt)
    ].join(','));
  }

  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `x_locations_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

loadData();
