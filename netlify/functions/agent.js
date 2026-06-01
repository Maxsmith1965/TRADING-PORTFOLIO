// ── MAXSMITH CAPITAL RESEARCH AGENT v3.0 ────────────────
// Fast Summary (15 sec) + Deep Dive modules on demand
// Sources: Finnhub + SEC EDGAR + USASpending.gov + 
//          Capitol Trades + USPTO Patents + NewsAPI + Claude AI

const https = require('https');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache'
};

// ── HTTP HELPER ───────────────────────────────────────────
function httpsGet(url, reqHeaders = {}) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: { 'User-Agent': 'MaxSmithCapital/3.0 (max@zerolondon.uk)', ...reqHeaders },
        timeout: 8000
      };
      https.get(options, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch(e) { resolve(null); }
        });
      }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
    } catch(e) {
      resolve(null);
    }
  });
}

function httpsPost(hostname, path, body, reqHeaders = {}) {
  return new Promise((resolve) => {
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname, path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'User-Agent': 'MaxSmithCapital/3.0',
        ...reqHeaders
      },
      timeout: 30000
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve({ raw: data.substring(0, 200) }); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => resolve(null));
    req.write(bodyStr);
    req.end();
  });
}

// ── DATE HELPERS ──────────────────────────────────────────
function today() { return new Date().toISOString().split('T')[0]; }
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}
function formatM(n) {
  if (!n) return 'N/A';
  if (Math.abs(n) >= 1e9) return '$' + (n/1e9).toFixed(1) + 'B';
  if (Math.abs(n) >= 1e6) return '$' + (n/1e6).toFixed(1) + 'M';
  return '$' + n.toFixed(0);
}

// ── DATA SOURCES ──────────────────────────────────────────

// 1. FINNHUB - Core market data
async function getFinnhub(ticker, apiKey) {
  const t = `&token=${apiKey}`;
  const base = 'https://finnhub.io/api/v1';
  const from14 = daysAgo(14);

  const [quote, profile, metrics, news, insider, earnings, reco] = await Promise.all([
    httpsGet(`${base}/quote?symbol=${ticker}&token=${apiKey}`),
    httpsGet(`${base}/stock/profile2?symbol=${ticker}${t}`),
    httpsGet(`${base}/stock/metric?symbol=${ticker}&metric=all${t}`),
    httpsGet(`${base}/company-news?symbol=${ticker}&from=${from14}&to=${today()}${t}`),
    httpsGet(`${base}/stock/insider-transactions?symbol=${ticker}${t}`),
    httpsGet(`${base}/calendar/earnings?symbol=${ticker}${t}`),
    httpsGet(`${base}/stock/recommendation?symbol=${ticker}${t}`)
  ]);

  // Filter company-specific news
  const companyName = (profile?.name || ticker).split(' ')[0].toLowerCase();
  const filteredNews = (news || []).filter(n => {
    const h = (n.headline || '').toLowerCase();
    return h.includes(ticker.toLowerCase()) || h.includes(companyName);
  }).slice(0, 5);

  // Future earnings only
  const futureEarnings = (earnings?.earningsCalendar || []).filter(e => e.date > today());

  const m = metrics?.metric || {};
  return {
    price: quote?.c,
    change: quote?.dp,
    prevClose: quote?.pc,
    marketCap: profile?.marketCapitalization,
    companyName: profile?.name,
    industry: profile?.finnhubIndustry,
    pe: m.peNormalizedAnnual,
    revenueGrowth: m.revenueGrowthTTMYoy,
    grossMargin: m.grossMarginTTM,
    fcfMargin: m.fcfMarginTTM,
    roe: m.roeTTM,
    week52High: m['52WeekHigh'],
    week52Low: m['52WeekLow'],
    news: filteredNews,
    insider: insider?.data?.slice(0, 5) || [],
    nextEarnings: futureEarnings[0]?.date || null,
    recommendation: reco?.[0] || null
  };
}

// 2. SEC EDGAR - Insider Form 4 + 13F institutional + 13D activist
async function getSecData(ticker, companyName, email) {
  const secHeaders = { 'User-Agent': `MaxSmithCapital ${email}` };

  const [form4, filings13D] = await Promise.all([
    // Form 4 insider transactions
    httpsGet(`https://efts.sec.gov/LATEST/search-index?q=%22${ticker}%22&forms=4&dateRange=custom&startdt=${daysAgo(30)}&enddt=${today()}`, secHeaders),
    // 13D activist filings - crossing 5% ownership
    httpsGet(`https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(companyName?.split(' ')[0] || ticker)}%22&forms=SC+13D,SC+13G&dateRange=custom&startdt=${daysAgo(90)}&enddt=${today()}`, secHeaders)
  ]);

  return {
    form4Filings: form4?.hits?.hits?.length || 0,
    form4Details: form4?.hits?.hits?.slice(0, 3) || [],
    activist13D: filings13D?.hits?.hits?.slice(0, 3) || [],
    hasActivist: (filings13D?.hits?.hits?.length || 0) > 0
  };
}

// 3. USASPENDING.GOV - Government contracts
async function getGovContracts(companyName) {
  try {
    const searchName = (companyName || '').split(' ')[0];
    if (!searchName || searchName.length < 2) return { contracts: [], total: 0 };

    const result = await httpsPost('api.usaspending.gov', '/api/v2/search/spending_by_award/', {
      filters: {
        recipient_search_text: [searchName],
        award_type_codes: ['A','B','C','D'],
        time_period: [{ start_date: daysAgo(365), end_date: today() }]
      },
      fields: ['Award Amount','Awarding Agency','Description','recipient_name','Award Date'],
      limit: 5, order: 'desc', sort: 'Award Amount', page: 1
    });

    const contracts = result?.results || [];
    const total = contracts.reduce((s, c) => s + (c['Award Amount'] || 0), 0);
    return { contracts: contracts.slice(0, 3), total, count: contracts.length };
  } catch(e) { return { contracts: [], total: 0, count: 0 }; }
}

// 4. SAM.GOV - Upcoming government contract opportunities
async function getSamGov(companyName) {
  try {
    const keyword = (companyName || '').split(' ')[0];
    const url = `https://api.sam.gov/opportunities/v2/search?api_key=DEMO_KEY&keyword=${encodeURIComponent(keyword)}&limit=5&postedFrom=${daysAgo(30)}&postedTo=${today()}&ptype=o`;
    const data = await httpsGet(url);
    return {
      opportunities: data?.opportunitiesData?.slice(0, 3) || [],
      count: data?.totalRecords || 0
    };
  } catch(e) { return { opportunities: [], count: 0 }; }
}

// 5. USPTO PATENTS - Technology intelligence
async function getPatents(companyName) {
  try {
    const name = (companyName || '').split(' ').slice(0,2).join(' ');
    if (!name || name.length < 2) return { patents: [], count: 0 };
    // Use properly encoded URL
    const query = encodeURIComponent(JSON.stringify({
      "_and": [
        {"_text_phrase": {"assignee_organization": name}},
        {"_gte": {"patent_date": daysAgo(180)}}
      ]
    }));
    const fields = encodeURIComponent(JSON.stringify(["patent_number","patent_title","patent_date","assignee_organization"]));
    const opts = encodeURIComponent(JSON.stringify({"per_page": 5}));
    const url = `https://api.patentsview.org/patents/query?q=${query}&f=${fields}&o=${opts}`;
    const data = await httpsGet(url);
    return {
      patents: data?.patents?.slice(0, 5) || [],
      count: data?.total_patent_count || 0
    };
  } catch(e) { return { patents: [], count: 0 }; }
}

// 6. CAPITOL TRADES - Congressional trading
async function getCongressionalTrades(ticker) {
  try {
    const url = `https://www.capitoltrades.com/trades?politician=all&asset=${ticker}&txDate=1m`;
    // Capitol Trades doesn't have a public API so we note it
    return { 
      note: `Check capitoltrades.com/trades?asset=${ticker} for congressional activity`,
      available: false 
    };
  } catch(e) { return { available: false }; }
}

// 7. CLAUDE AI SYNTHESIS
async function claudeSynthesize(ticker, data, anthropicKey, mode) {
  const d = data;
  const rangePos = d.week52High && d.week52Low && d.price
    ? Math.round(((d.price - d.week52Low) / (d.week52High - d.week52Low)) * 100)
    : null;

  let prompt;

  if (mode === 'fast') {
    prompt = `You are Claude, AI trading mentor for MaxSmith Capital, a disciplined UK private investor.

TICKER: ${ticker}
PRICE: ${d.price ? '$' + d.price.toFixed(2) : 'N/A'} (${d.change ? (d.change > 0 ? '+' : '') + d.change.toFixed(2) + '%' : 'N/A'} today)
52W RANGE: $${d.week52Low?.toFixed(0) || 'N/A'} - $${d.week52High?.toFixed(0) || 'N/A'} | Position: ${rangePos !== null ? rangePos + '%' : 'N/A'}
P/E: ${d.pe?.toFixed(1) || 'N/A'} | Revenue Growth: ${d.revenueGrowth ? (d.revenueGrowth*100).toFixed(1)+'%' : 'N/A'} | Gross Margin: ${d.grossMargin?.toFixed(1) || 'N/A'}%
ANALYSTS: ${(d.recommendation?.strongBuy||0)+(d.recommendation?.buy||0)} Buy | ${d.recommendation?.hold||0} Hold | ${d.recommendation?.sell||0} Sell
INSIDER FORM 4s (30 days): ${d.sec?.form4Filings || 0}
GOVT CONTRACTS (12 months): ${d.gov?.total ? formatM(d.gov.total) : 'None found'}
NEXT EARNINGS: ${d.nextEarnings || 'Not scheduled'}
TOP HEADLINE: ${d.news?.[0]?.headline || 'No recent news'}

Framework: Beer & Froth analysis, 7-8% stop losses on active trades, thesis-based stops on blue chips. AI infrastructure, nuclear, robotics focus.

Produce a FAST SUMMARY with exactly this structure - be direct, no waffle:

SIGNAL: [STRONG BUY / BUY / BUY CAREFULLY / CAUTION / AVOID / SELL]

ONE LINE: Single sentence verdict on whether to buy at current price.

PRICE CHECK: 2 sentences. Where is it in 52W range? Momentum or reversal?

FUNDAMENTAL SNAP: 2 sentences. Revenue growth, margins. Strong or weak?

KEY RISK: One sentence. The single biggest risk right now.

ENTRY CONDITIONS: One sentence. What specific conditions trigger a buy?`;

  } else {
    // Deep dive mode
    prompt = `You are Claude, AI trading mentor for MaxSmith Capital.

FULL DATA FOR ${ticker}:

PRICE: $${d.price?.toFixed(2) || 'N/A'} | Change: ${d.change?.toFixed(2) || 'N/A'}%
52W: $${d.week52Low?.toFixed(0)} - $${d.week52High?.toFixed(0)} | Position: ${rangePos}%
P/E: ${d.pe?.toFixed(1) || 'N/A'} | Fwd Growth: ${d.revenueGrowth ? (d.revenueGrowth*100).toFixed(1)+'%' : 'N/A'}
Gross Margin: ${d.grossMargin?.toFixed(1) || 'N/A'}% | FCF Margin: ${d.fcfMargin?.toFixed(1) || 'N/A'}% | ROE: ${d.roe?.toFixed(1) || 'N/A'}%

ANALYSTS: ${(d.recommendation?.strongBuy||0)} Strong Buy | ${(d.recommendation?.buy||0)} Buy | ${d.recommendation?.hold||0} Hold | ${d.recommendation?.sell||0} Sell

RECENT NEWS (${ticker}-specific):
${d.news?.slice(0,3).map(n => '- ' + n.headline).join('\n') || 'No specific news found'}

INSIDER ACTIVITY (SEC Form 4, last 30 days):
${d.sec?.form4Filings || 0} filings found
${d.sec?.form4Details?.map(f => '- ' + (f._source?.period_of_report || 'Recent') + ': Form 4 filed').join('\n') || 'No details'}

ACTIVIST/INSTITUTIONAL (13D/13G, last 90 days):
${d.sec?.hasActivist ? d.sec.activist13D?.length + ' activist filings found - potential catalyst' : 'No recent activist filings'}

GOVERNMENT CONTRACTS (USASpending.gov, last 12 months):
${d.gov?.count > 0 ? formatM(d.gov.total) + ' across ' + d.gov.count + ' contracts' : 'No contracts found'}
${d.gov?.contracts?.map(c => '- ' + formatM(c['Award Amount']) + ' from ' + (c['Awarding Agency'] || 'US Gov') + ': ' + (c.Description || '').substring(0,50)).join('\n') || ''}

PATENTS (last 6 months):
${d.patents?.count > 0 ? d.patents.count + ' new patents filed' : 'No recent patents found'}
${d.patents?.patents?.slice(0,3).map(p => '- ' + (p.patent_title || '').substring(0,60)).join('\n') || ''}

NEXT EARNINGS: ${d.nextEarnings || 'Not scheduled'}

Our framework: Beer & Froth analysis, AlphaSpread DCF for intrinsic value, 7 philosopher scoring, 7-8% mechanical stop losses on active trades, thesis-based exits on blue chips. Focus: AI infrastructure, nuclear energy, robotics, optical networking.

Produce a DEEP ANALYSIS with these exact sections:

PRICE INTELLIGENCE: 3 sentences. Current momentum, 52W position, what the price action tells us.

FUNDAMENTAL HEALTH: 3 sentences. Revenue growth trajectory, margin quality, balance sheet strength. Rate it: EXCEPTIONAL / STRONG / ADEQUATE / WEAK.

NEWS & SENTIMENT: 2-3 sentences. What the headlines say. Analyst consensus interpretation. Is sentiment leading or lagging the fundamentals?

INSIDER & INSTITUTIONAL: 2 sentences. What Form 4 activity signals. Any activist filing implications.

GOVERNMENT INTELLIGENCE: 2 sentences. Contract value and strategic significance. Does government exposure strengthen or complicate the thesis?

PATENT INTELLIGENCE: 1-2 sentences. What recent patent activity signals about technology direction and future products.

BEER & FROTH ESTIMATE: 2 sentences. Estimated beer score at current price. Is the margin of safety adequate for entry?

EARNINGS RISK ASSESSMENT: 2 sentences. Next earnings date and what to watch. Binary risk level: HIGH / MEDIUM / LOW.

MENTOR VERDICT: 4-5 sentences. The definitive recommendation. Buy now, wait, or avoid? Specific entry price or conditions. Stop loss level. Key thesis to monitor. Maximum position size recommendation.`;
  }

  const response = await httpsPost('api.anthropic.com', '/v1/messages', {
    model: 'claude-sonnet-4-6',
    max_tokens: mode === 'fast' ? 600 : 1200,
    messages: [{ role: 'user', content: prompt }]
  }, {
    'x-api-key': anthropicKey,
    'anthropic-version': '2023-06-01'
  });

  if (response?.error) return `API Error: ${response.error.type} - ${response.error.message}`;
  return response?.content?.[0]?.text || 'Analysis unavailable';
}

// ── MAIN HANDLER ──────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const FINNHUB = process.env.FINNHUB;
  const ANTHROPIC = process.env.ANTHROPIC_KEY;
  const SEC_EMAIL = process.env.SEC_EMAIL || 'max@zerolondon.uk';

  if (!FINNHUB) return { statusCode: 500, headers, body: JSON.stringify({ error: 'FINNHUB key not configured' }) };

  const ticker = (event.queryStringParameters?.ticker || '').toUpperCase().trim();
  const mode = event.queryStringParameters?.mode || 'fast'; // fast | deep

  if (!ticker) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ticker required' }) };

  try {
    console.log(`Agent v3 - ${ticker} - mode: ${mode}`);

    if (mode === 'fast') {
      // FAST MODE - Core data only, quick synthesis
      let finnhub, sec, gov;
      try { finnhub = await getFinnhub(ticker, FINNHUB); } catch(e) { console.error('Finnhub error:', e.message); finnhub = {}; }
      try { sec = await getSecData(ticker, ticker, SEC_EMAIL); } catch(e) { console.error('SEC error:', e.message); sec = { form4Filings:0, form4Details:[], activist13D:[], hasActivist:false }; }
      try { gov = await getGovContracts(ticker); } catch(e) { console.error('Gov error:', e.message); gov = { contracts:[], total:0, count:0 }; }

      const data = { ...finnhub, sec, gov };
      const analysis = ANTHROPIC ? await claudeSynthesize(ticker, data, ANTHROPIC, 'fast') : 'Add ANTHROPIC_KEY to Netlify to enable AI synthesis.';

      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          ticker, mode: 'fast',
          timestamp: new Date().toISOString(),
          price: finnhub.price ? '$' + finnhub.price.toFixed(2) : null,
          priceRaw: finnhub.price,
          changePercent: finnhub.change?.toFixed(2),
          marketCap: finnhub.marketCap,
          companyName: finnhub.companyName,
          analysis,
          rawData: {
            pe: finnhub.pe,
            revenueGrowth: finnhub.revenueGrowth,
            grossMargin: finnhub.grossMargin,
            week52High: finnhub.week52High,
            week52Low: finnhub.week52Low,
            nextEarnings: finnhub.nextEarnings,
            recommendation: finnhub.recommendation,
            insiderFilings: sec.form4Filings,
            hasActivist: sec.hasActivist,
            govContractTotal: gov.total,
            newsCount: finnhub.news?.length || 0
          }
        })
      };
    }

    if (mode === 'deep') {
      // DEEP MODE - All sources, full synthesis
      let finnhub, sec, gov, patents;
      try { finnhub = await getFinnhub(ticker, FINNHUB); } catch(e) { console.error('Finnhub error:', e.message); finnhub = {}; }
      try { sec = await getSecData(ticker, ticker, SEC_EMAIL); } catch(e) { console.error('SEC error:', e.message); sec = { form4Filings:0, form4Details:[], activist13D:[], hasActivist:false }; }
      try { gov = await getGovContracts(ticker); } catch(e) { console.error('Gov error:', e.message); gov = { contracts:[], total:0, count:0 }; }
      try { patents = await getPatents(ticker); } catch(e) { console.error('Patents error:', e.message); patents = { patents:[], count:0 }; }

      const data = { ...finnhub, sec, gov, patents };
      const analysis = ANTHROPIC ? await claudeSynthesize(ticker, data, ANTHROPIC, 'deep') : 'Add ANTHROPIC_KEY to Netlify to enable AI synthesis.';

      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          ticker, mode: 'deep',
          timestamp: new Date().toISOString(),
          price: finnhub.price ? '$' + finnhub.price.toFixed(2) : null,
          changePercent: finnhub.change?.toFixed(2),
          companyName: finnhub.companyName,
          analysis,
          sources: {
            finnhub: true,
            secForm4: sec.form4Filings + ' filings',
            secActivist: sec.hasActivist ? 'ACTIVIST FILING DETECTED' : 'None',
            govContracts: gov.total ? '$' + (gov.total/1e6).toFixed(1) + 'M' : 'None',
            patents: patents.count + ' recent patents',
            news: finnhub.news?.length + ' headlines'
          },
          rawData: {
            pe: finnhub.pe,
            revenueGrowth: finnhub.revenueGrowth,
            grossMargin: finnhub.grossMargin,
            fcfMargin: finnhub.fcfMargin,
            roe: finnhub.roe,
            week52High: finnhub.week52High,
            week52Low: finnhub.week52Low,
            nextEarnings: finnhub.nextEarnings,
            recommendation: finnhub.recommendation,
            topNews: finnhub.news?.slice(0,3).map(n => n.headline),
            insiderFilings: sec.form4Filings,
            hasActivist: sec.hasActivist,
            govContractTotal: gov.total,
            govContracts: gov.contracts,
            patentCount: patents.count,
            patentTitles: patents.patents?.slice(0,3).map(p => p.patent_title)
          }
        })
      };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid mode. Use ?mode=fast or ?mode=deep' }) };

  } catch(e) {
    console.error('Agent v3 error:', e.message, e.stack);
    return { statusCode: 500, headers, body: JSON.stringify({ 
      error: e.message, 
      stack: e.stack?.split('\n').slice(0,3).join(' | '),
      ticker 
    }) };
  }
};
