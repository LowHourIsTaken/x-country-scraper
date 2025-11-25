const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const url = args[0]?.toString() || '';
  const match = url.match(/\/i\/api\/graphql\/([^/]+)\/(\w+)/);
  if (match) {
    window.postMessage({ type: 'X_QUERY_ID', op: match[2], id: match[1] }, '*');
  }
  return originalFetch.apply(this, args);
};
