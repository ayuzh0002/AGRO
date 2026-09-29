import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getDashboard, getFarmers } from '../api';

export default function DashboardPage() {
  const { farmerId } = useParams();
  const navigate = useNavigate();

  const [allFarmers, setAllFarmers] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getFarmers(0, 100)
      .then((farmers) => setAllFarmers(farmers))
      .catch((err) => console.error('Failed to load farmers list:', err));
  }, []);

  useEffect(() => {
    if (!farmerId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    getDashboard(farmerId)
      .then((res) => {
        if (isMounted) setData(res);
      })
      .catch((err) => {
        if (isMounted) setError(err.message);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [farmerId]);

  if (loading) {
    return (
      <div className="spinner-wrap" style={{ minHeight: '300px' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <div className="error-alert">
          <strong>Error loading dashboard:</strong> {error || 'Farmer not found'}
        </div>
        <Link to="/farmers" className="btn btn-secondary">
          ← Back to Farmers List
        </Link>
      </div>
    );
  }

  const { farmer, latest_soil_reading, soil_indicators, crop_recommendations, past_diagnoses, total_diagnoses, total_soil_readings } = data;

  return (
    <div>
      {/* Farmer Switcher & Profile Header Card */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.8rem' }}>👨‍🌾</span>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--gray-900)' }}>
                {farmer.name}
              </h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                📞 {farmer.phone} • 📍 {farmer.location}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray-600)' }}>
              Switch Farmer:
            </label>
            <select
              className="form-select"
              style={{ width: 'auto', minWidth: '180px' }}
              value={farmer.id}
              onChange={(e) => navigate(`/dashboard/${e.target.value}`)}
            >
              {allFarmers.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} (#{f.id})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div style={{ padding: '12px', background: 'var(--gray-50)', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase' }}>
                Assigned Plot / Field
              </span>
              <div style={{ fontWeight: 700, marginTop: '4px', color: 'var(--gray-800)' }}>
                {farmer.assigned_field || 'Not specified'}
              </div>
            </div>

            <div style={{ padding: '12px', background: 'var(--gray-50)', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase' }}>
                Field Coordinates
              </span>
              <div style={{ fontWeight: 700, marginTop: '4px', color: 'var(--gray-800)' }}>
                {farmer.field_lat && farmer.field_lon
                  ? `${farmer.field_lat.toFixed(4)}° N, ${farmer.field_lon.toFixed(4)}° E`
                  : 'Coordinates pending rover mapping'}
              </div>
            </div>

            <div style={{ padding: '12px', background: 'var(--gray-50)', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase' }}>
                Total Rover Readings
              </span>
              <div style={{ fontWeight: 800, fontSize: '1.2rem', marginTop: '2px', color: 'var(--green-700)' }}>
                {total_soil_readings} samples
              </div>
            </div>

            <div style={{ padding: '12px', background: 'var(--gray-50)', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase' }}>
                Total Disease Scans
              </span>
              <div style={{ fontWeight: 800, fontSize: '1.2rem', marginTop: '2px', color: 'var(--amber-600)' }}>
                {total_diagnoses} diagnoses
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Soil Health Status Indicators */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <span className="card-title">🧪 Soil Health & Nutrients (Rover Telemetry)</span>
          {latest_soil_reading ? (
            <span className="badge badge-sky">
              Last Sample: {new Date(latest_soil_reading.timestamp).toLocaleString()}
            </span>
          ) : (
            <span className="badge badge-gray">No reading yet</span>
          )}
        </div>
        <div className="card-body">
          {!latest_soil_reading ? (
            <div className="empty-state" style={{ padding: '24px' }}>
              <div className="empty-icon">🏜️</div>
              <h3>No soil readings recorded yet for this farmer</h3>
              <p>Soil readings are pushed autonomously by rover fleet or registered manually.</p>
            </div>
          ) : (
            <div className="indicator-grid">
              {soil_indicators.map((ind, idx) => (
                <div key={idx} className={`indicator-card ${ind.status}`}>
                  <div className="indicator-name">
                    <span>{ind.name}</span>
                    <span className={`badge ${ind.status === 'good' ? 'badge-green' : ind.status === 'warning' ? 'badge-amber' : 'badge-red'}`}>
                      {ind.badge}
                    </span>
                  </div>
                  <div className={`indicator-value ${ind.status}`}>
                    {ind.val}
                    <span className="indicator-unit">{ind.unit}</span>
                  </div>
                  <div className="indicator-advice">
                    💡 {ind.advice}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Crop Recommendations from Kaggle ML Model */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <span className="card-title">🌾 Machine Learning Crop Suitability Recommendations</span>
          <span className="badge badge-green">Kaggle-Trained Model</span>
        </div>
        <div className="card-body">
          {crop_recommendations.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px' }}>
              <div className="empty-icon">🌱</div>
              <p>Awaiting sufficient soil parameters to compute suitability index.</p>
            </div>
          ) : (
            <div className="rec-list">
              {crop_recommendations.map((crop) => (
                <div key={crop.rank} className="rec-item">
                  <div className="rec-rank">#{crop.rank}</div>
                  <div className="rec-emoji">{crop.icon}</div>
                  <div className="rec-info">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="rec-crop">{crop.crop_name}</span>
                      <span className="badge badge-green" style={{ fontSize: '0.75rem' }}>
                        {crop.suitability} ({crop.score_pct}%)
                      </span>
                    </div>
                    <div className="rec-bar-track">
                      <div className="rec-bar-fill" style={{ width: `${Math.min(100, Math.max(10, crop.score_pct))}%` }}></div>
                    </div>
                    <div className="rec-reason">{crop.reason}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Disease Diagnosis History */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🔬 Past Crop Diagnoses & Pathogen Logs</span>
          <Link to="/diagnose" className="btn btn-secondary btn-sm">
            ➕ New Scan
          </Link>
        </div>
        <div className="card-body">
          {past_diagnoses.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px' }}>
              <div className="empty-icon">🌿</div>
              <h3>No disease history</h3>
              <p>No leaf scans or disease symptoms logged for this farmer's field.</p>
            </div>
          ) : (
            <div className="diag-list">
              {past_diagnoses.map((d) => {
                const imgUrl = d.image_path ? `http://localhost:8000/${d.image_path.replace(/^\//, '')}` : null;
                return (
                  <div key={d.id} className="diag-card">
                    <div className="diag-thumb">
                      {imgUrl ? (
                        <img src={imgUrl} alt={d.disease_name} onError={(e) => { e.target.style.display = 'none'; }} />
                      ) : (
                        '🍃'
                      )}
                    </div>
                    <div className="diag-meta">
                      <div className="diag-crop">{d.crop}</div>
                      <div className="diag-disease">{d.disease_name}</div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                        <span className="badge badge-sky">
                          Confidence: {(d.confidence * 100).toFixed(0)}%
                        </span>
                        <span className="badge badge-outline">
                          Source: {d.source === 'rover' ? '🤖 Autonomous Rover' : '📱 Farmer Upload'}
                        </span>
                        {d.needs_kvk_review && (
                          <span className="badge badge-amber">⚠️ KVK Advisory Review</span>
                        )}
                      </div>

                      {d.treatment && (
                        <div className="diag-treatment">
                          <strong>Treatment Plan:</strong> {d.treatment}
                        </div>
                      )}

                      <div className="diag-footer">
                        <span>Logged: {new Date(d.timestamp).toLocaleString()}</span>
                        {d.notification_sent && <span>🔔 SMS/Notification Sent</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
