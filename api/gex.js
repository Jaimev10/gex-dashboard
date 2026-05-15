// api/gex.js - Serverless proxy for FlashAlpha API
// This function runs on Vercel and safely handles your API key

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { ticker, metric = 'gex', expiration } = req.query;
  const apiKey = process.env.FLASHALPHA_KEY;

  // Validate
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }
  if (!ticker) {
    return res.status(400).json({ error: 'ticker query parameter required' });
  }

  // Build FlashAlpha URL
  const endpoint = metric || 'gex';
  let url = `https://lab.flashalpha.com/v1/exposure/${endpoint}/${encodeURIComponent(ticker)}`;

  // Handle expiration parameter
  if (expiration && expiration !== 'all') {
    const expDate = getExpirationDate(expiration);
    if (expDate) {
      url += `?expiration=${expDate}`;
    }
  }

  try {
    const resp = await fetch(url, {
      headers: { 'X-Api-Key': apiKey },
      // Add timeout
      signal: AbortSignal.timeout(10000)
    });

    if (!resp.ok) {
      let errorDetail = resp.statusText;
      try {
        const json = await resp.json();
        errorDetail = json.detail || json.message || json.error || errorDetail;
      } catch (_) {
        errorDetail = await resp.text();
      }
      return res.status(resp.status).json({ 
        error: `FlashAlpha API error (${resp.status}): ${errorDetail}` 
      });
    }

    const data = await resp.json();
    
    // Cache for 15 seconds (match FlashAlpha's cache)
    res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=15');
    
    return res.json(data);
  } catch (error) {
    console.error('[gex.js error]', error);
    return res.status(500).json({ 
      error: `Server error: ${error.message}` 
    });
  }
}

function getExpirationDate(offset) {
  const d = new Date();
  if (offset === 'today' || offset === '0dte') {
    return d.toISOString().split('T')[0];
  }
  if (offset === 'nextfri') {
    // Find next Friday
    while (d.getDay() !== 5) {
      d.setDate(d.getDate() + 1);
    }
    return d.toISOString().split('T')[0];
  }
  if (offset === 'nextmonth') {
    // Last day of next month
    const m = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return m.toISOString().split('T')[0];
  }
  return null;
}
