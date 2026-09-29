import { useEffect, useState, useRef } from 'react';
import { getDiagnoses, uploadDiagnosis, getFarmers } from '../api';

export default function DiagnosePage() {
  const [diagnoses, setDiagnoses] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form states
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [selectedFarmerId, setSelectedFarmerId] = useState('');
  const [cropInput, setCropInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  const fileInputRef = useRef(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [diagsData, farmersData] = await Promise.all([
        getDiagnoses(null, 0, 50),
        getFarmers(0, 100),
      ]);
      setDiagnoses(diagsData);
      setFarmers(farmersData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResult(null);
      setUploadError(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResult(null);
      setUploadError(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError('Please select or drop an image file.');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('image', selectedFile);
    if (selectedFarmerId) formData.append('farmer_id', selectedFarmerId);
    if (cropInput.trim()) formData.append('crop', cropInput.trim());

    // If farmer is selected, we can also forward their coordinates if available
    const chosenFarmer = farmers.find((f) => f.id === parseInt(selectedFarmerId, 10));
    if (chosenFarmer?.field_lat) formData.append('gps_lat', chosenFarmer.field_lat);
    if (chosenFarmer?.field_lon) formData.append('gps_lon', chosenFarmer.field_lon);

    try {
      const res = await uploadDiagnosis(formData);
      setResult(res);
      // Refresh list
      loadData();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      {/* Upload Diagnosis Section */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <span className="card-title">🔬 AI Plant Disease Diagnosis</span>
          <span className="badge badge-sky">Gemini 2.5 Vision Engine</span>
        </div>
        <div className="card-body">
          <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)', marginBottom: '16px' }}>
            Upload a clear photo of an infected leaf or stem. The AI engine diagnoses the pathogen, suggests verified treatment protocols, and automatically alerts KVK scientists if diagnosis confidence is below 70%.
          </p>

          <form onSubmit={handleSubmit}>
            <div
              className={`upload-zone ${previewUrl ? 'active' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/jpeg,image/png,image/webp,image/heic"
                onChange={handleFileChange}
              />
              {previewUrl ? (
                <div>
                  <img src={previewUrl} alt="Preview" className="upload-preview" />
                  <p style={{ marginTop: '8px', fontWeight: 600 }}>{selectedFile?.name}</p>
                  <span className="upload-hint">Click or drag a new image to replace</span>
                </div>
              ) : (
                <div>
                  <div className="upload-icon">📷</div>
                  <p><strong>Click to browse</strong> or drag & drop a crop image here</p>
                  <span className="upload-hint">Supports JPEG, PNG, WEBP, HEIC (Max 10MB)</span>
                </div>
              )}
            </div>

            <div className="form-row" style={{ marginTop: '16px' }}>
              <div className="form-group">
                <label className="form-label">Assign to Farmer (Optional)</label>
                <select
                  className="form-select"
                  value={selectedFarmerId}
                  onChange={(e) => setSelectedFarmerId(e.target.value)}
                >
                  <option value="">-- No specific farmer --</option>
                  {farmers.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.location})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Crop Name Hint (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Tomato, Corn, Potato, Rice"
                  value={cropInput}
                  onChange={(e) => setCropInput(e.target.value)}
                />
              </div>
            </div>

            {uploadError && <div className="error-alert">{uploadError}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!selectedFile || uploading}
              >
                {uploading ? 'Analyzing Image with AI...' : '🔬 Run AI Diagnosis'}
              </button>
            </div>
          </form>

          {/* Diagnosis Result Banner */}
          {result && (
            <div style={{ marginTop: '24px', padding: '20px', background: 'var(--green-50)', border: '1px solid var(--green-200)', borderRadius: 'var(--radius)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <span className="badge badge-green" style={{ marginBottom: '6px' }}>
                    Diagnosis Completed
                  </span>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--green-900)' }}>
                    {result.crop}: {result.disease_name}
                  </h3>
                  <div style={{ fontSize: '0.82rem', color: 'var(--gray-600)', marginTop: '2px' }}>
                    Confidence: <strong>{(result.confidence * 100).toFixed(1)}%</strong>
                  </div>
                </div>

                {result.needs_kvk_review && (
                  <span className="badge badge-amber" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                    ⚠️ Flagged for KVK Scientist Review
                  </span>
                )}
              </div>

              {result.treatment && (
                <div style={{ marginTop: '14px', background: '#fff', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  <strong style={{ color: 'var(--gray-900)', fontSize: '0.85rem' }}>Recommended Treatment:</strong>
                  <p style={{ fontSize: '0.85rem', color: 'var(--gray-700)', marginTop: '4px', lineHeight: 1.5 }}>
                    {result.treatment}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Historical Diagnoses Feed */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">📋 Diagnosis Log & History ({diagnoses.length})</span>
        </div>
        <div className="card-body">
          {error && <div className="error-alert">{error}</div>}

          {loading ? (
            <div className="spinner-wrap"><div className="spinner"></div></div>
          ) : diagnoses.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🌱</div>
              <h3>No diagnoses logged</h3>
              <p>Upload a photo above to run your first automated disease scan.</p>
            </div>
          ) : (
            <div className="diag-list">
              {diagnoses.map((d) => {
                const imgUrl = d.image_path ? `http://localhost:8000/${d.image_path.replace(/^\//, '')}` : null;
                const matchedFarmer = farmers.find((f) => f.id === d.farmer_id);
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
                      <div className="diag-crop">
                        {d.crop} {matchedFarmer ? `• Farmer: ${matchedFarmer.name}` : ''}
                      </div>
                      <div className="diag-disease">{d.disease_name}</div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <span className="badge badge-sky">
                          Confidence: {(d.confidence * 100).toFixed(0)}%
                        </span>
                        <span className="badge badge-outline">
                          Source: {d.source === 'rover' ? '🤖 Autonomous Rover' : '📱 Farmer Upload'}
                        </span>
                        {d.needs_kvk_review ? (
                          <span className="badge badge-amber">⚠️ KVK Review Required</span>
                        ) : (
                          <span className="badge badge-green">✓ Confirmed</span>
                        )}
                      </div>

                      {d.treatment && (
                        <div className="diag-treatment">
                          <strong>Treatment:</strong> {d.treatment}
                        </div>
                      )}

                      <div className="diag-footer">
                        <span>Logged: {new Date(d.timestamp).toLocaleString()}</span>
                        {d.gps_lat && d.gps_lon && (
                          <span>📍 {d.gps_lat.toFixed(4)}, {d.gps_lon.toFixed(4)}</span>
                        )}
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
