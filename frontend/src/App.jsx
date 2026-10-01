import { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage';
import WeatherPage from './pages/WeatherPage';
import FarmersPage from './pages/FarmersPage';
import DashboardPage from './pages/DashboardPage';
import DiagnosePage from './pages/DiagnosePage';
import SoilPage from './pages/SoilPage';
import SeedsPage from './pages/SeedsPage';
import IoTPage from './pages/IoTPage';
import FieldMonitoringPage from './pages/FieldMonitoringPage';
import CropRecommendationPage from './pages/CropRecommendationPage';

const NAV = [
  { to: '/',                  icon: '🏠', label: 'Home' },
  { to: '/field-monitoring',  icon: '🗺️', label: 'Field Monitoring' },
  { to: '/weather',           icon: '🌐', label: 'Weather & Earth' },
  { to: '/farmers',           icon: '👨‍🌾', label: 'Farmers' },
  { to: '/iot',               icon: '📡', label: 'IoT Sensors' },
  { to: '/diagnose',          icon: '🔬', label: 'Diagnose' },
  { to: '/soil',              icon: '🧪', label: 'Soil Data' },
  { to: '/seeds',             icon: '🌱', label: 'Seed Exchange' },
  { to: '/crop-recommendation', icon: '🤖', label: 'Crop AI' },
];

function Sidebar({ open, onClose }) {
  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-brand">
        <h1>🌾 AgroIn</h1>
        <span>Agri-Advisory System</span>
      </div>
      <nav className="sidebar-nav">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            onClick={onClose}
            className={({ isActive }) => isActive ? 'active' : ''}
          >
            <span className="nav-icon">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">AgroIn v1.0 • Rover-Powered</div>
    </aside>
  );
}

function PageTitle() {
  const loc = useLocation();
  const titles = {
    '/': ['Home', 'System overview and quick stats'],
    '/field-monitoring': ['Agricultural Land Monitoring', 'Google Satellite map, field boundary, ESP32 telemetry, weather & AI analysis'],
    '/weather': ['Weather Prediction & Google Earth', '3-month seasonal weather forecast and satellite earth map'],
    '/farmers': ['Farmers', 'Manage registered farmer profiles'],
    '/iot': ['IoT Sensors', 'Real-time ESP32 sensor monitoring dashboard'],
    '/diagnose': ['Crop Diagnosis', 'Upload a plant photo for AI analysis'],
    '/soil': ['Soil Data', 'Browse rover soil telemetry readings'],
    '/seeds': ['Seed Exchange', 'Farmer-to-farmer seed marketplace'],
    '/crop-recommendation': ['AI Crop Recommendation', 'ML + IoT sensor data + Gemini AI advisory — find the best crop for your field'],
  };
  const path = loc.pathname;
  // Dashboard path handling
  if (path.startsWith('/dashboard/')) {
    return (
      <div className="page-header">
        <h2>Farmer Dashboard</h2>
        <p>Soil health, crop recommendations, and diagnosis history</p>
      </div>
    );
  }
  const [title, sub] = titles[path] || ['AgroIn', ''];
  return (
    <div className="page-header">
      <h2>{title}</h2>
      <p>{sub}</p>
    </div>
  );
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <BrowserRouter>
      <div className="app-layout">
        <button
          className="mobile-toggle"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle menu"
        >
          ☰
        </button>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="main-content">
          <PageTitle />
          <div className="page-body">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/field-monitoring" element={<FieldMonitoringPage />} />
              <Route path="/weather" element={<WeatherPage />} />
              <Route path="/farmers" element={<FarmersPage />} />
              <Route path="/dashboard/:farmerId" element={<DashboardPage />} />
              <Route path="/iot" element={<IoTPage />} />
              <Route path="/diagnose" element={<DiagnosePage />} />
              <Route path="/soil" element={<SoilPage />} />
              <Route path="/seeds" element={<SeedsPage />} />
              <Route path="/crop-recommendation" element={<CropRecommendationPage />} />
            </Routes>
          </div>
        </main>
      </div>
    </BrowserRouter>
  );
}
