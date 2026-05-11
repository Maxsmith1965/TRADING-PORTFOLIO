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

  const ALL_TICKERS = [
    'NVDA','AVGO','TSM','ASML','MSFT','AAPL','GOOGL','META','AMZN',
    'MU','CEG','MBLY','CIEN','LEU','SOLS','MP','TER','VRT',
    'AMD','IREN','BE','TSLA','BMNR','AMTM','COHR','WDC'
  ];

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

  try {
    const https = require('https');

    function httpsGet(url) {
      return new Promise((resolve, reject) => {
        const options = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://finance.yahoo.com',
            'Cookie': 'no'
          },
          timeout: 8000
        };
        https.get(url, options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try { resolve(JSON.parse(data)); }
            catch(e) { resolve(null); }
          });
        }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
      });
    }

    const results = {};
    const tickerStr = ALL_TICKERS.join(',');

    const stockData = await httpsGet(
      `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${tickerStr}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketChange,marketCap,trailingPE,fiftyTwoWeekHigh,fiftyTwoWeekLow,regularMarketVolume`
    );

    if (stockData?.quoteResponse?.result) {
      stockData.quoteResponse.result.forEach(q => {
        if (!q?.symbol) return;
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
      });
    }

    const vixData_raw = await httpsGet(
      `https://query2.finance.yahoo.com/v7/finance/quote?symbols=%5EVIX`
    );

    let vixData = { value: 'N/A', change: '0', level: 'Check TradingView' };
    const vix = vixData_raw?.quoteResponse?.result?.[0];
    if (vix?.regularMarketPrice) {
      vixData = {
        value: vix.regularMarketPrice.toFixed(2),
        change: vix.regularMarketChangePercent ? vix.regularMarketChangePercent.toFixed(2) : '0',
        level: getVIXLevel(vix.regularMarketPrice)
      };
    }

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
