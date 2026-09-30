/**
 * IoTPage.jsx – Real-time ESP32 Sensor Dashboard
 *
 * Polls GET /sensor-data every 1 second and renders:
 *   • A status bar (backend online/offline, ESP32 online/offline, last updated)
 *   • A large soil status hero card (WET / DRY with animated ring)
 *   • Metric cards for CO₂, Nitrogen, Phosphorus, Potassium (shown only when data exists)
 *   • A history table of the last 50 readings
 *
 * Architecture: React → FastAPI (GET /sensor-data) — the frontend never talks to the ESP32 directly.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = 'http://localhost:8000';
const POLL_INTERVAL_MS = 1000;         // How often React fetches the latest reading
const ESP32_TIMEOUT_S  = 10;           // Seconds without data → ESP32 considered OFFLINE

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleTimeString(undefined, { hour12: false });
}

function secondsAgo(isoString) {
  if (!isoString) return Infinity;
  return (Date.now() - new Date(isoString).getTime()) / 1000;
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Dark status bar at the top of the page */
function StatusBar({ backendOnline, esp32Online, lastUpdated }) {
  const backendState = backendOnline ? 'online' : 'offline';
  const esp32State   = esp32Online  ? 'online' : lastUpdated ? 'offline' : 'waiting';

  return (
    <div className="iot-status-bar">
      <div className="iot-status-item">
        <div className={`iot-status-dot ${backendState}`} />
        <span className="iot-status-label">Backend:</span>
        <span className="iot-status-value">{backendOnline ? 'ONLINE' : 'OFFLINE'}</span>
      </div>

      <div className="iot-status-divider" />

      <div className="iot-status-item">
        <div className={`iot-status-dot ${esp32State}`} />
        <span className="iot-status-label">ESP32:</span>
        <span className="iot-status-value">
          {esp32Online ? 'ONLINE' : lastUpdated ? 'OFFLINE' : 'WAITING'}
        </span>
      </div>

      <div className="iot-status-divider" />

      <div className="iot-status-item">
        <span className="iot-status-label">Sensor:</span>
        <span className="iot-status-value">
          {esp32Online ? 'CONNECTED' : lastUpdated ? 'DISCONNECTED' : 'NOT DETECTED'}
        </span>
      </div>

      {lastUpdated && (
        <div className="iot-last-updated">
          Last updated: {formatTime(lastUpdated)}
        </div>
      )}
    </div>
  );
}

/** Animated hero card showing WET / DRY */
function SoilHeroCard({ soilStatus }) {
  if (!soilStatus) {
    return (
      <div className="soil-hero-card" style={{ marginBottom: 20 }}>
        <div className="soil-hero-icon none">💧</div>
        <div className="soil-hero-info">
          <div className="soil-hero-label">Soil Moisture Status</div>
          <div className="soil-hero-status none">Waiting for sensor data…</div>
          <div className="soil-hero-sub">
            Make sure the ESP32 is connected to Wi-Fi and sending data.
          </div>
        </div>
      </div>
    );
  }

  const isWet = soilStatus === 'WET';
  const cls   = soilStatus.toLowerCase();

  return (
    <div className="soil-hero-card" style={{ marginBottom: 20 }}>
      <div className={`soil-hero-icon ${cls}`}>
        {isWet ? '💧' : '🌵'}
      </div>
      <div className="soil-hero-info">
        <div className="soil-hero-label">Soil Moisture Status</div>
        <div className={`soil-hero-status ${cls}`}>{soilStatus}</div>
        <div className="soil-hero-sub">
          {isWet
            ? 'Soil moisture is above the sensor threshold — good irrigation level.'
            : 'Soil is dry — consider irrigation if crop requires moisture.'}
        </div>
      </div>
    </div>
  );
}

/** A single metric card (CO₂, N, P, K) */
function MetricCard({ type, icon, label, value, unit }) {
  return (
    <div className={`iot-metric-card ${type}`}>
      <div className="iot-metric-icon">{icon}</div>
      <div className="iot-metric-label">{label}</div>
      {value !== null && value !== undefined ? (
        <div className="iot-metric-value">
          {typeof value === 'number' ? value.toFixed(1) : value}
          <span className="iot-metric-unit">{unit}</span>
        </div>
      ) : (
        <div className="iot-metric-na">Sensor not connected</div>
      )}
    </div>
  );
}

/** History table */
function HistoryTable({ readings }) {
  if (!readings.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📋</div>
        <h3>No history yet</h3>
        <p>Readings will appear here once the ESP32 starts sending data.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Time</th>
            <th>Soil Status</th>
            <th>CO₂ (ppm)</th>
            <th>N (mg/kg)</th>
            <th>P (mg/kg)</th>
            <th>K (mg/kg)</th>
          </tr>
        </thead>
        <tbody>
          {readings.map((r) => {
            const cls = r.soil_status?.toLowerCase() ?? 'dry';
            return (
              <tr key={r.id}>
                <td style={{ color: 'var(--gray-400)', fontSize: '0.78rem' }}>{r.id}</td>
                <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.85rem' }}>
                  {formatTime(r.timestamp)}
                </td>
                <td>
                  <span className={`soil-badge ${cls}`}>
                    {cls === 'wet' ? '💧' : '🌵'} {r.soil_status}
                  </span>
                </td>
                <td>{r.co2 != null ? r.co2.toFixed(1) : <span style={{ color: 'var(--gray-300)' }}>—</span>}</td>
                <td>{r.nitrogen   != null ? r.nitrogen.toFixed(1)   : <span style={{ color: 'var(--gray-300)' }}>—</span>}</td>
                <td>{r.phosphorus != null ? r.phosphorus.toFixed(1) : <span style={{ color: 'var(--gray-300)' }}>—</span>}</td>
                <td>{r.potassium  != null ? r.potassium.toFixed(1)  : <span style={{ color: 'var(--gray-300)' }}>—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


// ── Main Page ─────────────────────────────────────────────────────────────────

export default function IoTPage() {
  const [latest, setLatest]         = useState(null);    // SensorDataOut from GET /sensor-data
  const [history, setHistory]       = useState([]);      // array of SensorReadingHistoryItem
  const [backendOnline, setBackend] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // ── Derived state ────────────────────────────────────────────────────────
  const lastUpdated = latest?.last_updated ?? null;
  const esp32Online = lastUpdated
    ? secondsAgo(lastUpdated) < ESP32_TIMEOUT_S
    : false;

  // ── Fetch latest sensor data (runs every POLL_INTERVAL_MS) ───────────────
  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/sensor-data`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLatest(data);
      setBackend(true);
      setFetchError(null);
    } catch (err) {
      setBackend(false);
      setFetchError(err.message);
    }
  }, []);

  // ── Fetch history (less frequent – every 5 s) ────────────────────────────
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/sensor-data/history?limit=50`);
      if (!res.ok) return;
      const data = await res.json();
      setHistory(data);
      setHistoryLoaded(true);
    } catch {
      // Silently ignore history errors — not critical
    }
  }, []);

  useEffect(() => {
    // Initial fetches
    fetchLatest();
    fetchHistory();

    // Polling
    const latestInterval  = setInterval(fetchLatest,  POLL_INTERVAL_MS);
    const historyInterval = setInterval(fetchHistory, 5000);

    return () => {
      clearInterval(latestInterval);
      clearInterval(historyInterval);
    };
  }, [fetchLatest, fetchHistory]);

  // ── Detect when soil status changes and update history immediately ────────
  const prevSoilRef = useRef(null);
  useEffect(() => {
    if (latest?.soil_status && latest.soil_status !== prevSoilRef.current) {
      prevSoilRef.current = latest.soil_status;
      fetchHistory();   // refresh table immediately on change
    }
  }, [latest?.soil_status, fetchHistory]);

  // ── Banners ──────────────────────────────────────────────────────────────
  const showOfflineBanner = !backendOnline;
  const showWaitingBanner = backendOnline && !latest?.soil_status;

  // ── Which metric cards to render ─────────────────────────────────────────
  // Only show cards for sensors that have EVER reported data
  const hasHistory = history.length > 0;
  const anyCO2  = hasHistory && history.some(r => r.co2 != null);
  const anyNPK  = hasHistory && history.some(r => r.nitrogen != null);

  return (
    <div>
      {/* ── Status bar ── */}
      <StatusBar
        backendOnline={backendOnline}
        esp32Online={esp32Online}
        lastUpdated={lastUpdated}
      />

      {/* ── Error banner ── */}
      {showOfflineBanner && (
        <div className="iot-offline-banner">
          <span style={{ fontSize: '1.3rem' }}>⚠️</span>
          <div>
            <strong>Backend Offline</strong> — Cannot reach the FastAPI server at{' '}
            <code style={{ fontSize: '0.82rem' }}>{API_BASE}</code>.<br />
            Start it with:{' '}
            <code style={{ fontSize: '0.82rem' }}>uvicorn main:app --host 0.0.0.0 --port 8000</code>
          </div>
        </div>
      )}

      {showWaitingBanner && (
        <div className="iot-waiting-banner">
          <span style={{ fontSize: '1.3rem' }}>⏳</span>
          <div>
            <strong>Waiting for sensor data…</strong> — Backend is running but no ESP32 data has been received yet.
            Upload the sketch to your ESP32 and make sure it&apos;s connected to the same Wi-Fi network.
          </div>
        </div>
      )}

      {/* ── Soil hero card ── */}
      <SoilHeroCard soilStatus={latest?.soil_status} />

      {/* ── Metric cards (only visible when sensors are connected) ── */}
      {(anyCO2 || anyNPK) && (
        <div className="iot-sensor-grid">
          {anyCO2 && (
            <MetricCard
              type="co2"
              icon="🌫️"
              label="CO₂"
              value={latest?.co2}
              unit="ppm"
            />
          )}
          {anyNPK && (
            <>
              <MetricCard
                type="nitrogen"
                icon="🌿"
                label="Nitrogen"
                value={latest?.nitrogen}
                unit="mg/kg"
              />
              <MetricCard
                type="phosphorus"
                icon="🔥"
                label="Phosphorus"
                value={latest?.phosphorus}
                unit="mg/kg"
              />
              <MetricCard
                type="potassium"
                icon="⚡"
                label="Potassium"
                value={latest?.potassium}
                unit="mg/kg"
              />
            </>
          )}
        </div>
      )}

      {/* ── History table ── */}
      <div className="card">
        <div className="card-header">
          <div className="iot-history-header" style={{ width: '100%' }}>
            <span className="iot-history-title">📋 Reading History</span>
            {historyLoaded && (
              <span className="iot-history-count">
                Showing last {history.length} readings
              </span>
            )}
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {!historyLoaded ? (
            <div className="spinner-wrap"><div className="spinner" /></div>
          ) : (
            <HistoryTable readings={history} />
          )}
        </div>
      </div>
    </div>
  );
}
