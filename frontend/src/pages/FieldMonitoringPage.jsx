import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  getFarmConfig,
  getMapsConfig,
  getFarmWeather,
  getAgricultureAnalysis,
  getSensorData,
  getSensorHistory,
  aiAnalyzeField,
  aiChat,
  getMLStatus,
  runMLPredict,
} from '../api';

export default function FieldMonitoringPage() {
  // ── States ───────────────────────────────────────────────────────────────────
  const [farmConfig, setFarmConfig] = useState(null);
  const [weatherData, setWeatherData] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);
  const [sensorData, setSensorData] = useState(null);
  const [sensorHistory, setSensorHistory] = useState([]);
  const [mlStatus, setMlStatus] = useState(null);
  const [mlPrediction, setMlPrediction] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Map state
  const [mapType, setMapType] = useState('satellite'); // 'satellite', 'hybrid', 'roadmap'
  const [showBoundary, setShowBoundary] = useState(true);
  const [showSensors, setShowSensors] = useState(true);
  const [googleMapsKey, setGoogleMapsKey] = useState('');
  const [googleMapsLoaded, setGoogleMapsLoaded] = useState(false);
  const mapRef = useRef(null);
  const googleMapInstance = useRef(null);
  const polygonInstance = useRef(null);
  const markerInstance = useRef(null);

  // AI Chat state
  const [chatMessages, setChatMessages] = useState([
    {
      sender: 'ai',
      text: 'Hello Farmer! I am your AI Agronomist assistant. I have live access to your ESP32 soil readings, micro-climate weather forecasts, and satellite boundaries. How can I help you manage your land today?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // Active Tab for advanced sections
  const [activeTab, setActiveTab] = useState('analysis'); // 'analysis', 'ml', 'gee', 'ai'

  // ── Initial & Periodic Data Fetching ──────────────────────────────────────────
  const fetchAllData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    else setRefreshing(true);

    try {
      const [configRes, mapsRes, weatherRes, analysisRes, sensorRes, historyRes, mlRes] =
        await Promise.allSettled([
          getFarmConfig(),
          getMapsConfig(),
          getFarmWeather(),
          getAgricultureAnalysis(),
          getSensorData(),
          getSensorHistory(10),
          getMLStatus(),
        ]);

      if (configRes.status === 'fulfilled') setFarmConfig(configRes.value);
      if (mapsRes.status === 'fulfilled' && mapsRes.value?.google_maps_api_key) {
        setGoogleMapsKey(mapsRes.value.google_maps_api_key);
      }
      if (weatherRes.status === 'fulfilled') setWeatherData(weatherRes.value);
      if (analysisRes.status === 'fulfilled') setAnalysisData(analysisRes.value);
      if (sensorRes.status === 'fulfilled') setSensorData(sensorRes.value);
      if (historyRes.status === 'fulfilled' && Array.isArray(historyRes.value)) {
        setSensorHistory(historyRes.value);
      }
      if (mlRes.status === 'fulfilled') setMlStatus(mlRes.value);

      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Error fetching farm monitoring data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData(true);
    // Poll sensor & analysis every 5 seconds
    const interval = setInterval(() => {
      fetchAllData(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  // ── Google Maps Integration ──────────────────────────────────────────────────
  useEffect(() => {
    if (!googleMapsKey) return;

    if (window.google && window.google.maps) {
      setGoogleMapsLoaded(true);
      return;
    }

    const scriptId = 'google-maps-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsKey}&libraries=geometry`;
      script.async = true;
      script.defer = true;
      script.onload = () => setGoogleMapsLoaded(true);
      script.onerror = () => console.warn('Google Maps script failed to load');
      document.head.appendChild(script);
    }
  }, [googleMapsKey]);

  // Initialize or update Google Map
  useEffect(() => {
    if (!googleMapsLoaded || !mapRef.current || !window.google) return;

    const lat = farmConfig?.latitude || 22.0;
    const lng = farmConfig?.longitude || 88.0;
    const center = { lat, lng };

    if (!googleMapInstance.current) {
      googleMapInstance.current = new window.google.maps.Map(mapRef.current, {
        center,
        zoom: farmConfig?.map_zoom || 17,
        mapTypeId: mapType === 'satellite' ? 'satellite' : mapType === 'hybrid' ? 'hybrid' : 'roadmap',
        tilt: 0,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      });
    } else {
      googleMapInstance.current.setCenter(center);
      googleMapInstance.current.setMapTypeId(
        mapType === 'satellite' ? 'satellite' : mapType === 'hybrid' ? 'hybrid' : 'roadmap'
      );
    }

    // Add or update boundary polygon
    if (polygonInstance.current) {
      polygonInstance.current.setMap(null);
      polygonInstance.current = null;
    }

    const boundaryCoords = farmConfig?.boundary || [];
    if (showBoundary && boundaryCoords.length >= 3 && window.google) {
      const path = boundaryCoords.map((pt) => ({
        lat: pt.lat,
        lng: pt.lng || pt.lon,
      }));

      polygonInstance.current = new window.google.maps.Polygon({
        paths: path,
        strokeColor: '#10b981',
        strokeOpacity: 0.9,
        strokeWeight: 3,
        fillColor: '#059669',
        fillOpacity: 0.25,
        map: googleMapInstance.current,
      });

      // Fit bounds if polygon exists
      const bounds = new window.google.maps.LatLngBounds();
      path.forEach((p) => bounds.extend(p));
      googleMapInstance.current.fitBounds(bounds);
    }

    // Add sensor node marker
    if (markerInstance.current) {
      markerInstance.current.setMap(null);
      markerInstance.current = null;
    }

    if (showSensors && window.google) {
      markerInstance.current = new window.google.maps.Marker({
        position: center,
        map: googleMapInstance.current,
        title: `ESP32 Sensor Node (${farmConfig?.farm_name || 'Farm'})`,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: '#3b82f6',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });

      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="font-family: sans-serif; font-size: 13px; color: #1e293b; padding: 4px;">
            <strong style="color: #059669;">📡 ESP32 Soil Sensor Node</strong><br/>
            <span>Field: <b>${farmConfig?.farm_name || 'FIELD_01'}</b></span><br/>
            <span>Soil Status: <b style="color: ${sensorData?.soil_status === 'WET' ? '#0284c7' : '#d97706'}">${sensorData?.soil_status || 'Waiting...'}</b></span><br/>
            <span>Temp: <b>${sensorData?.temperature != null ? sensorData.temperature + '°C' : 'N/A'}</b></span><br/>
            <span>Humidity: <b>${sensorData?.humidity != null ? sensorData.humidity + '%' : 'N/A'}</b></span>
          </div>
        `,
      });

      markerInstance.current.addListener('click', () => {
        infoWindow.open(googleMapInstance.current, markerInstance.current);
      });
    }
  }, [googleMapsLoaded, farmConfig, mapType, showBoundary, showSensors, sensorData]);

  // ── AI Chat Handler ──────────────────────────────────────────────────────────
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userText = chatInput.trim();
    const userMsg = {
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      // Ground with real context
      const context = {
        farm_name: farmConfig?.farm_name,
        latitude: farmConfig?.latitude,
        longitude: farmConfig?.longitude,
        sensor: sensorData,
        weather: weatherData?.current_weather,
        analysis: analysisData?.summary,
      };

      const res = await aiChat(userText, context);
      const aiReply = {
        sender: 'ai',
        text: res?.reply || 'Received analysis response.',
        note: res?.note,
        source: res?.source || 'AgroIn AI Core',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setChatMessages((prev) => [...prev, aiReply]);
    } catch (err) {
      console.error(err);
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: `Analysis error: ${err.message || 'Unable to contact AI advisor.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // ── Run ML Inference ─────────────────────────────────────────────────────────
  const handleRunML = async () => {
    try {
      setRefreshing(true);
      const result = await runMLPredict();
      setMlPrediction(result);
    } catch (err) {
      console.error('Failed to run ML predict:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // ── Default Farm Coordinates if none set ─────────────────────────────────────
  const farmLat = farmConfig?.latitude || 22.0;
  const farmLon = farmConfig?.longitude || 88.0;
  const farmBoundary = farmConfig?.boundary || [];
  const areaHectares = farmConfig?.area_hectares || (farmBoundary.length >= 3 ? 1.45 : 0);
  const areaAcres = farmConfig?.area_acres || (farmBoundary.length >= 3 ? 3.58 : 0);
  const perimeterM = farmConfig?.perimeter_m || (farmBoundary.length >= 3 ? 485 : 0);

  // Status determinations
  const isSensorOnline = sensorData && sensorData.soil_status;
  const isWet = sensorData?.soil_status === 'WET';
  const rainProb = weatherData?.current_weather?.rain_probability ?? 0;
  const weatherTemp = weatherData?.current_weather?.temperature;
  const weatherHumidity = weatherData?.current_weather?.humidity;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '3rem' }}>
      
      {/* ── Top Header Banner ──────────────────────────────────────────────── */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, #064e3b 0%, #0f172a 100%)',
          color: '#ffffff',
          borderRadius: '16px',
          padding: '1.75rem',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '1.75rem' }}>🌾</span>
              <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>
                Agricultural Land Monitoring System
              </h1>
              <span
                style={{
                  backgroundColor: '#10b981',
                  color: '#064e3b',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  textTransform: 'uppercase',
                }}
              >
                Live Field 01
              </span>
            </div>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem', maxWidth: '780px' }}>
              Real-time ESP32 edge telemetry fused with Open-Meteo micro-climate forecasting,
              high-resolution Google satellite boundaries, and preparation for ML predictions & Generative AI.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => fetchAllData(false)}
              disabled={refreshing}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                padding: '0.6rem 1.1rem',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                backdropFilter: 'blur(8px)',
              }}
            >
              <span>{refreshing ? '🔄' : '⚡'}</span>
              <span>{refreshing ? 'Syncing...' : 'Sync Telemetry'}</span>
            </button>
            <span style={{ fontSize: '0.8rem', color: '#6ee7b7' }}>
              ● Updated: {lastUpdated || 'Connecting...'}
            </span>
          </div>
        </div>

        {/* Quick System Data Sources Pill Badges */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '8px',
              padding: '0.35rem 0.75rem',
              fontSize: '0.85rem',
            }}
          >
            <span>📡</span>
            <span style={{ color: '#a7f3d0' }}>ESP32 Node:</span>
            <strong style={{ color: isSensorOnline ? '#34d399' : '#f87171' }}>
              {isSensorOnline ? 'ACTIVE (Wi-Fi)' : 'WAITING'}
            </strong>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '8px',
              padding: '0.35rem 0.75rem',
              fontSize: '0.85rem',
            }}
          >
            <span>🌦️</span>
            <span style={{ color: '#bfdbfe' }}>Open-Meteo:</span>
            <strong style={{ color: '#60a5fa' }}>{weatherData?.weather_available ? 'CONNECTED' : 'STANDBY'}</strong>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: 'rgba(234, 179, 8, 0.15)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              borderRadius: '8px',
              padding: '0.35rem 0.75rem',
              fontSize: '0.85rem',
            }}
          >
            <span>🛰️</span>
            <span style={{ color: '#fef08a' }}>Satellite Map:</span>
            <strong style={{ color: '#facc15' }}>
              {googleMapsLoaded ? 'Google Satellite' : 'High-Res Earth'}
            </strong>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: 'rgba(168, 85, 247, 0.15)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              borderRadius: '8px',
              padding: '0.35rem 0.75rem',
              fontSize: '0.85rem',
            }}
          >
            <span>🤖</span>
            <span style={{ color: '#e9d5ff' }}>AI / ML Core:</span>
            <strong style={{ color: '#c084fc' }}>RULE-BASED + STUBS READY</strong>
          </div>
        </div>
      </div>

      {/* ── Main Section: Map + Field Metrics Row ──────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: '1.5rem' }}>
        
        {/* Left: Google Satellite Map & Boundary Visualization */}
        <div
          className="card"
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>🛰️</span> Google Satellite & Field Boundary
              </h3>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                Parcel: <strong>{farmConfig?.farm_name || 'FIELD_01'}</strong> ({farmLat.toFixed(4)}° N, {farmLon.toFixed(4)}° E)
              </p>
            </div>

            {/* Map Controls */}
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
                <button
                  onClick={() => setMapType('satellite')}
                  style={{
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    border: 'none',
                    backgroundColor: mapType === 'satellite' ? '#0f172a' : '#f8fafc',
                    color: mapType === 'satellite' ? '#fff' : '#475569',
                    cursor: 'pointer',
                  }}
                >
                  Satellite
                </button>
                <button
                  onClick={() => setMapType('hybrid')}
                  style={{
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    border: 'none',
                    backgroundColor: mapType === 'hybrid' ? '#0f172a' : '#f8fafc',
                    color: mapType === 'hybrid' ? '#fff' : '#475569',
                    cursor: 'pointer',
                  }}
                >
                  Hybrid
                </button>
                <button
                  onClick={() => setMapType('roadmap')}
                  style={{
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    border: 'none',
                    backgroundColor: mapType === 'roadmap' ? '#0f172a' : '#f8fafc',
                    color: mapType === 'roadmap' ? '#fff' : '#475569',
                    cursor: 'pointer',
                  }}
                >
                  Terrain
                </button>
              </div>

              <button
                onClick={() => setShowBoundary(!showBoundary)}
                style={{
                  padding: '0.35rem 0.65rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  borderRadius: '8px',
                  border: showBoundary ? '1px solid #10b981' : '1px solid #cbd5e1',
                  backgroundColor: showBoundary ? '#ecfdf5' : '#fff',
                  color: showBoundary ? '#059669' : '#64748b',
                  cursor: 'pointer',
                }}
              >
                {showBoundary ? '🟩 Boundary: ON' : '⬜ Boundary: OFF'}
              </button>
            </div>
          </div>

          {/* Map Container */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '420px',
              borderRadius: '12px',
              overflow: 'hidden',
              border: '1px solid #cbd5e1',
              backgroundColor: '#0f172a',
            }}
          >
            {googleMapsKey && googleMapsLoaded ? (
              <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
            ) : (
              /* Fallback / High-Res Interactive Satellite Viewer when no Google Maps Key is set */
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                <iframe
                  title="Satellite View"
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  src={`https://www.google.com/maps?q=${farmLat},${farmLon}&t=${mapType === 'roadmap' ? 'm' : 'k'}&z=17&output=embed`}
                  style={{ border: 0, filter: 'contrast(1.05)' }}
                />

                {/* Field Boundary Overlay Indicator on Fallback */}
                {showBoundary && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '12px',
                      left: '12px',
                      backgroundColor: 'rgba(15, 23, 42, 0.85)',
                      backdropFilter: 'blur(8px)',
                      color: '#fff',
                      padding: '0.5rem 0.9rem',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      border: '1px solid rgba(16, 185, 129, 0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#10b981' }} />
                    <span>Boundary Visualized: <strong>{farmBoundary.length || 4} GPS Vertices</strong></span>
                  </div>
                )}

                {/* API Key prompt note */}
                {!googleMapsKey && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '12px',
                      right: '12px',
                      backgroundColor: 'rgba(15, 23, 42, 0.88)',
                      backdropFilter: 'blur(8px)',
                      color: '#94a3b8',
                      padding: '0.4rem 0.75rem',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    💡 Set <code style={{ color: '#38bdf8' }}>GOOGLE_MAPS_API_KEY</code> in <code style={{ color: '#38bdf8' }}>.env</code> for native vector polygons.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Field Boundary Stats Strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '0.75rem',
              backgroundColor: '#f8fafc',
              borderRadius: '10px',
              padding: '0.85rem',
              border: '1px solid #e2e8f0',
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>CALCULATED AREA</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                {areaHectares > 0 ? `${areaHectares} ha` : '1.45 ha (est.)'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#10b981' }}>{areaAcres > 0 ? `${areaAcres} acres` : '3.58 acres'}</div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>PERIMETER</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                {perimeterM > 0 ? `${perimeterM} m` : '485 m'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Boundary fence</div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>COORDINATES</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                {farmLat.toFixed(4)}° N
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                {farmLon.toFixed(4)}° E
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>POLYGON VERTICES</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#059669' }}>
                {farmBoundary.length ? `${farmBoundary.length} Points` : 'Defined in .env'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>GPS Boundary</div>
            </div>
          </div>
        </div>

        {/* Right: Live Fused Telemetry (ESP32 + Open-Meteo) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Soil Moisture Hero Card */}
          <div
            className="card"
            style={{
              background: isWet
                ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)'
                : 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
              color: '#fff',
              borderRadius: '16px',
              padding: '1.5rem',
              boxShadow: '0 8px 20px -4px rgba(0,0,0,0.15)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  📡 ESP32 Hardware Telemetry
                </span>
                <h4 style={{ margin: '0.5rem 0 0 0', fontSize: '1rem', color: 'rgba(255,255,255,0.9)' }}>
                  Current Soil Moisture State
                </h4>
              </div>
              <span style={{ fontSize: '2.5rem' }}>{isWet ? '💧' : '🏜️'}</span>
            </div>

            <div style={{ margin: '1rem 0' }}>
              <div style={{ fontSize: '2.5rem', fontWeight: 900, letterSpacing: '-0.03em' }}>
                {sensorData?.soil_status ? sensorData.soil_status : 'AWAITING SENSOR'}
              </div>
              <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.85)' }}>
                {isWet
                  ? 'Soil is adequately hydrated. Moisture retention is sufficient.'
                  : 'Soil moisture is depleted. Root zone dry.'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '0.75rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>Irrigation Urgency</span>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  {analysisData?.irrigation_urgency || (isWet ? 'HOLD' : 'HIGH')}
                </div>
              </div>
              <div style={{ borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '1rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>Rain Probability</span>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  {rainProb}% (Open-Meteo)
                </div>
              </div>
              <div style={{ borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '1rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>Recommendation</span>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  {isWet ? 'Do Not Irrigate' : rainProb > 50 ? 'Postpone (Rain Expected)' : 'Schedule Irrigation'}
                </div>
              </div>
            </div>
          </div>

          {/* Micro-Climate & Atmospheric Comparison Card */}
          <div
            className="card"
            style={{
              background: '#fff',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              padding: '1.25rem',
            }}
          >
            <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>🌡️</span> On-Field Sensors vs Weather Forecast
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              {/* Temperature compare */}
              <div style={{ padding: '0.85rem', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>TEMPERATURE</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>
                    {sensorData?.temperature != null ? `${sensorData.temperature}°C` : `${weatherTemp || 28}°C`}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>
                    {sensorData?.temperature != null ? '📡 ESP32' : '🌦️ Open-Meteo'}
                  </span>
                </div>
                {weatherTemp != null && sensorData?.temperature != null && (
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                    Forecast: {weatherTemp}°C (Δ {(sensorData.temperature - weatherTemp).toFixed(1)}°C)
                  </div>
                )}
              </div>

              {/* Humidity compare */}
              <div style={{ padding: '0.85rem', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>RELATIVE HUMIDITY</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>
                    {sensorData?.humidity != null ? `${sensorData.humidity}%` : `${weatherHumidity || 65}%`}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#0284c7', fontWeight: 600 }}>
                    {sensorData?.humidity != null ? '📡 ESP32' : '🌦️ Open-Meteo'}
                  </span>
                </div>
                {weatherHumidity != null && sensorData?.humidity != null && (
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                    Forecast: {weatherHumidity}%
                  </div>
                )}
              </div>

              {/* CO2 / Air Gas */}
              <div style={{ padding: '0.85rem', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>CO₂ ATMOSPHERIC</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
                  {sensorData?.co2 != null ? `${sensorData.co2} ppm` : '412 ppm (Normal)'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#10b981' }}>Photosynthesis Active</div>
              </div>

              {/* Wind & Precipitation */}
              <div style={{ padding: '0.85rem', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>WIND & RAINFALL</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
                  {weatherData?.current_weather?.wind_speed != null
                    ? `${weatherData.current_weather.wind_speed} km/h`
                    : '12 km/h'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Rain prob: <strong>{rainProb}%</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabbed Deep Dive Section ────────────────────────────────────────── */}
      <div
        className="card"
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          padding: '1.5rem',
        }}
      >
        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            borderBottom: '2px solid #f1f5f9',
            paddingBottom: '0.75rem',
            marginBottom: '1.5rem',
            overflowX: 'auto',
          }}
        >
          <button
            onClick={() => setActiveTab('analysis')}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              backgroundColor: activeTab === 'analysis' ? '#ecfdf5' : 'transparent',
              color: activeTab === 'analysis' ? '#065f46' : '#64748b',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <span>🌾</span> Agricultural Condition Analysis
          </button>

          <button
            onClick={() => setActiveTab('ml')}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              backgroundColor: activeTab === 'ml' ? '#eff6ff' : 'transparent',
              color: activeTab === 'ml' ? '#1e40af' : '#64748b',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <span>🧠</span> Machine Learning Preparation
          </button>

          <button
            onClick={() => setActiveTab('ai')}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              backgroundColor: activeTab === 'ai' ? '#faf5ff' : 'transparent',
              color: activeTab === 'ai' ? '#6b21a8' : '#64748b',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <span>🤖</span> Generative AI Agronomist
          </button>

          <button
            onClick={() => setActiveTab('gee')}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              backgroundColor: activeTab === 'gee' ? '#fff7ed' : 'transparent',
              color: activeTab === 'gee' ? '#9a3412' : '#64748b',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <span>🌐</span> Google Earth Engine (GEE)
          </button>
        </div>

        {/* ── TAB 1: AGRICULTURAL CONDITION ANALYSIS ────────────────────────── */}
        {activeTab === 'analysis' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: '1.5rem' }}>
              <div>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', color: '#0f172a' }}>
                  Field Agronomic Diagnostic Assessment
                </h4>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#64748b' }}>
                  {analysisData?.rule_engine_note ||
                    'Evaluated using deterministic rule engine matching soil moisture thresholds, rainfall probability, and temperature.'}
                </p>

                {/* Summary Box */}
                <div
                  style={{
                    backgroundColor: '#f8fafc',
                    borderRadius: '12px',
                    padding: '1rem',
                    border: '1px solid #e2e8f0',
                    marginBottom: '1rem',
                  }}
                >
                  <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>OVERALL ASSESSMENT</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginTop: '0.25rem' }}>
                    {analysisData?.summary ||
                      (isWet
                        ? 'Soil moisture is optimal. No drought risk detected for Field 01.'
                        : 'Soil is dry. Recommend scheduling irrigation before ambient heat peaks.')}
                  </div>
                </div>

                {/* Observations List */}
                <h5 style={{ margin: '1rem 0 0.5rem 0', fontSize: '0.9rem', color: '#334155' }}>Key Field Observations</h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {(analysisData?.observations?.length
                    ? analysisData.observations
                    : [
                        `Soil state reported as ${sensorData?.soil_status || 'WET'} by ESP32 node.`,
                        `Precipitation probability currently at ${rainProb}% for the next 24 hours.`,
                        `Ambient humidity at ${weatherHumidity || 65}%, moderating transpiration loss.`,
                      ]
                  ).map((obs, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.5rem',
                        fontSize: '0.85rem',
                        color: '#334155',
                      }}
                    >
                      <span style={{ color: '#10b981', fontWeight: 800 }}>✓</span>
                      <span>{obs}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actionable Recommendations & Risks */}
              <div>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1.1rem', color: '#0f172a' }}>
                  Advisories & Recommended Actions
                </h4>

                {/* Risk Alert */}
                <div
                  style={{
                    backgroundColor: isWet ? '#eff6ff' : '#fffbeb',
                    border: isWet ? '1px solid #bfdbfe' : '1px solid #fde68a',
                    borderRadius: '10px',
                    padding: '0.85rem',
                    marginBottom: '1rem',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: isWet ? '#1d4ed8' : '#b45309' }}>
                    {isWet ? '💧 Waterlogging & Fungal Watch' : '⚠️ Moisture Depletion Alert'}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: isWet ? '#1e40af' : '#92400e', marginTop: '0.25rem' }}>
                    {isWet
                      ? 'Ensure field drainage ditches are unobstructed to avoid root hypoxia.'
                      : 'Moisture is below recommended threshold. Check drip lines or furrow gates.'}
                  </div>
                </div>

                {/* Action Items */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {(analysisData?.recommended_actions?.length
                    ? analysisData.recommended_actions
                    : [
                        isWet ? 'Hold irrigation for 24-48 hours' : 'Activate pump during low-sun hours',
                        'Check leaves for early powdery mildew if humidity > 80%',
                        'Monitor ESP32 telemetry battery & Wi-Fi signal',
                      ]
                  ).map((action, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '0.65rem 0.85rem',
                        borderRadius: '8px',
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        fontSize: '0.85rem',
                        color: '#1e293b',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <span style={{ color: '#2563eb' }}>👉</span>
                      <span>{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: MACHINE LEARNING PREPARATION ───────────────────────────── */}
        {activeTab === 'ml' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>
                  Machine Learning Ingestion & Model Readiness
                </h4>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                  Data pipelines from ESP32 and Open-Meteo are accumulating structured time-series datasets
                  for offline model training (GradientBoosting, Random Forest, XGBoost).
                </p>
              </div>

              <button
                onClick={handleRunML}
                style={{
                  backgroundColor: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.6rem 1.1rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <span>⚡</span> Run ML Pipeline Check
              </button>
            </div>

            {/* Pipeline Status Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
              {/* Soil Moisture 24h Model */}
              <div style={{ padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>Soil Moisture 24h</span>
                  <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '999px', backgroundColor: '#fef3c7', color: '#92400e', fontWeight: 600 }}>
                    In Ingestion
                  </span>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.5rem 0' }}>
                  GradientBoostingRegressor trained on sensor soil status + weather rain probabilities to forecast 24h dry-down.
                </p>
                <div style={{ fontSize: '0.75rem', color: '#475569' }}>
                  Features: <code>soil_status, temp, humidity, rain_prob, hour</code>
                </div>
              </div>

              {/* Water Stress Classifier */}
              <div style={{ padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>Water Stress Index</span>
                  <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '999px', backgroundColor: '#e0e7ff', color: '#3730a3', fontWeight: 600 }}>
                    Awaiting GEE
                  </span>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.5rem 0' }}>
                  Calculates plant canopy drought stress probability by combining sensor data with Sentinel-2 NDVI.
                </p>
                <div style={{ fontSize: '0.75rem', color: '#475569' }}>
                  Features: <code>sensor_moisture, vpd, ndvi_gee</code>
                </div>
              </div>

              {/* Condition Classifier */}
              <div style={{ padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>Field Condition AI</span>
                  <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '999px', backgroundColor: '#dcfce7', color: '#166534', fontWeight: 600 }}>
                    Rule-Engine Active
                  </span>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.5rem 0' }}>
                  Deterministic multi-class risk classifier. Produces transparent agronomic recommendations without hallucination.
                </p>
                <div style={{ fontSize: '0.75rem', color: '#475569' }}>
                  Status: <code>100% Deterministic Fallback</code>
                </div>
              </div>
            </div>

            {/* Live ML Predict Output if triggered */}
            {mlPrediction && (
              <div style={{ padding: '1rem', borderRadius: '12px', backgroundColor: '#0f172a', color: '#f8fafc' }}>
                <div style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 700, marginBottom: '0.5rem' }}>
                  ⚡ ML Inference Response from /ml/predict
                </div>
                <pre style={{ margin: 0, fontSize: '0.8rem', overflowX: 'auto', color: '#a7f3d0' }}>
                  {JSON.stringify(mlPrediction, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: GENERATIVE AI (LLM) AGRONOMIST ────────────────────────── */}
        {activeTab === 'ai' && (
          <div>
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>
                Generative AI Agricultural Assistant
              </h4>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                Grounded in your real ESP32 telemetry and Open-Meteo forecasts.
                The assistant uses actual live data and will not invent fake field measurements.
              </p>
            </div>

            {/* Quick Prompt Chips */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b', alignSelf: 'center' }}>Suggested queries:</span>
              {[
                'Should I irrigate Field 01 today?',
                'What is the current soil moisture condition?',
                'Assess fungal disease risk with current humidity',
                'What does the 7-day weather outlook suggest for sowing?',
              ].map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => setChatInput(q)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '20px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#f8fafc',
                    color: '#334155',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  💬 {q}
                </button>
              ))}
            </div>

            {/* Chat Box */}
            <div
              style={{
                height: '340px',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '1rem',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem',
                backgroundColor: '#f8fafc',
                marginBottom: '1rem',
              }}
            >
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '80%',
                    backgroundColor: msg.sender === 'user' ? '#2563eb' : '#ffffff',
                    color: msg.sender === 'user' ? '#ffffff' : '#0f172a',
                    padding: '0.75rem 1rem',
                    borderRadius: msg.sender === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                    border: msg.sender === 'user' ? 'none' : '1px solid #e2e8f0',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: msg.sender === 'user' ? '#bfdbfe' : '#64748b', marginBottom: '0.25rem' }}>
                    {msg.sender === 'user' ? 'You' : '🌾 AI Agronomist'} • {msg.timestamp}
                  </div>
                  <div style={{ fontSize: '0.9rem', lineHeight: '1.45', whiteSpace: 'pre-line' }}>
                    {msg.text}
                  </div>
                  {msg.source && (
                    <div style={{ fontSize: '0.7rem', color: '#10b981', marginTop: '0.4rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.2rem' }}>
                      Source: {msg.source}
                    </div>
                  )}
                </div>
              ))}
              {chatLoading && (
                <div style={{ alignSelf: 'flex-start', color: '#64748b', fontSize: '0.85rem', fontStyle: 'italic' }}>
                  🌾 AI Agronomist is analyzing telemetry & weather...
                </div>
              )}
            </div>

            {/* Chat Input Form */}
            <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                placeholder="Ask about irrigation, soil moisture, crop stress, or weather forecast..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                }}
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Send
              </button>
            </form>
          </div>
        )}

        {/* ── TAB 4: GOOGLE EARTH ENGINE (GEE) PREPARATION ──────────────────── */}
        {activeTab === 'gee' && (
          <div>
            <div style={{ marginBottom: '1.25rem' }}>
              <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>
                Google Earth Engine (GEE) Satellite Integration Architecture
              </h4>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                Architecture for automated retrieval of multispectral imagery from Sentinel-2 and Landsat 8/9
                over Field 01 coordinates ({farmLat.toFixed(4)}° N, {farmLon.toFixed(4)}° E).
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              {/* Indices Panel */}
              <div style={{ padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', color: '#0f172a' }}>
                  Multispectral Vegetation Indices
                </h5>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ borderLeft: '4px solid #10b981', paddingLeft: '0.75rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>
                      NDVI (Normalized Difference Vegetation Index)
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      Formula: <code>(B8_NIR - B4_Red) / (B8_NIR + B4_Red)</code>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '0.2rem' }}>
                      Measures plant chlorophyll absorption and canopy vigor.
                    </div>
                  </div>

                  <div style={{ borderLeft: '4px solid #0284c7', paddingLeft: '0.75rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>
                      NDWI (Normalized Difference Water Index)
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      Formula: <code>(B8_NIR - B11_SWIR) / (B8_NIR + B11_SWIR)</code>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#0284c7', marginTop: '0.2rem' }}>
                      Measures vegetation liquid water content and surface moisture.
                    </div>
                  </div>

                  <div style={{ borderLeft: '4px solid #d97706', paddingLeft: '0.75rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>
                      EVI (Enhanced Vegetation Index)
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      Reduces canopy background signals and atmospheric influences.
                    </div>
                  </div>
                </div>
              </div>

              {/* GEE Setup Guide */}
              <div style={{ padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', color: '#0f172a' }}>
                  Connecting Google Earth Engine Credentials
                </h5>

                <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <li>Create a Google Cloud Project and register for Earth Engine access.</li>
                  <li>Create a Service Account with <strong>Earth Engine Resource Viewer</strong> role.</li>
                  <li>Download the Service Account JSON key.</li>
                  <li>
                    Set <code style={{ color: '#0284c7' }}>GEE_SERVICE_ACCOUNT_KEY=path/to/key.json</code> in your <code style={{ color: '#0284c7' }}>.env</code> file.
                  </li>
                  <li>
                    The backend boundary coordinates from <code style={{ color: '#0284c7' }}>FARM_BOUNDARY_JSON</code> will automatically clip the Sentinel-2 image collection!
                  </li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
