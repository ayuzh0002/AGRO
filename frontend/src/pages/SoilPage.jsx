import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSoilReadings, getFarmers } from '../api';

export default function SoilPage() {
  const [readings, setReadings] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [selectedFarmer, setSelectedFarmer] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSoilData = async (farmerId = null) => {
    try {
      setLoading(true);
      setError(null);
      const data = await getSoilReadings(farmerId || null, 0, 100);
      setReadings(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getFarmers(0, 100)
      .then((fList) => setFarmers(fList))
      .catch((err) => console.error('Failed to load farmers:', err));

    fetchSoilData();
  }, []);

  const handleFarmerChange = (e) => {
    const fId = e.target.value;
    setSelectedFarmer(fId);
    fetchSoilData(fId);
  };

  return (
    <div>
      {/* Filters & Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--gray-700)' }}>
            Filter by Farmer:
          </label>
          <select
            className="form-select"
            style={{ width: 'auto', minWidth: '220px' }}
            value={selectedFarmer}
            onChange={handleFarmerChange}
          >
            <option value="">-- All Farmers & Plots --</option>
            {farmers.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} (#{f.id})
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <span className="badge badge-sky">Autonomous Telemetry Ingestion</span>
        </div>
      </div>

      {error && <div className="error-alert">Error loading soil readings: {error}</div>}

      {/* Soil Readings Table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🧪 Rover Telemetry Logs ({readings.length} readings)</span>
          <button className="btn btn-secondary btn-sm" onClick={() => fetchSoilData(selectedFarmer)}>
            🔄 Refresh
          </button>
        </div>

        {loading ? (
          <div className="spinner-wrap"><div className="spinner"></div></div>
        ) : readings.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🏜️</div>
            <h3>No soil readings found</h3>
            <p>No telemetry recorded matching the selected filter.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Sample</th>
                  <th>Farmer</th>
                  <th>N (kg/ha)</th>
                  <th>P (kg/ha)</th>
                  <th>K (kg/ha)</th>
                  <th>pH</th>
                  <th>Moisture</th>
                  <th>EC (dS/m)</th>
                  <th>Density</th>
                  <th>GPS Coordinates</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {readings.map((r) => {
                  const matchedFarmer = farmers.find((f) => f.id === r.farmer_id);
                  return (
                    <tr key={r.id}>
                      <td>
                        <span className="badge badge-gray">#{r.id}</span>
                      </td>
                      <td>
                        {matchedFarmer ? (
                          <Link
                            to={`/dashboard/${matchedFarmer.id}`}
                            style={{ fontWeight: 600, color: 'var(--green-800)', textDecoration: 'underline' }}
                          >
                            {matchedFarmer.name}
                          </Link>
                        ) : r.farmer_id ? (
                          <Link to={`/dashboard/${r.farmer_id}`}>Farmer #{r.farmer_id}</Link>
                        ) : (
                          <span style={{ color: 'var(--gray-400)' }}>Unassigned</span>
                        )}
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: 'var(--green-700)' }}>
                          {r.nitrogen !== null ? r.nitrogen.toFixed(1) : '—'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: 'var(--amber-600)' }}>
                          {r.phosphorus !== null ? r.phosphorus.toFixed(1) : '—'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: 'var(--sky-600)' }}>
                          {r.potassium !== null ? r.potassium.toFixed(1) : '—'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600 }}>
                          {r.ph !== null ? r.ph.toFixed(2) : '—'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600 }}>
                          {r.moisture !== null ? `${r.moisture.toFixed(1)}%` : '—'}
                        </span>
                      </td>
                      <td>{r.ec !== null ? r.ec.toFixed(2) : '—'}</td>
                      <td>{r.bulk_density !== null ? `${r.bulk_density.toFixed(2)} g/cm³` : '—'}</td>
                      <td>
                        {r.gps_lat && r.gps_lon ? (
                          <span className="badge badge-outline" style={{ fontSize: '0.7rem' }}>
                            📍 {r.gps_lat.toFixed(4)}, {r.gps_lon.toFixed(4)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--gray-400)', fontSize: '0.75rem' }}>No GPS</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--gray-500)' }}>
                        {r.timestamp ? new Date(r.timestamp).toLocaleString() : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
