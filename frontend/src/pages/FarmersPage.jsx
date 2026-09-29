import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getFarmers, createFarmer, updateFarmer } from '../api';

export default function FarmersPage() {
  const [farmers, setFarmers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFarmer, setEditingFarmer] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    location: '',
    assigned_field: '',
    field_lat: '',
    field_lon: '',
  });
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const fetchFarmers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getFarmers(0, 100);
      setFarmers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFarmers();
  }, []);

  const openCreateModal = () => {
    setEditingFarmer(null);
    setFormData({
      name: '',
      phone: '',
      location: '',
      assigned_field: '',
      field_lat: '',
      field_lon: '',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (farmer) => {
    setEditingFarmer(farmer);
    setFormData({
      name: farmer.name || '',
      phone: farmer.phone || '',
      location: farmer.location || '',
      assigned_field: farmer.assigned_field || '',
      field_lat: farmer.field_lat !== null ? farmer.field_lat : '',
      field_lon: farmer.field_lon !== null ? farmer.field_lon : '',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError(null);

    const payload = {
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      location: formData.location.trim(),
      assigned_field: formData.assigned_field ? formData.assigned_field.trim() : null,
      field_lat: formData.field_lat ? parseFloat(formData.field_lat) : null,
      field_lon: formData.field_lon ? parseFloat(formData.field_lon) : null,
    };

    try {
      if (editingFarmer) {
        await updateFarmer(editingFarmer.id, payload);
      } else {
        await createFarmer(payload);
      }
      setModalOpen(false);
      await fetchFarmers();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setFormSubmitting(false);
    }
  };

  const filteredFarmers = farmers.filter((f) => {
    const q = searchTerm.toLowerCase();
    return (
      f.name?.toLowerCase().includes(q) ||
      f.phone?.toLowerCase().includes(q) ||
      f.location?.toLowerCase().includes(q) ||
      f.assigned_field?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      {/* Top Header Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1, maxWidth: '400px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search by name, phone, or location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={openCreateModal}>
          <span>➕</span> Register New Farmer
        </button>
      </div>

      {error && <div className="error-alert">Error loading farmers: {error}</div>}

      {/* Farmers List */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">👨‍🌾 Registered Farmers ({filteredFarmers.length})</span>
        </div>

        {loading ? (
          <div className="spinner-wrap"><div className="spinner"></div></div>
        ) : filteredFarmers.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🌾</div>
            <h3>No farmers found</h3>
            <p>Register a farmer or adjust your search query.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Location</th>
                  <th>Assigned Field</th>
                  <th>Coordinates</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFarmers.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <span className="badge badge-gray">#{f.id}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--gray-900)' }}>{f.name}</div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.82rem', color: 'var(--gray-700)' }}>{f.phone}</span>
                    </td>
                    <td>{f.location}</td>
                    <td>
                      <span style={{ fontSize: '0.82rem', color: 'var(--gray-600)' }}>
                        {f.assigned_field || '—'}
                      </span>
                    </td>
                    <td>
                      {f.field_lat && f.field_lon ? (
                        <span className="badge badge-outline" style={{ fontSize: '0.7rem' }}>
                          📍 {f.field_lat.toFixed(4)}, {f.field_lon.toFixed(4)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--gray-400)', fontSize: '0.75rem' }}>No GPS</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${f.is_active ? 'badge-green' : 'badge-amber'}`}>
                        {f.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '8px' }}>
                        <Link to={`/dashboard/${f.id}`} className="btn btn-secondary btn-sm" title="View Full Dashboard">
                          📊 Dashboard
                        </Link>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEditModal(f)}>
                          ✏️ Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal for Create / Edit */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingFarmer ? 'Edit Farmer Profile' : 'Register New Farmer'}</h3>
              <button className="modal-close" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {formError && <div className="error-alert">{formError}</div>}

                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Ramesh Patil"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Phone Number *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. +919876543210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Location / Village / District *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Shirdi, Ahmednagar, MH"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Assigned Field Description</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Field A - 1.2 acres (Shirdi East)"
                    value={formData.assigned_field}
                    onChange={(e) => setFormData({ ...formData, assigned_field: e.target.value })}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Field Latitude</label>
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      placeholder="e.g. 19.7665"
                      value={formData.field_lat}
                      onChange={(e) => setFormData({ ...formData, field_lat: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Field Longitude</label>
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      placeholder="e.g. 74.4824"
                      value={formData.field_lon}
                      onChange={(e) => setFormData({ ...formData, field_lon: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={formSubmitting}>
                  {formSubmitting ? 'Saving...' : editingFarmer ? 'Update Profile' : 'Register Farmer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
