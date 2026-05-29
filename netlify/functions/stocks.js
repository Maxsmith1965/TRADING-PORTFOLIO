// ── MAXSMITH CAPITAL STOCK SEARCH ───────────────────────
// Searches Finnhub for stock symbols by company name or ticker
// GET /.netlify/functions/stocksearch?q=Harmonic Drive
// GET /.netlify/functions/stocksearch?ticker=NVDA (returns profile)

const https = require('https');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

function httpsGet(url) {
  return new Promise((resolve) => {
    https.get(url, { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const FINNHUB = process.env.FINNHUB;
  if (!FINNHUB) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Finnhub key not configured' }) };
  }

  const query = event.queryStringParameters?.q;
  const ticker = event.queryStringParameters?.ticker;

  // Symbol search by company name
  if (query) {
    const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${FINNHUB}`;
    const data = await httpsGet(url);
    if (!data) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Search failed' }) };
    }
    // Filter to common stocks only and limit
    const filtered = (data.result || [])
      .filter(r => r.type === 'Common Stock' || r.type === 'EQS')
      .slice(0, 8);
    return { statusCode: 200, headers, body: JSON.stringify({ result: filtered }) };
  }

  // Profile lookup by ticker
  if (ticker) {
    const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker.toUpperCase()}&token=${FINNHUB}`;
    const data = await httpsGet(url);
    return { statusCode: 200, headers, body: JSON.stringify(data || {}) };
  }

  return { statusCode: 400, headers, body: JSON.stringify({ error: 'Provide q= or ticker= parameter' }) };
};
