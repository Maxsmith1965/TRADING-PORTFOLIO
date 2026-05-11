const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(null); }
      });
    }).on('error', reject);
  });
}

function formatMarketCap(cap) {
  if (!cap) return 'N/A';
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(1)}M`;
  return `$${cap}`;
}

function getVIXLevel(vix) {
  if (!vix) return 'Check TradingView';
  if (vix < 15) return 'LOW — Markets calm, risk appetite high';
  if (vix < 20) return 'MODERATE — Normal conditions';
  if (vix < 25) return 'ELEVATED — Caution advised';
  if (vix < 35) return 'HIGH — Reduce position sizes';
  return 'EXTREME — Consider standing down';
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'max-age=300'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const API_KEY = process.env.FINNHUB;

  if (!API_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'API key not configured', quotes: {}, vix: { value: 'N/A', change: '0', level: 'API key missing' } })
    };
  }

  const ALL_TICKERS = [
    'NVDA','AVGO','TSM','ASML','MSFT','AAPL','GOOGL','META','AMZN',
    'MU','CEG','MBLY','CIEN','LEU','SOLS','MP','TER','VRT',
    'AMD','IREN','BE','TSLA','AMTM','COHR','WDC'
  ];

  try {
    const results = {};

    // Fetch all stocks — Finnhub quote endpoint
    const fetchPromises = ALL_TICKERS.map(async (ticker) => {
      try {
        const [quote, profile] = await Promise.all([
          httpsGet(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${API_KEY}`),
          httpsGet(`https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${API_KEY}`)
        ]);

        if (quote && quote.c) {
          const price = quote.c;
          const prevClose = quote.pc;
          const change = price - prevClose;
          const changePct = prevClose ? ((change / prevClose) * 100) : 0;

          results[ticker] = {
            price: `$${price.toFixed(2)}`,
            priceRaw: price,
            change: change.toFixed(2),
            changePct: changePct.toFixed(2),
            marketCap: formatMarketCap(profile?.marketCapitalization ? profile.marketCapitalization * 1e6 : null),
            pe: 'N/A',
            week52High: quote['52WeekHigh'] ? `$${quote['52WeekHigh'].toFixed(2)}` : 'N/A',
            week52Low: quote['52WeekLow'] ? `$${quote['52WeekLow'].toFixed(2)}` : 'N/A',
            volume: 'N/A'
          };
        }
      } catch(e) {
        // Skip failed tickers
      }
    });

    await Promise.all(fetchPromises);

    // Fetch VIX using CBOE data
    let vixData = { value: 'N/A', change: '0', level: 'Check TradingView' };
    try {
      const vixQuote = await httpsGet(`https://finnhub.io/api/v1/quote?symbol=^VIX&token=${API_KEY}`);
      if (vixQuote && vixQuote.c) {
        const vixVal = vixQuote.c;
        const vixPrev = vixQuote.pc;
        const vixChangePct = vixPrev ? (((vixVal - vixPrev) / vixPrev) * 100) : 0;
        vixData = {
          value: vixVal.toFixed(2),
          change: vixChangePct.toFixed(2),
          level: getVIXLevel(vixVal)
        };
      }
    } catch(e) {}

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        quotes: results,
        vix: vixData,
        timestamp: new Date().toISOString(),
        lastUpdated: new Date().toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit'
        })
      })
    };

  } catch(e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: e.message,
        quotes: {},
        vix: { value: 'N/A', change: '0', level: 'Data temporarily unavailable' }
      })
    };
  }
};
