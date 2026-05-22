// ── MAXSMITH CAPITAL RESEARCH AGENT v2.0 ────────────────
// Phase 2: Live fundamentals + news + earnings + insider activity
// + Government contracts (USASpending.gov) + Better news filtering
// Sources: Finnhub API + SEC EDGAR + USASpending.gov + Anthropic Claude AI

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
  const from = getDateDaysAgo(14);
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

  // Filter news to only company-relevant headlines
  const companyName = profile?.name?.split(' ')[0]?.toLowerCase() || ticker.toLowerCase();
  const filteredNews = (news || []).filter(n => {
    const h = (n.headline || n.summary || '').toLowerCase();
    return h.includes(ticker.toLowerCase()) || h.includes(companyName);
  }).slice(0, 5);

  // Use filtered news if available, otherwise use all news
  const finalNews = filteredNews.length > 0 ? filteredNews : (news || []).slice(0, 3);

  return { quote, profile, metrics, news: finalNews, sentiment, insider, earnings, reco };
}

async function getGovernmentContracts(companyName) {
  try {
    // USASpending.gov free API - no key required
    const searchName = encodeURIComponent(companyName.split(' ')[0]);
    const url = 'https://api.usaspending.gov/api/v2/search/spending_by_award/?filters={"recipient_search_text":["' + searchName + '"],"award_type_codes":["A","B","C","D"]}&fields=Award+Amount,Awarding+Agency,Description,recipient_name,Award+Date&limit=5&order=desc&sort=Award+Amount&page=1';

    const response = await new Promise((resolve) => {
      const options = {
        hostname: 'api.usaspending.gov',
        path: '/api/v2/search/spending_by_award/',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MaxSmithCapital/1.0 (max@zerolondon.uk)'
        },
        timeout: 8000
      };

      const body = JSON.stringify({
        filters: {
          recipient_search_text: [companyName.split(' ')[0]],
          award_type_codes: ['A', 'B', 'C', 'D']
        },
        fields: ['Award Amount', 'Awarding Agency', 'Description', 'recipient_name', 'Award Date'],
        limit: 5,
        order: 'desc',
        sort: 'Award Amount',
        page: 1
      });

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch(e) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => resolve(null));
      req.write(body);
      req.end();
    });

    const results = response?.results || [];
    const totalValue = results.reduce((sum, r) => sum + (r['Award Amount'] || 0), 0);

    return {
      contracts: results.slice(0, 3),
      totalValue,
      count: results.length
    };
  } catch(e) {
    return { contracts: [], totalValue: 0, count: 0 };
  }
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
  const r = Array.isArray(d.reco) ? d.reco[0] : (d.reco || {});
  const s = d.sentiment?.sentiment || {};
  const news = Array.isArray(d.news) ? d.news.slice(0, 3).map(n => '- ' + (n.headline || n.title || '')).join('\n') : 'No recent news';
  // Only show FUTURE earnings dates
  const today = getToday();
  const earningsCalendar = d.earnings?.earningsCalendar || [];
  const futureEarnings = earningsCalendar.filter(e => e.date > today);
  const nextEarnings = futureEarnings[0]?.date || 'No upcoming earnings in Finnhub calendar — check manually';
  const insiderCount = d.secInsider?.length || 0;
  const govData = d.govContracts || { contracts: [], totalValue: 0, count: 0 };
  const govSummary = govData.count > 0
    ? `${govData.count} recent contracts found. Total value: $${(govData.totalValue / 1000000).toFixed(1)}M. Top contracts: ${govData.contracts.map(c => (c.Description || 'Contract') + ' - $' + ((c['Award Amount'] || 0) / 1000000).toFixed(1) + 'M from ' + (c['Awarding Agency'] || 'US Government')).join('; ')}`
    : 'No recent government contracts found in USASpending.gov database';

  // Debug log to see what we actually have
  console.log('Quote data:', JSON.stringify(q));
  console.log('Metrics keys:', Object.keys(m).slice(0, 10));
  console.log('Reco:', JSON.stringify(r));

  const prompt = `You are Claude, AI trading mentor for MaxSmith Capital, a disciplined UK private investor with £50,000 deployed.

Analyse this live data for ${ticker} and produce a structured research brief.

PRICE DATA:
- Current Price: ${q?.c ? '$' + q.c.toFixed(2) : 'N/A'}
- Today Change: ${q?.dp !== undefined ? q.dp.toFixed(2) + '%' : 'N/A'}
- Previous Close: ${q?.pc ? '$' + q.pc.toFixed(2) : 'N/A'}
- Market Cap: ${formatMarketCap(p.marketCapitalization)}
- 52W High: ${m['52WeekHigh'] ? '$' + m['52WeekHigh'] : 'N/A'}
- 52W Low: ${m['52WeekLow'] ? '$' + m['52WeekLow'] : 'N/A'}
- P/E Ratio: ${m.peNormalizedAnnual ? m.peNormalizedAnnual.toFixed(1) : 'N/A'}

FUNDAMENTALS:
- Revenue Growth YoY: ${m.revenueGrowthTTMYoy ? (m.revenueGrowthTTMYoy * 100).toFixed(1) + '%' : 'N/A'}
- Gross Margin: ${m.grossMarginTTM ? m.grossMarginTTM.toFixed(1) + '%' : 'N/A'}
- FCF Margin: ${m.fcfMarginTTM ? m.fcfMarginTTM.toFixed(1) + '%' : 'N/A'}
- Return on Equity: ${m.roeTTM ? m.roeTTM.toFixed(1) + '%' : 'N/A'}
- Net Debt/Equity: ${m.netDebtToTotalEquityQuarterly ? m.netDebtToTotalEquityQuarterly.toFixed(2) : 'N/A'}

ANALYST CONSENSUS:
- Strong Buy: ${r.strongBuy || 0} | Buy: ${r.buy || 0} | Hold: ${r.hold || 0} | Sell: ${r.sell || 0}

SENTIMENT:
- Bullish: ${s.bullishPercent ? (s.bullishPercent * 100).toFixed(0) + '%' : 'N/A'}
- Bearish: ${s.bearishPercent ? (s.bearishPercent * 100).toFixed(0) + '%' : 'N/A'}

RECENT HEADLINES:
${news}

INSIDER ACTIVITY:
- SEC Form 4 filings in last 30 days: ${insiderCount}

GOVERNMENT CONTRACTS (USASpending.gov):
- ${govSummary}

EARNINGS:
- Next earnings date: ${nextEarnings}

Our framework: Beer and Froth analysis, 7-8% stop losses on active trades, no stop on blue chips (thesis-based exit only), max 10% per position, 24hr rule on impulse buys. Portfolio focused on AI infrastructure, nuclear energy, robotics, optical networking.

Produce this exact structure:

SIGNAL: [ONE OF: STRONG BUY / BUY / CAUTION / AVOID / SELL]

PRICE SNAPSHOT: Current price context, momentum, 52-week range position.

FUNDAMENTAL HEALTH: Revenue growth, margins, balance sheet strength.

SENTIMENT AND NEWS: Analyst consensus, news sentiment, material headlines.

INSIDER ACTIVITY: Recent Form 4 filings and what they signal.

GOVERNMENT CONTRACTS: Recent USASpending.gov contract wins — size, agency, strategic significance for the investment thesis.

EARNINGS RISK: Next date and what to watch for.

BEER AND FROTH NOTE: Estimated beer score and froth premium at current price. Is the margin of safety adequate?

MENTOR VERDICT: Direct recommendation. Buy now or wait? Entry conditions if applicable. Stop loss level. Key risk to monitor.

Be concise, honest and direct. No platitudes.`;

  const body = JSON.stringify({
    model: 'claude-sonnet-4-6',
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
          if (parsed.error) {
            resolve('API Error: ' + parsed.error.type + ' - ' + parsed.error.message);
          } else {
            resolve(parsed.content?.[0]?.text || 'No content returned from Claude API');
          }
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

    // Fetch government contracts using company name from profile
    const companyName = data.profile?.name || ticker;
    const govContracts = await getGovernmentContracts(companyName);
    data.govContracts = govContracts;

    let analysis = null;
    if (ANTHROPIC) {
      analysis = await claudeSynthesis(ticker, data, ANTHROPIC);
    } else {
      analysis = 'SIGNAL: PENDING\n\nMENTOR VERDICT: Add ANTHROPIC_KEY to Netlify Environment Variables to enable AI synthesis. Raw data is available above.';
    }

    const q = data.quote;
    const m = data.metrics?.metric || {};
    const r = Array.isArray(data.reco) ? data.reco[0] : (data.reco || {});
    const todayStr = getToday();
    const futureEarnings = (data.earnings?.earningsCalendar || []).filter(e => e.date > todayStr);

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
          nextEarnings: futureEarnings[0]?.date || null,
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
