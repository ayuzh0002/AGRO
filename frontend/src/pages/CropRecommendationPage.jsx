/**
 * CropRecommendationPage.jsx
 *
 * Fetches the AI-powered crop recommendation from the backend, which in turn
 * reads the latest ESP32 IoT sensor data + live weather and runs the
 * RandomForest ML model. Optionally enriched by Gemini AI advisory.
 */

import { useState, useEffect, useCallback } from 'react';

const API_BASE = 'http://localhost:8000';

// ── helpers ────────────────────────────────────────────────────────────────────

function fmt(v, decimals = 1, unit = '') {
  if (v === null || v === undefined) return '—';
  return `${Number(v).toFixed(decimals)}${unit}`;
}

function timeSince(iso) {
  if (!iso) return null;
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

// ── sub-components ─────────────────────────────────────────────────────────────

function DataQualityBadge({ quality }) {
  const map = {
    'full':          { label: '● Full IoT Data',        color: '#22c55e' },
    'partial':       { label: '◐ Partial IoT Data',     color: '#f59e0b' },
    'defaults-only': { label: '○ Estimated Defaults',   color: '#6b7280' },
  };
  const info = map[quality] || map['defaults-only'];
  return (
    <span style={{
      fontSize: 12, fontWeight: 700, color: info.color,
      background: `${info.color}18`, border: `1px solid ${info.color}40`,
      borderRadius: 20, padding: '3px 12px',
    }}>
      {info.label}
    </span>
  );
}

function AiSourceBadge({ source }) {
  const isGemini = source === 'gemini';
  return (
    <span style={{
      fontSize: 11, fontWeight: 700,
      color: isGemini ? '#a855f7' : '#64748b',
      background: isGemini ? '#a855f718' : '#64748b12',
      border: `1px solid ${isGemini ? '#a855f740' : '#64748b30'}`,
      borderRadius: 20, padding: '2px 10px',
    }}>
      {isGemini ? '✦ Gemini AI' : '⚙ Rule-Based'}
    </span>
  );
}

function SensorCard({ icon, label, value, unit, accent }) {
  const hasData = value !== null && value !== undefined;
  return (
    <div style={{
      background: 'var(--card-bg)',
      border: `1px solid ${accent}30`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: 14, padding: '14px 18px',
      display: 'flex', alignItems: 'center', gap: 14,
      flex: '1 1 160px', minWidth: 0,
    }}>
      <span style={{ fontSize: 26 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: hasData ? accent : 'var(--muted)' }}>
          {hasData ? `${Number(value).toFixed(1)} ${unit}` : '—'}
        </div>
      </div>
    </div>
  );
}

function CropCard({ rec, isTop }) {
  const suitColor = {
    'Highly Recommended': '#22c55e',
    'Suitable': '#3b82f6',
    'Moderate Match': '#f59e0b',
  }[rec.suitability] || '#6b7280';

  return (
    <div style={{
      background: isTop
        ? 'linear-gradient(135deg, #0f172a 0%, #1a1033 100%)'
        : 'var(--card-bg)',
      border: isTop ? '1.5px solid #7c3aed50' : '1px solid var(--border)',
      borderRadius: 18,
      padding: '22px 24px',
      position: 'relative',
      overflow: 'hidden',
      transition: 'transform 0.18s, box-shadow 0.18s',
      cursor: 'default',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.transform = 'translateY(-3px)';
      e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.35)';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = 'none';
    }}
    >
      {isTop && (
        <div style={{
          position: 'absolute', top: 14, right: 14,
          background: 'linear-gradient(90deg, #7c3aed, #a855f7)',
          color: '#fff', fontSize: 10, fontWeight: 800,
          borderRadius: 20, padding: '3px 10px', textTransform: 'uppercase', letterSpacing: 1,
        }}>
          ★ Top Pick
        </div>
      )}

      {/* Rank bubble */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 30, borderRadius: '50%',
        background: isTop ? '#7c3aed' : 'var(--border)',
        color: isTop ? '#fff' : 'var(--muted)',
        fontSize: 13, fontWeight: 800, marginBottom: 12,
      }}>
        {rec.rank}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={{ fontSize: 44 }}>{rec.icon}</span>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{rec.crop_name}</div>
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#6b7280',
            textTransform: 'uppercase', letterSpacing: 1,
          }}>{rec.category}</div>
        </div>
      </div>

      {/* Score bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Suitability Score</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: suitColor }}>{rec.score_pct.toFixed(1)}%</span>
        </div>
        <div style={{ background: 'var(--border)', borderRadius: 6, height: 7, overflow: 'hidden' }}>
          <div style={{
            width: `${Math.min(rec.score_pct, 100)}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${suitColor}80, ${suitColor})`,
            borderRadius: 6,
            transition: 'width 1s cubic-bezier(0.4,0,0.2,1)',
          }} />
        </div>
      </div>

      {/* Badge */}
      <div style={{
        display: 'inline-block',
        fontSize: 11, fontWeight: 700, color: suitColor,
        background: `${suitColor}18`, border: `1px solid ${suitColor}40`,
        borderRadius: 20, padding: '3px 12px', marginBottom: 12,
      }}>
        {rec.suitability}
      </div>

      {/* Reason */}
      <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
        {rec.reason}
      </p>
    </div>
  );
}

function ManualInputPanel({ onSubmit, loading }) {
  const [form, setForm] = useState({
    nitrogen: '', phosphorus: '', potassium: '',
    ph: '', temperature: '', humidity: '', rainfall: '',
    soil_status: 'DRY', location_name: '', top_k: 5,
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const fields = [
    { key: 'nitrogen',    label: 'Nitrogen (N)',    unit: 'mg/kg', icon: '🔬', step: 1, min: 0, max: 300 },
    { key: 'phosphorus',  label: 'Phosphorus (P)',  unit: 'mg/kg', icon: '🧪', step: 1, min: 0, max: 300 },
    { key: 'potassium',   label: 'Potassium (K)',   unit: 'mg/kg', icon: '⚗️', step: 1, min: 0, max: 300 },
    { key: 'ph',          label: 'Soil pH',         unit: '',      icon: '⚖️', step: 0.1, min: 3, max: 10 },
    { key: 'temperature', label: 'Temperature',     unit: '°C',    icon: '🌡️', step: 0.5, min: -10, max: 55 },
    { key: 'humidity',    label: 'Humidity',        unit: '%',     icon: '💧', step: 1, min: 0, max: 100 },
    { key: 'rainfall',    label: 'Monthly Rainfall',unit: 'mm',    icon: '🌧️', step: 5, min: 0, max: 500 },
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    const body = { top_k: Number(form.top_k), soil_status: form.soil_status };
    if (form.location_name) body.location_name = form.location_name;
    fields.forEach(f => {
      if (form[f.key] !== '') body[f.key] = Number(form[f.key]);
    });
    onSubmit(body);
  };

  return (
    <form onSubmit={handleSubmit} style={{
      background: 'var(--card-bg)', border: '1px solid var(--border)',
      borderRadius: 18, padding: 28,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
        {fields.map(f => (
          <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              {f.icon} {f.label} {f.unit && <span style={{ color: '#475569' }}>({f.unit})</span>}
            </span>
            <input
              type="number" step={f.step} min={f.min} max={f.max}
              placeholder="Leave blank to use IoT data"
              value={form[f.key]}
              onChange={e => set(f.key, e.target.value)}
              style={{
                background: '#0f172a', border: '1px solid var(--border)', borderRadius: 10,
                color: 'var(--text)', padding: '10px 14px', fontSize: 14,
                outline: 'none', width: '100%', boxSizing: 'border-box',
              }}
            />
          </label>
        ))}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>🌱 Soil Status</span>
          <select
            value={form.soil_status}
            onChange={e => set('soil_status', e.target.value)}
            style={{
              background: '#0f172a', border: '1px solid var(--border)', borderRadius: 10,
              color: 'var(--text)', padding: '10px 14px', fontSize: 14, outline: 'none',
            }}
          >
            <option value="DRY">DRY</option>
            <option value="WET">WET</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>📍 Region Label</span>
          <input
            type="text" placeholder="e.g. Field B – Nagpur"
            value={form.location_name}
            onChange={e => set('location_name', e.target.value)}
            style={{
              background: '#0f172a', border: '1px solid var(--border)', borderRadius: 10,
              color: 'var(--text)', padding: '10px 14px', fontSize: 14,
              outline: 'none', width: '100%', boxSizing: 'border-box',
            }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>🎯 Top Crops to Show</span>
          <select
            value={form.top_k}
            onChange={e => set('top_k', Number(e.target.value))}
            style={{
              background: '#0f172a', border: '1px solid var(--border)', borderRadius: 10,
              color: 'var(--text)', padding: '10px 14px', fontSize: 14, outline: 'none',
            }}
          >
            {[3,4,5,6,7,8,10].map(n => <option key={n} value={n}>{n} crops</option>)}
          </select>
        </label>
      </div>
      <button
        type="submit"
        disabled={loading}
        style={{
          background: 'linear-gradient(90deg, #7c3aed, #a855f7)',
          color: '#fff', border: 'none', borderRadius: 12,
          padding: '13px 36px', fontSize: 15, fontWeight: 700,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1, transition: 'opacity 0.2s',
        }}
      >
        {loading ? '⏳ Analysing…' : '🌾 Get Recommendation'}
      </button>
    </form>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function CropRecommendationPage() {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [mode, setMode]         = useState('iot');   // 'iot' | 'manual'
  const [topK, setTopK]         = useState(5);
  const [refreshTs, setRefreshTs] = useState(Date.now());

  const fetchIoT = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/crop-recommendation?top_k=${topK}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [topK]);

  const fetchManual = useCallback(async (body) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/crop-recommendation/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch IoT on mount and on refresh
  useEffect(() => {
    if (mode === 'iot') fetchIoT();
  }, [mode, refreshTs, fetchIoT]);

  const s = data?.sensor;
  const w = data?.weather;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 4px 48px' }}>

      {/* ── Hero Header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1a0a2e 50%, #0f172a 100%)',
        border: '1px solid #7c3aed30',
        borderRadius: 24, padding: '36px 40px', marginBottom: 32,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative glow */}
        <div style={{
          position: 'absolute', top: -60, right: -60,
          width: 220, height: 220, borderRadius: '50%',
          background: 'radial-gradient(circle, #7c3aed30 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -40, left: -40,
          width: 160, height: 160, borderRadius: '50%',
          background: 'radial-gradient(circle, #22c55e20 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
              <span style={{ fontSize: 42 }}>🌾</span>
              <div>
                <h2 style={{ margin: 0, fontSize: 28, fontWeight: 900, background: 'linear-gradient(90deg, #e2e8f0, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  AI Crop Recommendation
                </h2>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
                  ML model · IoT sensor data · Live weather · Gemini AI advisory
                </p>
              </div>
            </div>
            {data && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                <DataQualityBadge quality={data.data_quality} />
                <AiSourceBadge source={data.ai_source} />
                <span style={{ fontSize: 12, color: '#475569' }}>
                  📍 {data.farm_name}
                </span>
                {s?.last_updated && (
                  <span style={{ fontSize: 12, color: '#475569' }}>
                    🕐 Sensor: {timeSince(s.last_updated)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{
              background: '#0f172a', border: '1px solid var(--border)',
              borderRadius: 40, display: 'flex', padding: 4,
            }}>
              {[['iot', '📡 IoT Data'], ['manual', '✏️ Manual Input']].map(([m, label]) => (
                <button key={m} onClick={() => setMode(m)} style={{
                  background: mode === m ? '#7c3aed' : 'transparent',
                  color: mode === m ? '#fff' : '#94a3b8',
                  border: 'none', borderRadius: 36, padding: '8px 18px',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                }}>
                  {label}
                </button>
              ))}
            </div>
            {mode === 'iot' && (
              <>
                <select
                  value={topK}
                  onChange={e => setTopK(Number(e.target.value))}
                  style={{
                    background: '#0f172a', border: '1px solid var(--border)',
                    borderRadius: 10, color: 'var(--text)', padding: '8px 14px',
                    fontSize: 13, outline: 'none',
                  }}
                >
                  {[3,4,5,6,7,8,10].map(n => <option key={n} value={n}>{n} crops</option>)}
                </select>
                <button
                  id="crop-refresh-btn"
                  onClick={() => setRefreshTs(Date.now())}
                  disabled={loading}
                  style={{
                    background: 'linear-gradient(90deg, #7c3aed, #a855f7)',
                    color: '#fff', border: 'none', borderRadius: 12,
                    padding: '10px 22px', fontSize: 13, fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1, transition: 'opacity 0.2s',
                  }}
                >
                  {loading ? '⏳' : '↻ Refresh'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Manual Input Panel ── */}
      {mode === 'manual' && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ color: 'var(--text)', margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>
            ✏️ Enter Soil &amp; Climate Values
          </h3>
          <ManualInputPanel onSubmit={fetchManual} loading={loading} />
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div style={{
          background: '#7f1d1d20', border: '1px solid #ef444450',
          borderRadius: 14, padding: '16px 22px', marginBottom: 24,
          color: '#fca5a5', fontSize: 14,
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && !data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{
              background: 'var(--card-bg)', border: '1px solid var(--border)',
              borderRadius: 18, height: 160,
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
          ))}
        </div>
      )}

      {/* ── Results ── */}
      {data && (
        <>
          {/* IoT Sensor Snapshot */}
          <div style={{ marginBottom: 28 }}>
            <h3 style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, margin: '0 0 14px' }}>
              📡 IoT Sensor Snapshot
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <SensorCard icon="🌱" label="Soil Status"  value={s?.soil_status}  unit="" accent="#22c55e" />
              <SensorCard icon="🌡️" label="Temperature"  value={s?.temperature}  unit="°C"   accent="#f59e0b" />
              <SensorCard icon="💧" label="Humidity"     value={s?.humidity}     unit="%"    accent="#3b82f6" />
              <SensorCard icon="💨" label="CO₂"          value={s?.co2}          unit="ppm"  accent="#8b5cf6" />
              <SensorCard icon="🔬" label="Nitrogen"     value={s?.nitrogen}     unit="mg/kg" accent="#10b981" />
              <SensorCard icon="🧪" label="Phosphorus"   value={s?.phosphorus}   unit="mg/kg" accent="#06b6d4" />
              <SensorCard icon="⚗️" label="Potassium"    value={s?.potassium}    unit="mg/kg" accent="#f97316" />
            </div>
          </div>

          {/* Weather Snapshot */}
          {w?.available && (
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, margin: '0 0 14px' }}>
                🌤 Live Weather (Open-Meteo)
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <SensorCard icon="🌡️" label="Ambient Temp"     value={w.temperature}     unit="°C"  accent="#f59e0b" />
                <SensorCard icon="💧" label="Ambient Humidity"  value={w.humidity}         unit="%"   accent="#3b82f6" />
                <SensorCard icon="🌧️" label="Rain Probability"  value={w.rain_probability} unit="%"   accent="#60a5fa" />
                {w.rainfall_7d_avg !== null && w.rainfall_7d_avg !== undefined && (
                  <SensorCard icon="☔" label="7-day Avg Rain" value={w.rainfall_7d_avg} unit="mm/d" accent="#818cf8" />
                )}
              </div>
            </div>
          )}

          {/* AI Advisory */}
          <div style={{
            background: 'linear-gradient(135deg, #1a0a2e, #0f172a)',
            border: '1px solid #a855f730',
            borderRadius: 18, padding: '24px 28px', marginBottom: 32,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 24 }}>✦</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#e2e8f0' }}>
                  AI Agronomist Advisory
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {data.ai_source === 'gemini'
                    ? 'Powered by Gemini AI — grounded on real sensor & weather data'
                    : 'Rule-based advisory — add GEMINI_API_KEY for richer analysis'
                  }
                </div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <AiSourceBadge source={data.ai_source} />
              </div>
            </div>
            <p style={{
              margin: 0, fontSize: 15, lineHeight: 1.8,
              color: '#cbd5e1',
              borderLeft: '3px solid #7c3aed',
              paddingLeft: 18,
            }}>
              {data.ai_advisory}
            </p>
          </div>

          {/* Crop Recommendation Grid */}
          <div style={{ marginBottom: 28 }}>
            <h3 style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, margin: '0 0 18px' }}>
              🌾 Ranked Crop Recommendations
            </h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 20,
            }}>
              {data.recommendations.map((rec) => (
                <CropCard key={rec.rank} rec={rec} isTop={rec.rank === 1} />
              ))}
            </div>
          </div>

          {/* Data quality notice */}
          {data.data_quality === 'defaults-only' && (
            <div style={{
              background: '#451a0320', border: '1px solid #f59e0b40',
              borderRadius: 14, padding: '14px 20px',
              color: '#fcd34d', fontSize: 13, lineHeight: 1.6,
            }}>
              ⚠️ <strong>No live IoT sensor data found.</strong> Recommendations are based on
              statistical defaults. Connect the ESP32 sensor node and push readings to
              <code style={{ background: '#0f172a', padding: '1px 6px', borderRadius: 4, marginLeft: 4 }}>
                POST /sensor-data
              </code> for personalised results.
            </div>
          )}
        </>
      )}

      {/* Loading overlay on refresh */}
      {loading && data && (
        <div style={{
          position: 'fixed', bottom: 32, right: 32,
          background: '#7c3aed', color: '#fff',
          borderRadius: 40, padding: '10px 22px',
          fontSize: 13, fontWeight: 700,
          boxShadow: '0 8px 32px rgba(124,58,237,0.5)',
          zIndex: 1000,
        }}>
          ⏳ Refreshing recommendations…
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
