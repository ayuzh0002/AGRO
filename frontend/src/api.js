const API = 'http://localhost:8000/api/v1';

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ── Farmers ──
export const getFarmers = (skip = 0, limit = 50) =>
  request(`/farmers/?skip=${skip}&limit=${limit}`);

export const getFarmer = (id) => request(`/farmers/${id}`);

export const createFarmer = (data) =>
  request('/farmers/', { method: 'POST', body: JSON.stringify(data) });

export const updateFarmer = (id, data) =>
  request(`/farmers/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

// ── Dashboard ──
export const getDashboard = (farmerId) =>
  request(`/dashboard/${farmerId}?format=json`, {
    headers: { Accept: 'application/json' },
  });

// ── Soil ──
export const getSoilReadings = (farmerId, skip = 0, limit = 50) => {
  let url = `/soil/?skip=${skip}&limit=${limit}`;
  if (farmerId) url += `&farmer_id=${farmerId}`;
  return request(url);
};

// ── Diagnoses ──
export const getDiagnoses = (farmerId, skip = 0, limit = 50) => {
  let url = `/diagnoses/?skip=${skip}&limit=${limit}`;
  if (farmerId) url += `&farmer_id=${farmerId}`;
  return request(url);
};

export const uploadDiagnosis = async (formData) => {
  const res = await fetch(`${API}/diagnoses/manual-upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Upload failed: ${res.status}`);
  }
  return res.json();
};

// ── Seeds ──
export const getSeeds = (params = {}) => {
  const q = new URLSearchParams();
  if (params.crop_name) q.set('crop_name', params.crop_name);
  if (params.listing_type) q.set('listing_type', params.listing_type);
  if (params.farmer_id) q.set('farmer_id', params.farmer_id);
  q.set('skip', params.skip || 0);
  q.set('limit', params.limit || 50);
  return request(`/seeds/?${q}`);
};

export const createSeed = (data) =>
  request('/seeds/', { method: 'POST', body: JSON.stringify(data) });

// ── Weather ──
export const getWeather = async (lat = 20.5937, lon = 78.9629, locationName = 'India') => {
  try {
    return await request(`/weather?lat=${lat}&lon=${lon}&location_name=${encodeURIComponent(locationName)}`);
  } catch {
    const res = await fetch(`http://localhost:8000/weather?lat=${lat}&lon=${lon}&location_name=${encodeURIComponent(locationName)}`);
    return res.json();
  }
};

export const getWeatherLocation = async (query) => {
  try {
    return await request(`/weather/location?q=${encodeURIComponent(query)}`);
  } catch {
    const res = await fetch(`http://localhost:8000/weather/location?q=${encodeURIComponent(query)}`);
    return res.json();
  }
};

// ── Health ──
export const getHealth = () =>
  fetch('http://localhost:8000/health').then((r) => r.json());

// ── Farm Monitoring & Analysis (New Endpoints) ──

export const getFarmConfig = async () => {
  try {
    return await request('/farm-config');
  } catch {
    const res = await fetch('http://localhost:8000/farm-config');
    return res.json();
  }
};

export const getMapsConfig = async () => {
  try {
    const res = await fetch('http://localhost:8000/maps-config');
    return res.json();
  } catch {
    return {};
  }
};

export const getFarmWeather = async () => {
  try {
    return await request('/farm-weather');
  } catch {
    const res = await fetch('http://localhost:8000/farm-weather');
    return res.json();
  }
};

export const getAgricultureAnalysis = async () => {
  try {
    return await request('/agriculture-analysis');
  } catch {
    const res = await fetch('http://localhost:8000/agriculture-analysis');
    return res.json();
  }
};

export const getSensorData = async () => {
  try {
    return await request('/sensor-data');
  } catch {
    const res = await fetch('http://localhost:8000/sensor-data');
    return res.json();
  }
};

export const getSensorHistory = async (limit = 30) => {
  try {
    return await request(`/sensor-data/history?limit=${limit}`);
  } catch {
    const res = await fetch(`http://localhost:8000/sensor-data/history?limit=${limit}`);
    return res.json();
  }
};

export const aiAnalyzeField = async (payload = {}) => {
  try {
    return await request('/ai/analyze-field', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch {
    const res = await fetch('http://localhost:8000/ai/analyze-field', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  }
};

export const aiChat = async (message, context = null) => {
  try {
    return await request('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message, context }),
    });
  } catch {
    const res = await fetch('http://localhost:8000/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, context }),
    });
    return res.json();
  }
};

export const getMLStatus = async () => {
  try {
    return await request('/ml/status');
  } catch {
    const res = await fetch('http://localhost:8000/ml/status');
    return res.json();
  }
};

export const runMLPredict = async (payload = {}) => {
  try {
    return await request('/ml/predict', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch {
    const res = await fetch('http://localhost:8000/ml/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  }
};

// ── Crop Recommendation ──
export const getCropRecommendation = async (topK = 5) => {
  try {
    return await request(`/crop-recommendation?top_k=${topK}`);
  } catch {
    const res = await fetch(`http://localhost:8000/crop-recommendation?top_k=${topK}`);
    return res.json();
  }
};

export const getCropRecommendationManual = async (payload = {}) => {
  try {
    return await request('/crop-recommendation/manual', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch {
    const res = await fetch('http://localhost:8000/crop-recommendation/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  }
};

