module.exports = async (req, res) => {
  try {
    let payload = {};
    if (req.method === 'POST') {
      let body = '';
      await new Promise((resolve) => {
        req.on('data', chunk => { body += chunk; });
        req.on('end', resolve);
      });
      if (body) {
        try { payload = JSON.parse(body); } catch (_) {}
      }
    } else {
      const u = new URL(req.url, 'https://brinkberry.local');
      payload = {
        city: u.searchParams.get('city'),
        lat: Number(u.searchParams.get('lat')),
        lng: Number(u.searchParams.get('lng'))
      };
    }

    const city = String(payload.city || 'Requested City').slice(0, 100).trim();
    console.log(`[Market Request] User requested Brinkberry in: "${city}" (lat: ${payload.lat}, lng: ${payload.lng})`);

    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.status(200).json({
      success: true,
      city,
      message: `Thanks! We've recorded your market request for ${city}.`
    });
  } catch (err) {
    console.error('Market request error:', err);
    res.status(500).json({ error: 'Failed to record market request' });
  }
};
