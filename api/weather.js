function wmoToForecast(code) {
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mostly Sunny';
  if (code === 2) return 'Partly Cloudy';
  if (code === 3) return 'Overcast';
  if (code >= 45 && code <= 48) return 'Fog';
  if (code >= 51 && code <= 55) return 'Light Drizzle';
  if (code >= 61 && code <= 65) return 'Rain';
  if (code >= 66 && code <= 67) return 'Freezing Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain Showers';
  if (code >= 85 && code <= 86) return 'Snow Showers';
  if (code >= 95 && code <= 99) return 'Thunderstorm';
  return 'Clear';
}

async function fetchOpenMeteo(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m&temperature_unit=fahrenheit&forecast_hours=6`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Brinkberry/1.0 (https://brinkberry.com)' }
  });
  if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
  const data = await r.json();

  const currentTemp = Math.round(data.current?.temperature_2m ?? 65);
  const currentCode = data.current?.weather_code ?? 0;
  const currentWind = data.current?.wind_speed_10m ? `${Math.round(data.current.wind_speed_10m)} mph` : '5 mph';

  const hourlyTimes = data.hourly?.time || [];
  const hourlyTemps = data.hourly?.temperature_2m || [];
  const hourlyPrecip = data.hourly?.precipitation_probability || [];
  const hourlyCodes = data.hourly?.weather_code || [];
  const hourlyWinds = data.hourly?.wind_speed_10m || [];

  const periods = hourlyTimes.slice(0, 6).map((t, idx) => ({
    startTime: t,
    temperature: Math.round(hourlyTemps[idx] ?? currentTemp),
    temperatureUnit: 'F',
    shortForecast: wmoToForecast(hourlyCodes[idx] ?? currentCode),
    precipProbability: Number(hourlyPrecip[idx] ?? 0),
    windSpeed: `${Math.round(hourlyWinds[idx] ?? 5)} mph`,
    windDirection: 'SW'
  }));

  const first = periods[0] || {
    startTime: new Date().toISOString(),
    temperature: currentTemp,
    temperatureUnit: 'F',
    shortForecast: wmoToForecast(currentCode),
    precipProbability: Number(hourlyPrecip[0] ?? 0),
    windSpeed: currentWind,
    windDirection: 'SW'
  };

  const maxPrecip = Math.max(0, ...periods.slice(0, 3).map(x => Number(x.precipProbability || 0)));

  return {
    current: first,
    nextHours: periods,
    maxPrecipNext3h: maxPrecip,
    planBWeather: maxPrecip >= 45
  };
}

async function fetchNws(lat, lon) {
  const headers = { 'User-Agent': 'Brinkberry/1.0 (https://brinkberry.com)', 'Accept': 'application/geo+json' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1800);

  try {
    const p = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, { headers, signal: controller.signal });
    if (!p.ok) throw new Error(`NWS points ${p.status}`);
    const pj = await p.json();
    const hourly = pj?.properties?.forecastHourly;
    if (!hourly) throw new Error('NWS hourly forecast unavailable');
    const f = await fetch(hourly, { headers, signal: controller.signal });
    if (!f.ok) throw new Error(`NWS hourly ${f.status}`);
    const fj = await f.json();
    const periods = (fj?.properties?.periods || []).slice(0, 6).map(x => ({
      startTime: x.startTime,
      temperature: x.temperature,
      temperatureUnit: x.temperatureUnit,
      shortForecast: x.shortForecast,
      precipProbability: x.probabilityOfPrecipitation?.value ?? null,
      windSpeed: x.windSpeed,
      windDirection: x.windDirection
    }));
    const first = periods[0] || null;
    const maxPrecip = Math.max(0, ...periods.slice(0, 3).map(x => Number(x.precipProbability || 0)));
    return {
      current: first,
      nextHours: periods,
      maxPrecipNext3h: maxPrecip,
      planBWeather: maxPrecip >= 45
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async (req, res) => {
  try {
    const u = new URL(req.url, 'https://brinkberry.local');
    const lat = Number(u.searchParams.get('lat'));
    const lon = Number(u.searchParams.get('lng') ?? u.searchParams.get('lon'));

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: 'Location required' });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');

    // Try NWS first for US coordinates, but seamlessly fall back to Open-Meteo worldwide
    try {
      const nwsResult = await fetchNws(lat, lon);
      if (nwsResult && nwsResult.current) {
        return res.status(200).json(nwsResult);
      }
    } catch (_) {
      // Fallback to worldwide Open-Meteo
    }

    const openMeteoResult = await fetchOpenMeteo(lat, lon);
    return res.status(200).json(openMeteoResult);
  } catch (e) {
    console.error('Weather error:', e.message || e);
    res.status(503).json({ error: 'Weather unavailable' });
  }
};
