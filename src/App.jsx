import { useState, useEffect, useCallback } from 'react';
import CameraSelector from './components/CameraSelector';
import FilterPanel from './components/FilterPanel';
import FlowHeatmap from './components/FlowHeatmap';
import DwellHeatmap from './components/DwellHeatmap';
import ForensicSearch from './components/ForensicSearch';
import LiveData from './components/LiveData';
import ThreeColumnLayout from './components/ThreeColumnLayout';
import Login from './components/Login';
import UserSettings from './components/UserSettings';
import Counters from './components/Counters';
import { pathsAPI, camerasAPI } from './services/api';
import { useAuth } from './context/AuthContext';
import { useWebSocket } from './context/WebSocketContext';
import './App.css';

const APPLICATIONS = [
  { id: 'flow-heatmap', name: 'Flow Heatmap', icon: '🔥' },
  { id: 'dwell-heatmap', name: 'Dwell Heatmap', icon: '⏱️' },
  { id: 'forensic-search', name: 'Forensic Search', icon: '🔍' },
  { id: 'counters', name: 'Counters', icon: '🔢' },
  { id: 'live-view', name: 'Live View', icon: '📡' },
];

function App() {
  const { isAuthenticated, loading: authLoading, user, server, logout } = useAuth();
  const { isConnected: wsConnected } = useWebSocket();
  const [selectedApplication, setSelectedApplication] = useState('flow-heatmap');
  const [selectedCamera, setSelectedCamera] = useState('');
  const [cameraDetails, setCameraDetails] = useState(null);
  const [filters, setFilters] = useState({});
  const [pathData, setPathData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  // Load camera details and snapshot when selected
  useEffect(() => {
    if (!isAuthenticated || !selectedCamera) {
      setCameraDetails(null);
      return;
    }

    const loadCameraDetails = async () => {
      try {
        const [camerasResponse, snapshotResponse] = await Promise.all([
          camerasAPI.getAll(),
          camerasAPI.getSnapshot(selectedCamera).catch((err) => {
            console.warn('Failed to load snapshot:', err);
            return null;
          }),
        ]);

        const camera = camerasResponse.data.find((c) => c.serialNumber === selectedCamera);

        if (import.meta.env.DEV) {
          console.log('Camera found:', camera);
          console.log('Snapshot response:', snapshotResponse);
        }

        // Add snapshot to camera details if available
        if (camera && snapshotResponse?.data) {
          camera.snapshot = snapshotResponse.data;
          if (import.meta.env.DEV) {
            console.log('Snapshot attached to camera:', camera.snapshot);
          }
        } else if (import.meta.env.DEV) {
          console.warn('No snapshot available for camera:', selectedCamera);
        }

        setCameraDetails(camera);
      } catch (err) {
        console.error('Error loading camera details:', err);
      }
    };

    loadCameraDetails();
  }, [selectedCamera, isAuthenticated]);

  // Load path data callback (for Flow Heatmap, Dwell Heatmap, and Forensic Search)
  const loadPathData = useCallback(async (options = null) => {
    if (!selectedCamera || !['flow-heatmap', 'dwell-heatmap', 'forensic-search'].includes(selectedApplication)) return;

    try {
      setLoading(true);
      setError(null);

      // Merge options with current filters (options override specific fields)
      const filtersToApply = options ? { ...filters, ...options } : filters;

      const queryFilters = {
        serial: selectedCamera,
        ...filtersToApply,
      };

      const pathsResponse = await pathsAPI.query(queryFilters);
      const events = pathsResponse.data || [];

      // Calculate statistics from loaded data
      const statsMap = {};
      events.forEach(event => {
        const className = event.class || 'Unknown';
        if (!statsMap[className]) {
          statsMap[className] = {
            _id: className,
            count: 0,
            totalAge: 0,
            totalDwell: 0,
          };
        }
        statsMap[className].count += 1;
        statsMap[className].totalAge += event.age || 0;
        statsMap[className].totalDwell += event.dwell || 0;
      });

      const calculatedStats = Object.values(statsMap).map(stat => ({
        _id: stat._id,
        count: stat.count,
        avgAge: stat.totalAge / stat.count,
        avgDwell: stat.totalDwell / stat.count,
      }));

      setPathData(events);
      setStats(calculatedStats);
    } catch (err) {
      setError('Failed to load path data');
      console.error('Error loading path data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedCamera, filters, selectedApplication]);

  // All applications now require manual query via "Query/Refresh" button
  // No auto-loading to give users full control over data queries

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="app-loading">
        <h2>Loading...</h2>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <Login />;
  }

  const handleCameraChange = (serialNumber) => {
    setSelectedCamera(serialNumber);
    setPathData([]);
    setStats(null);
  };

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    // For Flow and Dwell Heatmaps, trigger data load when filters are applied
    if (selectedApplication === 'flow-heatmap' || selectedApplication === 'dwell-heatmap') {
      loadPathData(newFilters);
    }
  };

  const handleApplicationChange = (appId) => {
    setSelectedApplication(appId);
    // Clear data when switching applications
    setPathData([]);
    setStats(null);
    setError(null);
  };

  // Use base64 snapshot if available — backend may use 'image' or 'base64Image'
  const rawSnap = cameraDetails?.snapshot?.image ?? cameraDetails?.snapshot?.base64Image ?? null;
  const backgroundImage = rawSnap
    ? (rawSnap.startsWith('data:') ? rawSnap : `data:image/jpeg;base64,${rawSnap}`)
    : null;

  if (import.meta.env.DEV && (selectedApplication === 'flow-heatmap' || selectedApplication === 'dwell-heatmap')) {
    console.log(`${selectedApplication} - Background Image:`,
      backgroundImage?.substring(0, 50) + (backgroundImage?.length > 50 ? '...' : ''));
    console.log(`${selectedApplication} - Camera details:`, cameraDetails);
    console.log(`${selectedApplication} - Path data length:`, pathData?.length);
  }

  const handleLogout = () => {
    logout();
    setSelectedCamera('');
    setPathData([]);
    setStats(null);
  };

  const currentApp = APPLICATIONS.find((app) => app.id === selectedApplication);

  // Shared three-column layout for Flow and Dwell heatmaps
  const renderHeatmap = (appId) => {
    const isFlow = appId === 'flow-heatmap';
    const statKey = isFlow ? 'avgAge' : 'avgDwell';
    const statLabel = isFlow ? 'Avg Age' : 'Avg Dwell';

    const leftPanel = (
      <div className="left-panel-content">
        <div className="panel-section">
          <h3>Camera</h3>
          <CameraSelector selectedCamera={selectedCamera} onCameraChange={handleCameraChange} />
        </div>
        <div className="panel-section">
          <h3>Filters</h3>
          <FilterPanel onFilterChange={handleFilterChange} cameraDetails={cameraDetails} />
        </div>
      </div>
    );

    const middlePanel = !selectedCamera ? (
      <div className="no-camera-selected">
        <p>Select a camera to view {isFlow ? 'flow' : 'dwell'} heatmap data</p>
      </div>
    ) : isFlow ? (
      <FlowHeatmap pathData={pathData} backgroundImage={backgroundImage} loading={loading} />
    ) : (
      <DwellHeatmap
        pathData={pathData}
        backgroundImage={backgroundImage}
        loading={loading}
        filters={filters}
        onQuery={loadPathData}
      />
    );

    const rightPanel = (
      <div className="right-panel-content">
        <div className="panel-section">
          <h3>Statistics</h3>
          {loading && <p className="loading-text">Loading...</p>}
          {error && <div className="error-message">{error}</div>}
          {!loading && !error && selectedCamera && (
            <p className="result-count">{pathData.length} paths loaded</p>
          )}
          {stats && stats.length > 0 && (
            <div className="stats-list">
              {stats.map((stat) => (
                <div key={stat._id} className="stat-item">
                  <strong className={`stat-class stat-class-${stat._id?.toLowerCase() || 'unknown'}`}>
                    {stat._id}:
                  </strong>
                  <ul>
                    <li>Count: {stat.count}</li>
                    <li>{statLabel}: {stat[statKey]?.toFixed(1)}s</li>
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );

    return (
      <ThreeColumnLayout leftPanel={leftPanel} middlePanel={middlePanel} rightPanel={rightPanel} />
    );
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>DataQ Analyzer</h1>
          <nav className="app-navigation">
            {APPLICATIONS.map((app) => (
              <button
                key={app.id}
                className={"nav-tab " + (selectedApplication === app.id ? 'active' : '') + " " + (app.disabled ? 'disabled' : '')}
                onClick={() => !app.disabled && handleApplicationChange(app.id)}
                disabled={app.disabled}
                title={app.disabled ? 'Coming soon' : app.name}
              >
                <span className="nav-icon">{app.icon}</span>
                <span className="nav-label">{app.name}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="header-right">
          <div className="header-actions">
            <div className="server-info">
              <span className="server-label">Server:</span>
              <span className="server-name" title={server?.url}>{server?.name}</span>
              <span style={{
                marginLeft: '8px',
                fontSize: '0.8em',
                color: wsConnected ? '#4caf50' : '#999',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <span style={{
                  display: 'inline-block',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: wsConnected ? '#4caf50' : '#999'
                }}></span>
                {wsConnected ? 'Live' : 'Offline'}
              </span>
            </div>
            <div className="user-menu">
              <button
                className="username-btn"
                onClick={() => setShowSettings(true)}
                title="Click to open settings"
              >
                {user?.username}
              </button>
              <button className="logout-btn" onClick={handleLogout} title="Logout">
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="main-content">
        {selectedApplication === 'live-view' && (
          <LiveData
            selectedCamera={selectedCamera}
            cameraDetails={cameraDetails}
            onCameraChange={handleCameraChange}
          />
        )}

        {selectedApplication === 'flow-heatmap' && renderHeatmap('flow-heatmap')}

        {selectedApplication === 'dwell-heatmap' && renderHeatmap('dwell-heatmap')}

        {selectedApplication === 'forensic-search' && (
          <ForensicSearch
            pathData={pathData}
            backgroundImage={backgroundImage}
            selectedCamera={selectedCamera}
            onCameraChange={handleCameraChange}
            onQuery={loadPathData}
            loading={loading}
            cameraDetails={cameraDetails}
          />
        )}

        {selectedApplication === 'counters' && <Counters />}
      </main>

      {showSettings && <UserSettings onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default App;
