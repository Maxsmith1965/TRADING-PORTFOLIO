// ── MAXSMITH CAPITAL STOCK DATABASE ─────────────────────
// @netlify/blobs with MANUAL config fallback.
// Reads MY_SITE_ID + MY_BLOBS_TOKEN env vars when auto-context is missing.

const { getStore } = require('@netlify/blobs');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

const STORE = 'maxsmith-watchlist';
const KEY = 'stocks';

const DEFAULT_STOCKS = {
  blueChips: [
    { ticker:'NVDA', name:'Nvidia', pot:'blue', alloc:15, beer:60, froth:40, risk:'MEDIUM', note:'Core AI anchor - earnings August 2026', sector:'AI Infrastructure', earnings:'2026-08-20', intrinsic:175 },
    { ticker:'AVGO', name:'Broadcom', pot:'blue', alloc:12, beer:55, froth:45, risk:'MEDIUM', note:'Highest quality AI chip business', sector:'AI Infrastructure', earnings:'2026-06-12', intrinsic:380 },
    { ticker:'TSM', name:'Taiwan Semi', pot:'blue', alloc:12, beer:70, froth:30, risk:'MED-HIGH', note:'Cheapest quality chip play at 23x P/E', sector:'Semiconductor Foundry', earnings:'2026-07-17', intrinsic:180 },
    { ticker:'ASML', name:'ASML Holding', pot:'blue', alloc:10, beer:65, froth:35, risk:'MEDIUM', note:'EUV monopoly - highest beer score', sector:'Semiconductor Equipment', earnings:'2026-07-16', intrinsic:850 },
    { ticker:'MSFT', name:'Microsoft', pot:'blue', alloc:12, beer:65, froth:35, risk:'MEDIUM', note:'Azure + Copilot - most complete AI platform', sector:'Cloud / AI Platform', earnings:'2026-07-29', intrinsic:380 },
    { ticker:'AAPL', name:'Apple', pot:'blue', alloc:10, beer:65, froth:35, risk:'MEDIUM', note:'Services flywheel + AI supercycle', sector:'Consumer Technology', earnings:'2026-08-06', intrinsic:180 },
    { ticker:'GOOGL', name:'Alphabet', pot:'blue', alloc:10, beer:65, froth:35, risk:'MEDIUM', note:'Cheapest mega-cap at 19x forward P/E', sector:'Search / Cloud / AI', earnings:'2026-07-29', intrinsic:155 },
    { ticker:'META', name:'Meta Platforms', pot:'blue', alloc:10, beer:60, froth:40, risk:'MEDIUM', note:'AI advertising juggernaut - 33% revenue growth', sector:'Social Media / AI Ads', earnings:'2026-07-30', intrinsic:580 },
    { ticker:'AMZN', name:'Amazon', pot:'blue', alloc:9, beer:62, froth:38, risk:'MEDIUM', note:'AWS + Ads + Prime - three engines', sector:'Cloud / E-Commerce', earnings:'2026-08-06', intrinsic:195 }
  ],
  activeStocks: [
    { ticker:'MU', name:'Micron', pot:'active', alloc:12, beer:50, froth:50, risk:'MED-HIGH', note:'HBM memory AI supercycle', sector:'AI Memory', earnings:'2026-09-23', intrinsic:120 },
    { ticker:'CEG', name:'Constellation Energy', pot:'active', alloc:12, beer:60, froth:40, risk:'MEDIUM', note:'Nuclear power - essentially fair value at $258 intrinsic', sector:'Nuclear Power', earnings:'2026-07-30', intrinsic:258 },
    { ticker:'MBLY', name:'Mobileye', pot:'active', alloc:10, beer:55, froth:45, risk:'MEDIUM', note:'28% undervalued - best value on watchlist', sector:'Robotics / Vision', earnings:'2026-07-23', intrinsic:13.94 },
    { ticker:'CIEN', name:'Ciena', pot:'active', alloc:8, beer:55, froth:45, risk:'MEDIUM', note:'Optical networking - $7B backlog', sector:'Optical Networking', earnings:'2026-09-10', intrinsic:null },
    { ticker:'LEU', name:'Centrus Energy', pot:'active', alloc:8, beer:50, froth:50, risk:'MED-HIGH', note:'Nuclear HALEU monopoly - 3yr hold', sector:'Nuclear HALEU', earnings:'2026-08-07', intrinsic:null },
    { ticker:'SOLS', name:'Solstice Materials', pot:'active', alloc:8, beer:60, froth:40, risk:'MEDIUM', note:'Nuclear + AI chips + cooling', sector:'Nuclear / AI / Cooling', earnings:'2026-08-12', intrinsic:null },
    { ticker:'MP', name:'MP Materials', pot:'active', alloc:6, beer:50, froth:50, risk:'MED-HIGH', note:'Rare earth - government backed', sector:'Rare Earth Materials', earnings:'2026-08-05', intrinsic:null },
    { ticker:'TER', name:'Teradyne', pot:'active', alloc:6, beer:50, froth:50, risk:'MEDIUM', note:'Every robot needs testing', sector:'Robotics Testing', earnings:'2026-07-23', intrinsic:null },
    { ticker:'VRT', name:'Vertiv', pot:'active', alloc:6, beer:45, froth:55, risk:'MED-HIGH', note:'Data centre power - wait for dip', sector:'Data Centre Power', earnings:'2026-07-23', intrinsic:null },
    { ticker:'AMD', name:'AMD', pot:'active', alloc:5, beer:35, froth:65, risk:'HIGH', note:'Wait for consolidation', sector:'AI Infrastructure', earnings:'2026-07-29', intrinsic:null },
    { ticker:'WDC', name:'Western Digital', pot:'active', alloc:5, beer:55, froth:45, risk:'MED-HIGH', note:'AI storage supercycle', sector:'AI Storage', earnings:'2026-07-30', intrinsic:null },
    { ticker:'SNDK', name:'SanDisk', pot:'active', alloc:5, beer:55, froth:45, risk:'MED-HIGH', note:'NAND supercycle - wait for pullback', sector:'NAND Flash', earnings:'2026-08-13', intrinsic:null },
    { ticker:'XRP', name:'XRP / Ripple', pot:'active', alloc:3, beer:40, froth:60, risk:'HIGH', note:'CLARITY Act catalyst trade', sector:'Crypto', earnings:null, intrinsic:null },
    { ticker:'AMTM', name:'Amentum Holdings', pot:'active', alloc:7, beer:55, froth:45, risk:'MEDIUM', note:'$47.8B backlog - defensive anchor', sector:'Gov / Defence', earnings:'2026-08-07', intrinsic:null },
    { ticker:'IREN', name:'IREN Ltd', pot:'active', alloc:4, beer:30, froth:70, risk:'VERY HIGH', note:'Max 3% - Microsoft contract', sector:'AI Cloud Infrastructure', earnings:'2026-08-14', intrinsic:null },
    { ticker:'BE', name:'Bloom Energy', pot:'active', alloc:4, beer:35, froth:65, risk:'VERY HIGH', note:'Momentum trade only', sector:'Data Centre Power', earnings:'2026-07-30', intrinsic:null },
    { ticker:'TSLA', name:'Tesla', pot:'active', alloc:3, beer:25, froth:75, risk:'HIGH', note:'Optimus catalyst trade only', sector:'Robotics / EV', earnings:'2026-07-22', intrinsic:null },
    { ticker:'BMNR', name:'BitMine', pot:'active', alloc:2, beer:10, froth:90, risk:'EXTREME', note:'Crypto - 1-2% max only', sector:'Crypto', earnings:null, intrinsic:null },
    { ticker:'NBIS', name:'Nebius Group', pot:'active', alloc:5, beer:55, froth:45, risk:'MED-HIGH', note:'802% AI cloud growth - $46B Meta/MSFT backlog', sector:'AI Cloud Infrastructure', earnings:'2026-08-14', intrinsic:null },
    { ticker:'LITE', name:'Lumentum', pot:'active', alloc:5, beer:60, froth:40, risk:'MED-HIGH', note:'90% revenue growth - optical AI supercycle', sector:'Optical / Photonics', earnings:'2026-08-18', intrinsic:404 },
    { ticker:'MRVL', name:'Marvell Technology', pot:'active', alloc:5, beer:55, froth:45, risk:'MED-HIGH', note:'Custom AI silicon - $2B Nvidia investment', sector:'AI Custom Silicon', earnings:'2026-08-26', intrinsic:null },
    { ticker:'WIX', name:'Wix.com', pot:'active', alloc:4, beer:55, froth:45, risk:'MEDIUM', note:'AI website builder - $1.9B ARR', sector:'AI Web Platform', earnings:'2026-08-13', intrinsic:null },
    { ticker:'QCOM', name:'Qualcomm', pot:'active', alloc:5, beer:60, froth:40, risk:'MEDIUM', note:'Edge AI - June 24 Investor Day catalyst', sector:'Edge AI / Automotive', earnings:'2026-07-30', intrinsic:167 },
    { ticker:'TSEM', name:'Tower Semiconductor', pot:'active', alloc:4, beer:55, froth:45, risk:'MEDIUM', note:'Speciality foundry - Intel partnership', sector:'Speciality Foundry', earnings:'2026-07-28', intrinsic:null },
    { ticker:'FN', name:'Fabrinet', pot:'active', alloc:4, beer:55, froth:45, risk:'MEDIUM', note:'Optical contract manufacturing - picks and shovels', sector:'Optical Manufacturing', earnings:'2026-08-11', intrinsic:null },
    { ticker:'COHR', name:'Coherent', pot:'active', alloc:4, beer:40, froth:60, risk:'HIGH', note:'Optical - watch insider selling', sector:'Optical Networking', earnings:'2026-08-12', intrinsic:null }
  ]
};

// Open store: try automatic mode, then fall back to manual siteID+token.
function openStore() {
  try {
    return getStore(STORE);
  } catch (e) {
    const siteID = process.env.MY_SITE_ID;
    const token  = process.env.MY_BLOBS_TOKEN;
    if (!siteID || !token) {
      throw new Error('Auto-config failed and MY_SITE_ID / MY_BLOBS_TOKEN not set');
    }
    return getStore({ name: STORE, siteID, token });
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  let store;
  try {
    store = openStore();
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Store init failed', detail: e.message }) };
  }

  if (event.httpMethod === 'GET') {
    try {
      const data = await store.get(KEY, { type: 'json' });
      if (data && (data.blueChips || data.activeStocks)) {
        return { statusCode: 200, headers, body: JSON.stringify(data) };
      }
    } catch (e) {}
    try { await store.setJSON(KEY, DEFAULT_STOCKS); } catch (e) {}
    return { statusCode: 200, headers, body: JSON.stringify(DEFAULT_STOCKS) };
  }

  if (event.httpMethod === 'POST') {
    try {
      const stock = JSON.parse(event.body || '{}');
      if (!stock.ticker) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ticker required' }) };
      stock.ticker = String(stock.ticker).toUpperCase();

      let data;
      try { data = await store.get(KEY, { type: 'json' }); } catch (e) { data = null; }
      if (!data || (!data.blueChips && !data.activeStocks)) data = JSON.parse(JSON.stringify(DEFAULT_STOCKS));
      if (!Array.isArray(data.blueChips)) data.blueChips = [];
      if (!Array.isArray(data.activeStocks)) data.activeStocks = [];

      const bucket = stock.pot === 'blue' ? 'blueChips' : 'activeStocks';
      const other  = stock.pot === 'blue' ? 'activeStocks' : 'blueChips';
      data[other] = data[other].filter(s => s.ticker !== stock.ticker);
      const idx = data[bucket].findIndex(s => s.ticker === stock.ticker);
      if (idx >= 0) data[bucket][idx] = { ...data[bucket][idx], ...stock };
      else data[bucket].push(stock);

      await store.setJSON(KEY, data);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, stock }) };
    } catch (e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Write failed', detail: e.message }) };
    }
  }

  if (event.httpMethod === 'DELETE') {
    try {
      const ticker = String(event.queryStringParameters?.ticker || '').toUpperCase();
      if (!ticker) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ticker required' }) };
      let data;
      try { data = await store.get(KEY, { type: 'json' }); } catch (e) { data = null; }
      if (!data) data = JSON.parse(JSON.stringify(DEFAULT_STOCKS));
      data.blueChips = (data.blueChips || []).filter(s => s.ticker !== ticker);
      data.activeStocks = (data.activeStocks || []).filter(s => s.ticker !== ticker);
      await store.setJSON(KEY, data);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, ticker }) };
    } catch (e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Delete failed', detail: e.message }) };
    }
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};
