import { useState, useEffect } from 'react';
import { getWeather, getWeatherLocation } from '../api';

const POPULAR_LOCATIONS = [
  { name: 'Nagpur, Maharashtra', lat: 21.1458, lon: 79.0882 },
  { name: 'Ludhiana, Punjab', lat: 30.9010, lon: 75.8573 },
  { name: 'Nashik, Maharashtra', lat: 19.9975, lon: 73.7898 },
  { name: 'Bengaluru, Karnataka', lat: 12.9716, lon: 77.5946 },
  { name: 'Varanasi, Uttar Pradesh', lat: 25.3176, lon: 82.9739 },
  { name: 'Guntur, Andhra Pradesh', lat: 16.3067, lon: 80.4365 },
];

export default function WeatherPage() {
  const [selectedLoc, setSelectedLoc] = useState(POPULAR_LOCATIONS[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  
  const [weatherData, setWeatherData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [mapMode, setMapMode] = useState('earth'); // 'earth' or 'roadmap'

  const fetchWeather = async (lat, lon, name) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getWeather(lat, lon, name);
      setWeatherData(data);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to load weather prediction');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeather(selectedLoc.lat, selectedLoc.lon, selectedLoc.name);
  }, [selectedLoc]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await getWeatherLocation(searchQuery);
      setSearchResults(Array.isArray(results) ? results : []);
    } catch (err) {
      console.error(err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const selectLocation = (item) => {
    const locName = `${item.name}${item.admin1 ? ', ' + item.admin1 : ''}, ${item.country}`;
    const newLoc = { name: locName, lat: item.latitude, lon: item.longitude };
    setSelectedLoc(newLoc);
    setSearchResults([]);
    setSearchQuery('');
  };

  const getWmoIcon = (code) => {
    if (code === 0 || code === 1) return '☀️';
    if (code === 2 || code === 3) return '⛅';
    if (code >= 51 && code <= 65) return '🌧️';
    if (code >= 80 && code <= 82) return '🌦️';
    if (code >= 95) return '🌩️';
    return '🌡️';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Search & Location Bar */}
      <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-surface, #ffffff)', borderRadius: '12px', border: '1px solid var(--border-color, #e2e8f0)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b' }}>
              🌍 Google Earth & Climate Intelligence
            </h3>
            <p style={{ margin: '0.25rem 0 0 0', color: '#64748b', fontSize: '0.9rem' }}>
              Location: <strong>{selectedLoc.name}</strong> ({selectedLoc.lat.toFixed(4)}° N, {selectedLoc.lon.toFixed(4)}° E)
            </p>
          </div>

          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', position: 'relative', flex: '1 1 300px', maxWidth: '450px' }}>
            <input
              type="text"
              placeholder="Search city/region (e.g. Pune, Punjab)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                padding: '0.6rem 1rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.95rem'
              }}
            />
            <button
              type="submit"
              disabled={searching}
              className="btn btn-primary"
              style={{
                padding: '0.6rem 1.2rem',
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              {searching ? 'Searching...' : '🔍 Search'}
            </button>

            {searchResults.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                backgroundColor: '#fff',
                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                borderRadius: '8px',
                zIndex: 50,
                marginTop: '4px',
                border: '1px solid #e2e8f0',
                maxHeight: '220px',
                overflowY: 'auto'
              }}>
                {searchResults.map((r, idx) => (
                  <div
                    key={idx}
                    onClick={() => selectLocation(r)}
                    style={{
                      padding: '0.75rem 1rem',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f1f5f9',
                      fontSize: '0.9rem'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                  >
                    📍 <strong>{r.name}</strong> {r.admin1 ? `, ${r.admin1}` : ''} ({r.country})
                  </div>
                ))}
              </div>
            )}
          </form>
        </div>

        {/* Quick location chips */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <span style={{ fontSize: '0.85rem', color: '#64748b', alignSelf: 'center', fontWeight: 500 }}>Presets:</span>
          {POPULAR_LOCATIONS.map((loc, i) => (
            <button
              key={i}
              onClick={() => setSelectedLoc(loc)}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: '20px',
                border: selectedLoc.name === loc.name ? '1px solid #2563eb' : '1px solid #e2e8f0',
                backgroundColor: selectedLoc.name === loc.name ? '#eff6ff' : '#f8fafc',
                color: selectedLoc.name === loc.name ? '#1d4ed8' : '#475569',
                fontSize: '0.85rem',
                cursor: 'pointer',
                fontWeight: selectedLoc.name === loc.name ? 600 : 400
              }}
            >
              📍 {loc.name.split(',')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Google Earth View + Current Weather */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
        
        {/* Embedded Google Earth / Google Satellite Map */}
        <div className="card" style={{ padding: '1.25rem', borderRadius: '12px', background: '#fff', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h4 style={{ margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🌐 Satellite & Earth View
            </h4>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button
                onClick={() => setMapMode('earth')}
                style={{
                  padding: '0.25rem 0.6rem',
                  fontSize: '0.8rem',
                  borderRadius: '4px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: mapMode === 'earth' ? '#0f172a' : '#fff',
                  color: mapMode === 'earth' ? '#fff' : '#334155',
                  cursor: 'pointer'
                }}
              >
                Satellite (Earth)
              </button>
              <button
                onClick={() => setMapMode('roadmap')}
                style={{
                  padding: '0.25rem 0.6rem',
                  fontSize: '0.8rem',
                  borderRadius: '4px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: mapMode === 'roadmap' ? '#0f172a' : '#fff',
                  color: mapMode === 'roadmap' ? '#fff' : '#334155',
                  cursor: 'pointer'
                }}
              >
                Map
              </button>
            </div>
          </div>
          
          <div style={{ position: 'relative', width: '100%', height: '320px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #cbd5e1' }}>
            <iframe
              title="Google Earth View"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              loading="lazy"
              allowFullScreen
              src={`https://maps.google.com/maps?q=${selectedLoc.lat},${selectedLoc.lon}&t=${mapMode === 'earth' ? 'k' : 'm'}&z=11&ie=UTF8&iwloc=&output=embed`}
            />
          </div>
          <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#64748b' }}>
            <span>Lat: {selectedLoc.lat.toFixed(4)}°</span>
            <span>Lon: {selectedLoc.lon.toFixed(4)}°</span>
            <a
              href={`https://earth.google.com/web/@${selectedLoc.lat},${selectedLoc.lon},300a,1000d,35y,0h,0t,0r`}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}
            >
              Open in 3D Google Earth ↗
            </a>
          </div>
        </div>

        {/* Current Weather Card */}
        <div className="card" style={{ padding: '1.25rem', borderRadius: '12px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#fff' }}>
          <h4 style={{ margin: '0 0 1rem 0', color: '#94a3b8', fontSize: '0.95rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Current Weather Conditions
          </h4>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: '#cbd5e1' }}>Loading weather report...</div>
          ) : error ? (
            <div style={{ color: '#f87171', padding: '1rem' }}>Error: {error}</div>
          ) : weatherData?.current ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '3.2rem', fontWeight: 700, lineHeight: 1 }}>
                    {weatherData.current.temperature_2m ?? '--'}°C
                  </div>
                  <div style={{ color: '#cbd5e1', marginTop: '0.25rem', fontSize: '1rem' }}>
                    Feels like {weatherData.current.apparent_temperature ?? '--'}°C • {weatherData.current.condition ?? 'Clear'}
                  </div>
                </div>
                <div style={{ fontSize: '3.5rem' }}>
                  {getWmoIcon(weatherData.current.weather_code)}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1.5rem' }}>
                <div style={{ background: 'rgba(255,255,255,0.08)', padding: '0.75rem', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>💧 Humidity</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: '0.2rem' }}>
                    {weatherData.current.relative_humidity_2m ?? '--'} %
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.08)', padding: '0.75rem', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>💨 Wind Speed</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: '0.2rem' }}>
                    {weatherData.current.wind_speed_10m ?? '--'} km/h
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.08)', padding: '0.75rem', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>🌧️ Precipitation</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: '0.2rem' }}>
                    {weatherData.current.precipitation ?? 0} mm
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.08)', padding: '0.75rem', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>☀️ UV Index</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: '0.2rem' }}>
                    {weatherData.current.uv_index ?? '--'}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

      </div>

      {/* 3-MONTH SEASONAL WEATHER PREDICTION & AGRICULTURAL OUTLOOK */}
      <div className="card" style={{ padding: '1.5rem', borderRadius: '12px', background: '#fff', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📅 3-Month Seasonal Weather Report & Crop Advisory
            </h3>
            <p style={{ margin: '0.25rem 0 0 0', color: '#64748b', fontSize: '0.9rem' }}>
              Quarterly climate outlook based on Open-Meteo & historical satellite telemetry for agricultural planning
            </p>
          </div>
          <span style={{ padding: '0.25rem 0.75rem', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600 }}>
            90-Day Outlook
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Generating 3-month climate report...</div>
        ) : weatherData?.seasonal_outlook ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            {weatherData.seasonal_outlook.map((monthData, idx) => (
              <div
                key={idx}
                style={{
                  padding: '1.25rem',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: idx === 0 ? 'linear-gradient(to bottom, #eff6ff, #ffffff)' : '#f8fafc',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#1e293b', fontWeight: 700 }}>
                    {monthData.month}
                  </h4>
                  <span style={{
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    backgroundColor: idx === 0 ? '#2563eb' : '#64748b',
                    color: '#fff',
                    fontWeight: 600
                  }}>
                    {idx === 0 ? 'Current Month' : `Month +${idx}`}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.9rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e2e8f0', paddingBottom: '0.4rem' }}>
                    <span style={{ color: '#64748b' }}>🌡️ Temperature Range:</span>
                    <strong style={{ color: '#0f172a' }}>
                      {monthData.avg_temp_min ?? '--'}°C – {monthData.avg_temp_max ?? '--'}°C
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e2e8f0', paddingBottom: '0.4rem' }}>
                    <span style={{ color: '#64748b' }}>🌧️ Projected Rainfall:</span>
                    <strong style={{ color: '#2563eb' }}>
                      {monthData.total_rainfall_mm ?? 0} mm
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e2e8f0', paddingBottom: '0.4rem' }}>
                    <span style={{ color: '#64748b' }}>☔ Expected Rainy Days:</span>
                    <strong style={{ color: '#0f172a' }}>
                      {monthData.rainy_days ?? 0} days
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e2e8f0', paddingBottom: '0.4rem' }}>
                    <span style={{ color: '#64748b' }}>💧 Avg Humidity:</span>
                    <strong style={{ color: '#0f172a' }}>
                      {monthData.avg_humidity ?? '--'} %
                    </strong>
                  </div>
                </div>

                <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}>
                  <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>💡 Agronomic Advisory:</div>
                  <div style={{ color: '#475569', lineHeight: 1.4 }}>
                    {monthData.total_rainfall_mm > 100
                      ? 'High precipitation expected. Plan proper field drainage, avoid over-fertilizing before heavy rain, and protect crops from fungal infections.'
                      : monthData.total_rainfall_mm > 40
                      ? 'Moderate rainfall projected. Suitable for sowing Kharif/Rabi crops. Monitor soil moisture using IoT sensors.'
                      : 'Low rainfall / dry spell expected. Ensure drip or sprinkler irrigation is scheduled. Conserve soil moisture using mulching.'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* 16-Day Forecast Daily Slider / Grid */}
      <div className="card" style={{ padding: '1.5rem', borderRadius: '12px', background: '#fff', border: '1px solid #e2e8f0' }}>
        <h3 style={{ margin: '0 0 1rem 0', color: '#0f172a', fontSize: '1.2rem' }}>
          🌤️ 16-Day Detailed Daily Weather Forecast
        </h3>
        
        {loading ? (
          <div style={{ color: '#64748b' }}>Loading daily forecast...</div>
        ) : weatherData?.daily_forecast ? (
          <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '0.75rem' }}>
            {weatherData.daily_forecast.map((day, i) => (
              <div
                key={i}
                style={{
                  minWidth: '130px',
                  padding: '1rem',
                  borderRadius: '8px',
                  border: i === 0 ? '2px solid #2563eb' : '1px solid #e2e8f0',
                  backgroundColor: i === 0 ? '#eff6ff' : '#f8fafc',
                  textAlign: 'center',
                  flexShrink: 0
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#334155' }}>
                  {i === 0 ? 'Today' : new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
                <div style={{ fontSize: '2rem', margin: '0.4rem 0' }}>
                  {getWmoIcon(day.weather_code)}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', minHeight: '2.4em' }}>
                  {day.condition}
                </div>
                <div style={{ marginTop: '0.5rem', fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>
                  {day.temp_max ?? '--'}° <span style={{ color: '#94a3b8', fontWeight: 400 }}>{day.temp_min ?? '--'}°</span>
                </div>
                {day.precipitation_sum > 0 && (
                  <div style={{ fontSize: '0.75rem', color: '#2563eb', marginTop: '0.25rem' }}>
                    💧 {day.precipitation_sum} mm
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
