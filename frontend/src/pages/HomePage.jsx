import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getFarmers, getSoilReadings, getSeeds, getDiagnoses, getHealth } from '../api';

export default function HomePage() {
  const [stats, setStats] = useState({
    farmers: 0,
    soilReadings: 0,
    seeds: 0,
    diagnoses: 0,
    health: 'Checking...',
  });
  const [recentReadings, setRecentReadings] = useState([]);
  const [recentDiagnoses, setRecentDiagnoses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [farmers, soil, seeds, diags, health] = await Promise.allSettled([
          getFarmers(0, 10),
          getSoilReadings(null, 0, 5),
          getSeeds({ limit: 10 }),
          getDiagnoses(null, 0, 5),
          getHealth(),
        ]);

        setStats({
          farmers: farmers.status === 'fulfilled' ? farmers.value.length : 0,
          soilReadings: soil.status === 'fulfilled' ? soil.value.length : 0,
          seeds: seeds.status === 'fulfilled' ? seeds.value.length : 0,
          diagnoses: diags.status === 'fulfilled' ? diags.value.length : 0,
          health: health.status === 'fulfilled' && (health.value.status === 'ok' || health.value.status === 'healthy') ? 'Online' : 'Degraded',
        });

        if (soil.status === 'fulfilled') setRecentReadings(soil.value.slice(0, 4));
        if (diags.status === 'fulfilled') setRecentDiagnoses(diags.value.slice(0, 4));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <div>
      {/* Top Banner / System Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--gray-900)' }}>
            Welcome to AgroIn Advisory Platform
          </h1>
          <p style={{ color: 'var(--gray-500)', fontSize: '0.9rem', marginTop: '2px' }}>
            Autonomous rover telemetry, AI disease detection & farmer-to-farmer marketplace
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className={`badge ${stats.health === 'Online' ? 'badge-green' : 'badge-amber'}`}>
            ● System: {stats.health}
          </span>
          <span className="badge badge-sky">Rover Fleet: Active</span>
        </div>
      </div>

      {error && <div className="error-alert">Error loading dashboard: {error}</div>}

      {/* Metrics Row */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon green">👨‍🌾</div>
          <div>
            <div className="stat-value">{loading ? '...' : stats.farmers}</div>
            <div className="stat-label">Registered Farmers</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon sky">🧪</div>
          <div>
            <div className="stat-value">{loading ? '...' : stats.soilReadings}</div>
            <div className="stat-label">Soil Telemetry Samples</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon red">🔬</div>
          <div>
            <div className="stat-value">{loading ? '...' : stats.diagnoses}</div>
            <div className="stat-label">Crop Diagnoses</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon amber">🌱</div>
          <div>
            <div className="stat-value">{loading ? '...' : stats.seeds}</div>
            <div className="stat-label">Active Seed Listings</div>
          </div>
        </div>
      </div>

      {/* Quick Action Bar */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <span className="card-title">⚡ Quick Operations</span>
        </div>
        <div className="card-body" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link to="/field-monitoring" className="btn btn-primary" style={{ backgroundColor: '#059669', borderColor: '#059669' }}>
            <span>🌾</span> Agricultural Land Monitoring (Field 01)
          </Link>
          <Link to="/weather" className="btn btn-secondary">
            <span>🌐</span> 3-Month Weather Forecast
          </Link>
          <Link to="/iot" className="btn btn-secondary">
            <span>📡</span> ESP32 Sensors Live
          </Link>
          <Link to="/farmers" className="btn btn-secondary">
            <span>👨‍🌾</span> Manage Farmers
          </Link>
          <Link to="/diagnose" className="btn btn-secondary">
            <span>🔬</span> Diagnose Plant Photo
          </Link>
          <Link to="/soil" className="btn btn-secondary">
            <span>🧪</span> View Soil Readings
          </Link>
        </div>
      </div>

      {/* Two Column Layout for Recents */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        {/* Recent Diagnoses */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">🔬 Recent Plant Diagnoses</span>
            <Link to="/diagnose" className="badge badge-outline">View All →</Link>
          </div>
          <div className="card-body">
            {loading ? (
              <div className="spinner-wrap"><div className="spinner"></div></div>
            ) : recentDiagnoses.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px' }}>
                <div className="empty-icon">🍃</div>
                <p>No diagnoses recorded yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {recentDiagnoses.map((d) => (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--gray-50)', borderRadius: 'var(--radius-sm)' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--gray-900)' }}>
                        {d.crop} - <span style={{ color: 'var(--green-800)' }}>{d.disease_name}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>
                        Confidence: {(d.confidence * 100).toFixed(0)}% • Source: {d.source}
                      </div>
                    </div>
                    {d.needs_kvk_review ? (
                      <span className="badge badge-amber">KVK Review</span>
                    ) : (
                      <span className="badge badge-green">Verified</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Soil Telemetry */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">🧪 Latest Rover Soil Telemetry</span>
            <Link to="/soil" className="badge badge-outline">View All →</Link>
          </div>
          <div className="card-body">
            {loading ? (
              <div className="spinner-wrap"><div className="spinner"></div></div>
            ) : recentReadings.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px' }}>
                <div className="empty-icon">🌱</div>
                <p>No soil telemetry recorded yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {recentReadings.map((r) => (
                  <div key={r.id} style={{ padding: '12px 14px', background: 'var(--gray-50)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--gray-600)' }}>
                        Sample #{r.id} {r.farmer_id ? `• Farmer #${r.farmer_id}` : ''}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--gray-400)' }}>
                        {r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : 'Just now'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '0.8rem', fontWeight: 600 }}>
                      <span style={{ color: 'var(--green-700)' }}>N: {r.nitrogen ?? '-'}</span>
                      <span style={{ color: 'var(--amber-600)' }}>P: {r.phosphorus ?? '-'}</span>
                      <span style={{ color: 'var(--sky-600)' }}>K: {r.potassium ?? '-'}</span>
                      <span>pH: {r.ph ?? '-'}</span>
                      <span>Moist: {r.moisture ?? '-'}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
