document.addEventListener('DOMContentLoaded', async () => {
  const pageIndicator = document.getElementById('page-indicator');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const statusDetail = document.getElementById('status-detail');
  const progressFill = document.getElementById('progress-fill');
  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');
  const resultsList = document.getElementById('results-list');
  const resultsCount = document.getElementById('results-count');
  const exportBtn = document.getElementById('export-btn');
  const clearBtn = document.getElementById('clear-btn');
  const tableBtn = document.getElementById('table-btn');

  const lookupToggle = document.getElementById('lookup-toggle');
  const lookupArrow = document.getElementById('lookup-arrow');
  const lookupContent = document.getElementById('lookup-content');
  const lookupInput = document.getElementById('lookup-input');
  const lookupBtn = document.getElementById('lookup-btn');
  const lookupResult = document.getElementById('lookup-result');
  const lookupError = document.getElementById('lookup-error');
  const lookupRegion = document.getElementById('lookup-region');
  const lookupHandle = document.getElementById('lookup-handle');
  const lookupLocation = document.getElementById('lookup-location');
  const queryStatus = document.getElementById('query-status');
  const batchPrompt = document.getElementById('batch-prompt');
  const batchCompleted = document.getElementById('batch-completed');
  const batchRemaining = document.getElementById('batch-remaining');
  const batchContinue = document.getElementById('batch-continue');
  const batchStop = document.getElementById('batch-stop');

  let scrapedData = [];
  let currentTab = null;

  async function checkQueryIdStatus() {
    const result = await chrome.storage.local.get(['aboutAccountQueryId']);
    queryStatus.style.display = 'block';
    if (result.aboutAccountQueryId) {
      queryStatus.textContent = '✓ Query ID ready';
      queryStatus.className = 'page-indicator valid';
    } else {
      queryStatus.innerHTML = '⚠ Need query ID — <a href="#" id="capture-help" style="color: #1da1f2;">how to get one</a>';
      queryStatus.className = 'page-indicator invalid';
      setTimeout(() => {
        document.getElementById('capture-help')?.addEventListener('click', (e) => {
          e.preventDefault();
          alert('Just visit any profile\'s about page once:\n\nx.com/anyone/about\n\nThe extension will grab the query ID automatically. It\'ll stay valid until X rotates their API (usually weeks/months).');
        });
      }, 0);
    }
  }

  async function checkCurrentPage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      currentTab = tab;

      if (!tab?.url) {
        setPageIndicator('No page detected', 'invalid');
        return false;
      }

      const isXPage = tab.url.includes('x.com') || tab.url.includes('twitter.com');
      const isFollowPage = tab.url.includes('/following') ||
                           tab.url.includes('/followers') ||
                           tab.url.includes('/verified_followers');

      if (!isXPage) {
        setPageIndicator('Navigate to X/Twitter first', 'invalid');
        return false;
      }

      if (isFollowPage) {
        const match = tab.url.match(/x\.com\/([^/]+)\/(following|followers|verified_followers)/);
        const username = match ? match[1] : 'user';
        const listType = match ? match[2].replace('_', ' ') : 'list';
        setPageIndicator(`Ready: @${username}'s ${listType}`, 'valid');
        return true;
      } else {
        setPageIndicator('Go to a /following or /followers page to scrape', 'invalid');
        return false;
      }
    } catch (e) {
      setPageIndicator('Error checking page', 'invalid');
      return false;
    }
  }

  function setPageIndicator(text, type) {
    pageIndicator.textContent = text;
    pageIndicator.className = 'page-indicator ' + type;
  }

  async function loadState() {
    const state = await chrome.runtime.sendMessage({ action: 'getState' });
    if (state?.data?.length) {
      scrapedData = state.data;
      renderResults();
    }
    if (state?.isActive) {
      setStatus('active', 'Scraping...', `${state.scrapedCount} users found`);
      startBtn.disabled = true;
      stopBtn.disabled = false;
    }
  }

  function setStatus(type, text, detail = '') {
    statusDot.className = 'status-dot ' + type;
    statusText.textContent = text;
    statusDetail.textContent = detail;
  }

  function setProgress(current, total) {
    const pct = total > 0 ? (current / total) * 100 : 0;
    progressFill.style.width = pct + '%';
  }

  function renderResults() {
    resultsCount.textContent = scrapedData.length + ' users';

    if (scrapedData.length === 0) {
      resultsList.innerHTML = '<li class="empty-state">No results yet. Start scraping!</li>';
      return;
    }

    const toShow = scrapedData.slice(-50).reverse();
    resultsList.innerHTML = toShow.map(user => `
      <li class="result-item">
        <span class="result-region">${escapeHtml(user.location || 'Unknown')}</span>
        <div class="result-info">
          <div class="result-handle">@${escapeHtml(user.handle)}</div>
        </div>
      </li>
    `).join('');
  }

  function addResult(user) {
    scrapedData.push(user);
    renderResults();
  }

  startBtn.addEventListener('click', async () => {
    const isValid = await checkCurrentPage();
    if (!isValid) {
      alert('Please navigate to a /following or /followers page on X/Twitter first');
      return;
    }

    try {
      await chrome.tabs.sendMessage(currentTab.id, { action: 'startScraping' });
      setStatus('active', 'Scraping...', 'Collecting usernames...');
      startBtn.disabled = true;
      stopBtn.disabled = false;
      batchPrompt.classList.add('hidden');
      scrapedData = [];
      renderResults();
    } catch (e) {
      setStatus('error', 'Error', 'Could not start scraping');
      console.error(e);
    }
  });

  stopBtn.addEventListener('click', async () => {
    try {
      await chrome.tabs.sendMessage(currentTab.id, { action: 'stopScraping' });
    } catch (e) {
      console.error(e);
    }
    setStatus('ready', 'Stopped', `${scrapedData.length} users collected`);
    startBtn.disabled = false;
    stopBtn.disabled = true;
  });

  exportBtn.addEventListener('click', () => {
    if (scrapedData.length === 0) {
      alert('No data to export');
      return;
    }

    const headers = ['Handle', 'Display Name', 'Location', 'Region', 'Profile URL', 'Followers', 'Scraped At'];
    const rows = [headers.join(',')];

    for (const user of scrapedData) {
      rows.push([
        csvEscape(user.handle),
        csvEscape(user.displayName),
        csvEscape(user.location),
        csvEscape(user.region),
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

  clearBtn.addEventListener('click', async () => {
    if (!confirm('Clear all scraped data?')) return;
    scrapedData = [];
    renderResults();
    await chrome.runtime.sendMessage({ action: 'clearState' });
    setStatus('', 'Ready', '');
    setProgress(0, 0);
  });

  tableBtn.addEventListener('click', () => {
    if (scrapedData.length === 0) {
      alert('No data to display');
      return;
    }
    chrome.tabs.create({ url: chrome.runtime.getURL('table.html') });
  });

  lookupToggle.addEventListener('click', () => {
    const isOpen = lookupContent.classList.toggle('open');
    lookupArrow.textContent = isOpen ? '▲' : '▼';
  });

  lookupBtn.addEventListener('click', doLookup);
  lookupInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') doLookup();
  });

  batchContinue.addEventListener('click', async () => {
    batchPrompt.classList.add('hidden');
    setStatus('active', 'Scraping...', 'Continuing...');
    try {
      await chrome.tabs.sendMessage(currentTab.id, { action: 'continueBatch' });
    } catch (e) {
      console.error(e);
    }
  });

  batchStop.addEventListener('click', async () => {
    batchPrompt.classList.add('hidden');
    try {
      await chrome.tabs.sendMessage(currentTab.id, { action: 'stopBatch' });
    } catch (e) {
      console.error(e);
    }
  });

  async function doLookup() {
    const username = lookupInput.value.trim().replace('@', '');
    if (!username) return;

    lookupResult.classList.add('hidden');
    lookupError.classList.add('hidden');
    lookupBtn.disabled = true;
    lookupBtn.textContent = '...';

    try {
      const result = await chrome.runtime.sendMessage({
        action: 'lookupUser',
        username: username
      });

      if (result.error) {
        lookupError.textContent = result.error;
        lookupError.classList.remove('hidden');
      } else {
        lookupRegion.textContent = result.region || 'Unknown';
        lookupHandle.textContent = '@' + result.handle;
        lookupLocation.textContent = result.location || 'No location';
        lookupResult.classList.remove('hidden');
      }
    } catch (e) {
      lookupError.textContent = e.message || 'Lookup failed';
      lookupError.classList.remove('hidden');
    }

    lookupBtn.disabled = false;
    lookupBtn.textContent = 'Lookup';
  }

  chrome.runtime.onMessage.addListener((msg) => {
    switch (msg.action) {
      case 'scrapingStarted':
        setStatus('active', 'Scraping...', 'Collecting usernames...');
        break;
      case 'phase':
        setStatus('active', 'Scraping...', msg.message);
        break;
      case 'usernameCollected':
        setStatus('active', 'Collecting...', `${msg.count} usernames found`);
        break;
      case 'progress':
        setStatus('active', 'Fetching locations...', `${msg.current}/${msg.total}`);
        setProgress(msg.current, msg.total);
        if (msg.latest) addResult(msg.latest);
        break;
      case 'batchComplete':
        batchCompleted.textContent = msg.completed;
        batchRemaining.textContent = `(${msg.remaining} remaining)`;
        batchPrompt.classList.remove('hidden');
        setStatus('active', 'Paused', `${msg.completed} done, waiting to continue...`);
        break;
      case 'scrapingStopped':
        setStatus('ready', 'Done!', `${msg.count} users scraped`);
        startBtn.disabled = false;
        stopBtn.disabled = true;
        batchPrompt.classList.add('hidden');
        setProgress(100, 100);
        if (msg.data) {
          scrapedData = msg.data;
          renderResults();
        }
        break;
      case 'error':
        setStatus('error', 'Error', msg.message);
        startBtn.disabled = false;
        stopBtn.disabled = true;
        batchPrompt.classList.add('hidden');
        break;
    }
  });

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function csvEscape(str) {
    if (str == null) return '';
    str = String(str);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  await checkCurrentPage();
  await checkQueryIdStatus();
  await loadState();
});
