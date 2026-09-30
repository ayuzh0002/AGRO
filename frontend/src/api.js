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
