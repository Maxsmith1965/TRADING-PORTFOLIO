const yahooFinance = require('yahoo-finance2').default;

const ALL_TICKERS = [
  'NVDA','AVGO','TSM','ASML','MSFT','AAPL','GOOGL','META','AMZN',
  'MU','CEG','MBLY','CIEN','LEU','SOLS','MP','TER','VRT',
  'AMD','IREN','BE','TSLA','BMNR','AMTM','COHR','WDC','^VIX'
];

function formatMarketCap(cap) {
  if (!cap) return 'N/A';
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(1)}M`;
  return `$${cap}`;
}

function getVIXLevel(vix) {
  if (!vix) return 'UNKNOWN';
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

  try {
    const results = {};
    let vixData = { value: 'N/A', change: '0', level: 'Check TradingView' };

    const quotes = await yahooFinance.quote(ALL_TICKERS);
    const quotesArray = Array.isArray(quotes) ? quotes : [quotes];

    quotesArray.forEach(q => {
      if (!q || !q.symbol) return;

      if (q.symbol === '^VIX') {
        const vixVal = q.regularMarketPrice;
        const vixChange = q.regularMarketChangePercent;
        vixData = {
          value: vixVal ? vixVal.toFixed(2) : 'N/A',
          change: vixChange ? vixChange.toFixed(2) : '0',
          level: getVIXLevel(vixVal)
        };
      } else {
        results[q.symbol] = {
          price: q.regularMarketPrice ? `$${q.regularMarketPrice.toFixed(2)}` : 'N/A',
          priceRaw: q.regularMarketPrice || 0,
          change: q.regularMarketChange ? q.regularMarketChange.toFixed(2) : '0',
          changePct: q.regularMarketChangePercent ? q.regularMarketChangePercent.toFixed(2) : '0',
          marketCap: formatMarketCap(q.marketCap),
          pe: q.trailingPE ? q.trailingPE.toFixed(1) : 'N/A',
          week52High: q.fiftyTwoWeekHigh ? `$${q.fiftyTwoWeekHigh.toFixed(2)}` : 'N/A',
          week52Low: q.fiftyTwoWeekLow ? `$${q.fiftyTwoWeekLow.toFixed(2)}` : 'N/A',
          volume: q.regularMarketVolume ? q.regularMarketVolume.toLocaleString() : 'N/A',
        };
      }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        quotes: results,
        vix: vixData,
        timestamp: new Date().toISOString(),
        lastUpdated: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      })
    };

  } catch (e) {
    console.error('Market data error:', e.message);
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
And here's the package.json — create this as a new file at netlify/functions/package.json:
json{
  "name": "tradingports-functions",
  "version": "1.0.0",
  "dependencies": {
    "yahoo-finance2": "^2.11.3"
  }
}
