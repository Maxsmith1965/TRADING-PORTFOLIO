// ── MAXSMITH CAPITAL RESEARCH AGENT v1.0 ────────────────
// Phase 1: Live fundamentals + news + earnings + insider activity
// Sources: Finnhub API + SEC EDGAR + Anthropic Claude AI

const https = require('https');

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { 'User-Agent': 'MaxSmithCapital/1.0 (max@zerolondon.uk)', ...headers },
      timeout: 8000
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
  });
}

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function getDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

function formatMarketCap(mc) {
  if (!mc) return 'N/A';
  if (mc >= 1000) return '$' + (mc / 1000).toFixed(2) + 'T';
  return '$' + mc.toFixed(1) + 'B';
}

async function getFinnhubData(ticker, apiKey) {
  const base = 'https://finnhub.io/api/v1';
  const t = '&token=' + apiKey;
  const from = getDateDaysAgo(7);
  const to = getToday();

  const [quote, profile, metrics, news, sentiment, insider, earnings, reco] = await Promise.all([
    httpsGet(base + '/quote?symbol=' + ticker + '&token=' + apiKey),
    httpsGet(base + '/stock/profile2?symbol=' + ticker + t),
    httpsGet(base + '/stock/metric?symbol=' + ticker + '&metric=all' + t),
    httpsGet(base + '/company-news?symbol=' + ticker + '&from=' + from + '&to=' + to + t),
    httpsGet(base + '/news-sentiment?symbol=' + ticker + t),
    httpsGet(base + '/stock/insider-transactions?symbol=' + ticker + t),
    httpsGet(base + '/calendar/earnings?symbol=' + ticker + t),
    httpsGet(base + '/stock/recommendation?symbol=' + ticker + t)
  ]);

  return { quote, profile, metrics, news: news || [], sentiment, insider, earnings, reco };
}

async function getSecData(ticker, email) {
  try {
    const url = 'https://efts.sec.gov/LATEST/search-index?q=%22' + ticker + '%22&forms=4&dateRange=custom&startdt=' + getDateDaysAgo(30) + '&enddt=' + getToday();
    const data = await httpsGet(url, { 'User-Agent': 'MaxSmithCapital ' + email });
    return data?.hits?.hits?.slice(0, 5) || [];
  } catch(e) { return []; }
}

async function claudeSynthesis(ticker, d, anthropicKey) {
  const q = d.quote;
  const m = d.metrics?.metric || {};
  const p = d.profile || {};
  const r = d.reco?.[0] || {};
  const s = d.sentiment?.sentiment || {};
  const news = d.news?.slice(0, 3).map(n => '- ' + n.headline).join('\n') || 'No recent news';
  const nextEarnings = d.earnings?.earningsCalendar?.[0]?.date || 'Check calendar';
  const insiderCount = d.secInsider?.length || 0;

  const prompt = `You are Claude, AI trading mentor for MaxSmith Capital, a disciplined UK private investor with £50,000 deployed.

Analyse this live data for ${ticker} and produce a structured research brief.

PRICE DATA:
- Current Price: ${q?.c ? '$' + q.c.toFixed(2) : 'N/A'}
- Today Change: ${q?.dp ? q.dp.toFixed(2) + '%' : 'N/A'}
- Market Cap: ${formatMarketCap(p.marketCapitalization)}
- 52W High: ${m['52WeekHigh'] ? '$' + m['52WeekHigh'] : 'N/A'}
- 52W Low: ${m['52WeekLow'] ? '$' + m['52WeekLow'] : 'N/A'}
- P/E Ratio: ${m.peNormalizedAnnual?.toFixed(1) || 'N/A'}

FUNDAMENTALS:
- Revenue Growth YoY: ${m.revenueGrowthTTMYoy ? (m.revenueGrowthTTMYoy * 100).toFixed(1) + '%' : 'N/A'}
- Gross Margin: ${m.grossMarginTTM?.toFixed(1) + '%' || 'N/A'}
- FCF Margin: ${m.fcfMarginTTM?.toFixed(1) + '%' || 'N/A'}
- Return on Equity: ${m.roeTTM?.toFixed(1) + '%' || 'N/A'}
- Net Debt/Equity: ${m.netDebtToTotalEquityQuarterly?.toFixed(2) || 'N/A'}

ANALYST CONSENSUS:
- Strong Buy: ${r.strongBuy || 0} | Buy: ${r.buy || 0} | Hold: ${r.hold || 0} | Sell: ${r.sell || 0}

SENTIMENT:
- Bullish: ${s.bullishPercent ? (s.bullishPercent * 100).toFixed(0) + '%' : 'N/A'}
- Bearish: ${s.bearishPercent ? (s.bearishPercent * 100).toFixed(0) + '%' : 'N/A'}

RECENT HEADLINES:
${news}

INSIDER ACTIVITY:
- SEC Form 4 filings in last 30 days: ${insiderCount}

EARNINGS:
- Next earnings date: ${nextEarnings}

Our framework: Beer and Froth analysis, 7-8% stop losses on active trades, no stop on blue chips (thesis-based exit only), max 10% per position, 24hr rule on impulse buys. Portfolio focused on AI infrastructure, nuclear energy, robotics, optical networking.

Produce this exact structure:

SIGNAL: [ONE OF: STRONG BUY / BUY / CAUTION / AVOID / SELL]

PRICE SNAPSHOT: Current price context, momentum, 52-week range position.

FUNDAMENTAL HEALTH: Revenue growth, margins, balance sheet strength.

SENTIMENT AND NEWS: Analyst consensus, news sentiment, material headlines.

INSIDER ACTIVITY: Recent Form 4 filings and what they signal.

EARNINGS RISK: Next date and what to watch for.

BEER AND FROTH NOTE: Estimated beer score and froth premium at current price. Is the margin of safety adequate?

MENTOR VERDICT: Direct recommendation. Buy now or wait? Entry conditions if applicable. Stop loss level. Key risk to monitor.

Be concise, honest and direct. No platitudes.`;

  const body = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }]
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 30000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.content?.[0]?.text || 'Analysis unavailable - check API key');
        } catch(e) { resolve('Parse error - ' + data.substring(0, 100)); }
      });
    });
    req.on('error', () => resolve('Connection error to Claude API'));
    req.on('timeout', () => resolve('Claude API timeout - try again'));
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const FINNHUB = process.env.FINNHUB;
  const ANTHROPIC = process.env.ANTHROPIC_KEY;
  const SEC_EMAIL = process.env.SEC_EMAIL || 'max@zerolondon.uk';

  if (!FINNHUB) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'FINNHUB API key not configured in Netlify' }) };
  }

  const ticker = (event.queryStringParameters?.ticker || '').toUpperCase().trim();
  if (!ticker) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ticker required. Use ?ticker=NVDA' }) };
  }

  try {
    console.log('Agent analysing: ' + ticker);

    const [finnhub, sec] = await Promise.all([
      getFinnhubData(ticker, FINNHUB),
      getSecData(ticker, SEC_EMAIL)
    ]);

    const data = { ...finnhub, secInsider: sec };

    let analysis = null;
    if (ANTHROPIC) {
      analysis = await claudeSynthesis(ticker, data, ANTHROPIC);
    } else {
      analysis = 'SIGNAL: PENDING\n\nMENTOR VERDICT: Add ANTHROPIC_KEY to Netlify Environment Variables to enable AI synthesis. Raw data is available above.';
    }

    const q = data.quote;
    const m = data.metrics?.metric || {};
    const r = data.reco?.[0] || {};

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ticker,
        timestamp: new Date().toISOString(),
        price: q?.c ? '$' + q.c.toFixed(2) : null,
        priceRaw: q?.c || null,
        changePercent: q?.dp?.toFixed(2) || null,
        marketCap: data.profile?.marketCapitalization ? formatMarketCap(data.profile.marketCapitalization) : null,
        analysis,
        rawData: {
          pe: m.peNormalizedAnnual || null,
          revenueGrowth: m.revenueGrowthTTMYoy || null,
          grossMargin: m.grossMarginTTM || null,
          fcfMargin: m.fcfMarginTTM || null,
          week52High: m['52WeekHigh'] || null,
          week52Low: m['52WeekLow'] || null,
          recommendation: { strongBuy: r.strongBuy || 0, buy: r.buy || 0, hold: r.hold || 0, sell: r.sell || 0 },
          nextEarnings: data.earnings?.earningsCalendar?.[0]?.date || null,
          sentiment: data.sentiment?.sentiment || null,
          newsCount: data.news?.length || 0,
          insiderFilings: sec.length
        }
      })
    };

  } catch(e) {
    console.error('Agent error:', e.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message, ticker })
    };
  }
};
