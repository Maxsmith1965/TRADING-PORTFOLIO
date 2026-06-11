// ── MAXSMITH CAPITAL MARKET DATA ─────────────────────────
// Uses Finnhub API for reliable live prices
// All 26 watchlist stocks

const https = require('https');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache'
};

// Fallback list - used only if the watchlist database can't be read.
const FALLBACK_TICKERS = [
  'NVDA','AVGO','TSM','ASML','MSFT','AAPL','GOOGL','META','AMZN',
  'MU','CEG','MBLY','CIEN','LEU','MP','TER','VRT','AMD',
  'WDC','SNDK','XRP','AMTM','IREN','TSLA','BMNR','NBIS',
  'LITE','MRVL','WIX','QCOM','TSEM','FN','COHR'
];

// Blue-chip tickers that get full metrics (P/E + 52-week range)
const BLUE_CHIP_TICKERS = ['NVDA','AVGO','TSM','ASML','MSFT','AAPL','GOOGL','META','AMZN'];

// Pull the LIVE watchlist tickers from the same stocks function the app uses.
// This means any stock added via Settings automatically gets a price.
function getWatchlistTickers(host) {
  return new Promise((resolve) => {
    if (!host) { resolve(null); return; }
    const url = `https://${host}/.netlify/functions/stocks`;
    https.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const d = JSON.parse(data);
          const all = [...(d.blueChips || []), ...(d.activeStocks || [])];
          const tickers = all.map(s => s.ticker).filter(Boolean);
          resolve(tickers.length ? tickers : null);
        } catch (e) { resolve(null); }
      });
    }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
  });
}

function getQuote(ticker, apiKey) {
  return new Promise((resolve) => {
    const url = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`;
    https.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const q = JSON.parse(data);
          resolve({
            ticker,
            price: q.c ? '$' + q.c.toFixed(2) : null,
            priceRaw: q.c || null,
            change: q.d ? q.d.toFixed(2) : '0',
            changePct: q.dp ? q.dp.toFixed(2) : '0',
            prevClose: q.pc || null
          });
        } catch(e) { resolve({ ticker, price: null, priceRaw: null, change: '0', changePct: '0' }); }
      });
    }).on('error', () => resolve({ ticker, price: null, priceRaw: null, change: '0', changePct: '0' }))
      .on('timeout', () => resolve({ ticker, price: null, priceRaw: null, change: '0', changePct: '0' }));
  });
}

function getMetrics(ticker, apiKey) {
  return new Promise((resolve) => {
    const url = `https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${apiKey}`;
    https.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const d = JSON.parse(data);
          const m = d.metric || {};
          resolve({
            pe: m.peNormalizedAnnual ? m.peNormalizedAnnual.toFixed(1) : 'N/A',
            week52High: m['52WeekHigh'] ? '$' + m['52WeekHigh'].toFixed(2) : 'N/A',
            week52Low: m['52WeekLow'] ? '$' + m['52WeekLow'].toFixed(2) : 'N/A'
          });
        } catch(e) { resolve({ pe: 'N/A', week52High: 'N/A', week52Low: 'N/A' }); }
      });
    }).on('error', () => resolve({ pe: 'N/A', week52High: 'N/A', week52Low: 'N/A' }))
      .on('timeout', () => resolve({ pe: 'N/A', week52High: 'N/A', week52Low: 'N/A' }));
  });
}

function getVix(apiKey) {
  return new Promise((resolve) => {
    const url = `https://finnhub.io/api/v1/quote?symbol=^VIX&token=${apiKey}`;
    https.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const q = JSON.parse(data);
          const val = q.c || 0;
          const chg = q.dp || 0;
          const level = val < 15 ? 'CALM' : val < 20 ? 'NEUTRAL' : val < 25 ? 'MILD FEAR' : val < 30 ? 'FEAR' : 'EXTREME FEAR';
          resolve({ value: val.toFixed(1), change: chg.toFixed(2), level });
        } catch(e) { resolve({ value: 'N/A', change: '0', level: 'Check TradingView' }); }
      });
    }).on('error', () => resolve({ value: 'N/A', change: '0', level: 'Check TradingView' }));
  });
}

// Delay helper to avoid rate limiting
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const FINNHUB = process.env.FINNHUB;
  if (!FINNHUB) return { statusCode: 500, headers, body: JSON.stringify({ error: 'FINNHUB key not configured' }) };

  try {
    // Get the live watchlist (includes any stocks added via Settings).
    // Falls back to the hardcoded list if the database can't be read.
    const host = event.headers?.host || event.headers?.Host;
    let TICKERS = await getWatchlistTickers(host);
    if (!TICKERS || !TICKERS.length) TICKERS = FALLBACK_TICKERS;

    const quotes = {};

    // Fetch quotes in batches of 8 with small delays to avoid rate limits
    const batchSize = 8;
    for (let i = 0; i < TICKERS.length; i += batchSize) {
      const batch = TICKERS.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(t => getQuote(t, FINNHUB)));
      results.forEach(r => {
        if (r.priceRaw) {
          quotes[r.ticker] = {
            price: r.price,
            priceRaw: r.priceRaw,
            change: r.change,
            changePct: r.changePct,
            pe: 'N/A',
            week52High: 'N/A',
            week52Low: 'N/A',
            volume: 'N/A',
            marketCap: 'N/A'
          };
        }
      });
      if (i + batchSize < TICKERS.length) await delay(200);
    }

    // Fetch metrics for blue chips PLUS any added stocks that aren't in the
    // fallback list (so newly-added tickers also get P/E + 52-week data).
    const added = TICKERS.filter(t => !FALLBACK_TICKERS.includes(t));
    const metricTickers = [...new Set([...BLUE_CHIP_TICKERS, ...added])];
    const metricResults = await Promise.all(metricTickers.map(t => getMetrics(t, FINNHUB)));
    metricResults.forEach((m, i) => {
      const t = metricTickers[i];
      if (quotes[t]) {
        quotes[t].pe = m.pe;
        quotes[t].week52High = m.week52High;
        quotes[t].week52Low = m.week52Low;
      }
    });

    // Get VIX
    const vix = await getVix(FINNHUB);

    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 5);

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        quotes,
        vix,
        timestamp: now.toISOString(),
        lastUpdated: timeStr
      })
    };

  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
