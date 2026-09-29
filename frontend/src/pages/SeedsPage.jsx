import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSeeds, createSeed, getFarmers } from '../api';

export default function SeedsPage() {
  const [seeds, setSeeds] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [activeTab, setActiveTab] = useState('all'); // all | sell | swap | free
  const [searchQuery, setSearchQuery] = useState('');

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formData, setFormData] = useState({
    farmer_id: '',
    crop_name: '',
    variety: '',
    listing_type: 'sell',
    quantity_kg: '',
    price_per_kg: '',
    germination_pct: '',
    location: '',
    description: '',
  });

  const fetchSeeds = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (activeTab !== 'all') params.listing_type = activeTab;
      const data = await getSeeds(params);
      setSeeds(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getFarmers(0, 100)
      .then((f) => setFarmers(f))
      .catch((err) => console.error('Failed to load farmers:', err));
  }, []);

  useEffect(() => {
    fetchSeeds();
  }, [activeTab]);

  const openCreateModal = () => {
    setFormData({
      farmer_id: farmers[0]?.id ? String(farmers[0].id) : '',
      crop_name: '',
      variety: '',
      listing_type: 'sell',
      quantity_kg: '',
      price_per_kg: '',
      germination_pct: '',
      location: farmers[0]?.location || '',
      description: '',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleFarmerSelect = (fId) => {
    const f = farmers.find((farm) => farm.id === parseInt(fId, 10));
    setFormData((prev) => ({
      ...prev,
      farmer_id: fId,
      location: f ? f.location : prev.location,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.farmer_id) {
      setFormError('Please select a farmer profile.');
      return;
    }

    setFormSubmitting(true);
    setFormError(null);

    const payload = {
      farmer_id: parseInt(formData.farmer_id, 10),
      crop_name: formData.crop_name.trim(),
      variety: formData.variety.trim() || null,
      listing_type: formData.listing_type,
      quantity_kg: formData.quantity_kg ? parseFloat(formData.quantity_kg) : null,
      price_per_kg: formData.listing_type === 'sell' && formData.price_per_kg ? parseFloat(formData.price_per_kg) : 0,
      germination_pct: formData.germination_pct ? parseFloat(formData.germination_pct) : null,
      location: formData.location.trim() || null,
      description: formData.description.trim() || null,
    };

    try {
      await createSeed(payload);
      setModalOpen(false);
      await fetchSeeds();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setFormSubmitting(false);
    }
  };

  const filteredSeeds = seeds.filter((s) => {
    const q = searchQuery.toLowerCase();
    return (
      s.crop_name?.toLowerCase().includes(q) ||
      s.variety?.toLowerCase().includes(q) ||
      s.location?.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      {/* Top Header Actions & Filter Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['all', 'sell', 'swap', 'free'].map((tab) => (
            <button
              key={tab}
              className={`btn btn-sm ${activeTab === tab ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab(tab)}
              style={{ textTransform: 'capitalize' }}
            >
              {tab === 'all' ? 'All Listings' : tab === 'sell' ? '💰 For Sale' : tab === 'swap' ? '🔄 Swap / Barter' : '🎁 Free Distribution'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            className="form-input"
            style={{ width: '220px' }}
            placeholder="Search crop or variety..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button className="btn btn-primary" onClick={openCreateModal}>
            <span>➕</span> List Your Seeds
          </button>
        </div>
      </div>

      {error && <div className="error-alert">Error loading seed exchange: {error}</div>}

      {/* Seed Cards Grid */}
      {loading ? (
        <div className="spinner-wrap"><div className="spinner"></div></div>
      ) : filteredSeeds.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">🌱</div>
            <h3>No seed listings found</h3>
            <p>Be the first farmer to share or trade high-germination seeds in your district!</p>
          </div>
        </div>
      ) : (
        <div className="seed-grid">
          {filteredSeeds.map((seed) => {
            const matchedFarmer = farmers.find((f) => f.id === seed.farmer_id);
            const badgeCls =
              seed.listing_type === 'free'
                ? 'badge-green'
                : seed.listing_type === 'swap'
                ? 'badge-sky'
                : 'badge-amber';

            return (
              <div key={seed.id} className="seed-card">
                <div className="seed-top">
                  <div>
                    <div className="seed-crop">{seed.crop_name}</div>
                    <div className="seed-variety">{seed.variety || 'Standard / Local variety'}</div>
                  </div>
                  <span className={`badge ${badgeCls}`} style={{ textTransform: 'uppercase' }}>
                    {seed.listing_type}
                  </span>
                </div>

                {seed.description && (
                  <p style={{ fontSize: '0.82rem', color: 'var(--gray-600)', margin: '8px 0', lineHeight: 1.4 }}>
                    {seed.description}
                  </p>
                )}

                <div className="seed-details">
                  <span className="seed-detail-label">Quantity:</span>
                  <span className="seed-detail-value">
                    {seed.quantity_kg !== null ? `${seed.quantity_kg} kg` : 'Available on request'}
                  </span>

                  <span className="seed-detail-label">Pricing:</span>
                  <span className="seed-detail-value" style={{ color: seed.price_per_kg ? 'var(--green-700)' : 'var(--gray-600)' }}>
                    {seed.listing_type === 'free'
                      ? 'Free / Gift'
                      : seed.listing_type === 'swap'
                      ? 'Barter / Exchange'
                      : seed.price_per_kg
                      ? `₹${seed.price_per_kg} / kg`
                      : 'Negotiable'}
                  </span>

                  {seed.germination_pct !== null && (
                    <>
                      <span className="seed-detail-label">Germination Rate:</span>
                      <span className="seed-detail-value" style={{ color: 'var(--green-800)' }}>
                        ✓ {seed.germination_pct}%
                      </span>
                    </>
                  )}

                  <span className="seed-detail-label">Location:</span>
                  <span className="seed-detail-value">📍 {seed.location || 'Maharashtra'}</span>

                  {matchedFarmer && (
                    <>
                      <span className="seed-detail-label">Farmer:</span>
                      <span className="seed-detail-value">
                        <Link to={`/dashboard/${matchedFarmer.id}`} style={{ color: 'var(--green-800)', textDecoration: 'underline' }}>
                          {matchedFarmer.name}
                        </Link>
                      </span>
                    </>
                  )}
                </div>

                <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>
                    Listed: {new Date(seed.created_at).toLocaleDateString()}
                  </span>
                  {matchedFarmer?.phone && (
                    <a
                      href={`tel:${matchedFarmer.phone}`}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.75rem' }}
                    >
                      📞 Contact Farmer
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal for Seed Listing */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>List Seeds on the AgroIn Exchange</h3>
              <button className="modal-close" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {formError && <div className="error-alert">{formError}</div>}

                <div className="form-group">
                  <label className="form-label">Seller / Farmer Profile *</label>
                  <select
                    className="form-select"
                    required
                    value={formData.farmer_id}
                    onChange={(e) => handleFarmerSelect(e.target.value)}
                  >
                    <option value="">-- Choose registered farmer --</option>
                    {farmers.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.phone}) - {f.location}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Crop Name *</label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      placeholder="e.g. Tomato, Wheat, Soy"
                      value={formData.crop_name}
                      onChange={(e) => setFormData({ ...formData, crop_name: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Variety / Cultivar</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Arka Vikas, Lokwan"
                      value={formData.variety}
                      onChange={(e) => setFormData({ ...formData, variety: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Listing Type *</label>
                    <select
                      className="form-select"
                      value={formData.listing_type}
                      onChange={(e) => setFormData({ ...formData, listing_type: e.target.value })}
                    >
                      <option value="sell">Sell (Cash / UPI)</option>
                      <option value="swap">Swap / Barter</option>
                      <option value="free">Free Community Distribution</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Quantity Available (kg)</label>
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      placeholder="e.g. 25"
                      value={formData.quantity_kg}
                      onChange={(e) => setFormData({ ...formData, quantity_kg: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-row">
                  {formData.listing_type === 'sell' && (
                    <div className="form-group">
                      <label className="form-label">Price per kg (₹)</label>
                      <input
                        type="number"
                        step="any"
                        className="form-input"
                        placeholder="e.g. 150"
                        value={formData.price_per_kg}
                        onChange={(e) => setFormData({ ...formData, price_per_kg: e.target.value })}
                      />
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">Germination Rate (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      className="form-input"
                      placeholder="e.g. 92"
                      value={formData.germination_pct}
                      onChange={(e) => setFormData({ ...formData, germination_pct: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Pickup Location / Village</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Kopargaon, Ahmednagar, MH"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Description / Sowing Advice</label>
                  <textarea
                    className="form-textarea"
                    placeholder="e.g. High disease tolerance, certified organic seeds harvested last month."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={formSubmitting}>
                  {formSubmitting ? 'Publishing...' : 'Publish Seed Listing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
