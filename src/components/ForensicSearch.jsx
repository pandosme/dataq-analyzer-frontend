import { useEffect, useRef, useState } from 'react';
import { useUserPreferences } from '../context/UserPreferencesContext';
import { formatDateTime as formatDateTimeUtil } from '../utils/dateFormat';
import CameraSelector from './CameraSelector';
import WebSocketVideoPlayer from './WebSocketVideoPlayer';
import './ForensicSearch.css';

function ForensicSearch({ pathData, backgroundImage, selectedCamera, onCameraChange, onQuery, loading }) {
  const { dateFormat, timeFormat, videoPreTime, videoPostTime } = useUserPreferences();
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const videoRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [selectedPath, setSelectedPath] = useState(null);
  const [drawingMode, setDrawingMode] = useState(null); // 'entry' or 'exit'
  const [entryArea, setEntryArea] = useState(null);
  const [exitArea, setExitArea] = useState(null);
  const [drawStart, setDrawStart] = useState(null);
  const [videoInfo, setVideoInfo] = useState(null); // { serial, timestamp, preTime, postTime }
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [queryLimit, setQueryLimit] = useState(500); // Maximum number of results to fetch

  // Filter states
  const [filters, setFilters] = useState({
    class: '',
    timeRange: '24hours', // time period selection
    direction: '',
    minDwell: 0,
    color1: '',
    minAge: 0,
    anomalyOnly: false,
  });

  // Note: Video playback is now handled via WebSocket
  // Backend handles recording server connection (VideoX, Milestone, etc.)

  // Convert time range selection to hours
  const getTimeRangeHours = (selection) => {
    const ranges = {
      '3hours': 3,
      '6hours': 6,
      '12hours': 12,
      '24hours': 24,
      '2days': 48,
      '3days': 72,
      '4days': 96,
      '5days': 120,
      'week': 168,
      '2weeks': 336,
      '3weeks': 504,
      'month': 720,
      '2months': 1440,
    };
    return ranges[selection] || 24;
  };

  // Clear state when camera changes
  useEffect(() => {
    if (!selectedCamera) {
      // No camera selected - clear everything
      setSelectedPath(null);
      setVideoInfo(null);
      setEntryArea(null);
      setExitArea(null);
      setDrawingMode(null);
      setDrawStart(null);
      setImageLoaded(false);
      return;
    }

    // Camera changed - clear selections and areas but keep filters
    setSelectedPath(null);
    setVideoInfo(null);
    setEntryArea(null);
    setExitArea(null);
    setDrawingMode(null);
    setDrawStart(null);
    setImageLoaded(false);

    // Clear canvas
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, [selectedCamera]);

  // Load background image
  useEffect(() => {
    if (!backgroundImage) return;

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
    };
    img.onerror = () => {
      console.error('Failed to load background image');
      setImageLoaded(false);
    };
    img.src = backgroundImage;
  }, [backgroundImage]);

  // Helper: Get color for object class
  const getColorForClass = (className) => {
    const colors = {
      Car: '#FFFF00',
      Human: '#00FF00',
      Truck: '#0000FF',
      Bus: '#FFA500',
      Bike: '#FF1493',
      LicensePlate: '#00BFFF',
      Bag: '#800080',
      Head: '#FFD700',
      Animal: '#7FFF00',
      Vehicle: '#00FFFF',
      Other: '#FF0000',
    };
    return colors[className] || '#FF0000';
  };

  // Helper: Convert hex to RGB
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 255, g: 0, b: 0 };
  };

  // Helper: Check if point is in box
  const isPointInBox = (point, box) => {
    if (!box) return true;
    const minX = Math.min(box.x1, box.x2);
    const maxX = Math.max(box.x1, box.x2);
    const minY = Math.min(box.y1, box.y2);
    const maxY = Math.max(box.y1, box.y2);
    return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
  };

  // Filter paths based on criteria
  const filteredPaths = pathData.filter((pathEvent) => {
    // Class filter
    if (filters.class && pathEvent.class !== filters.class) return false;

    // Time range filter (MUST)
    const pathTime = new Date(pathEvent.timestamp);
    const hours = getTimeRangeHours(filters.timeRange);
    const hoursAgo = new Date(Date.now() - hours * 60 * 60 * 1000);
    if (pathTime < hoursAgo) return false;

    // Entry area filter
    if (entryArea && pathEvent.path && pathEvent.path.length > 0) {
      const firstPoint = pathEvent.path[0];
      if (!isPointInBox(firstPoint, entryArea)) return false;
    }

    // Exit area filter
    if (exitArea && pathEvent.path && pathEvent.path.length > 0) {
      const lastPoint = pathEvent.path[pathEvent.path.length - 1];
      if (!isPointInBox(lastPoint, exitArea)) return false;
    }

    // Direction filter
    if (filters.direction && pathEvent.dx !== undefined && pathEvent.dy !== undefined) {
      const { dx, dy } = pathEvent;
      switch (filters.direction) {
        case 'right':
          if (dx <= 0) return false;
          break;
        case 'left':
          if (dx >= 0) return false;
          break;
        case 'down':
          if (dy <= 0) return false;
          break;
        case 'up':
          if (dy >= 0) return false;
          break;
      }
    }

    // Min dwell filter
    if (filters.minDwell > 0 && (!pathEvent.dwell || pathEvent.dwell < filters.minDwell))
      return false;

    // Color1 filter
    if (filters.color1 && pathEvent.color1 !== filters.color1) return false;

    // Min age filter
    if (filters.minAge > 0 && (!pathEvent.age || pathEvent.age < filters.minAge)) return false;

    // Anomaly filter
    if (filters.anomalyOnly && !pathEvent.anomaly) return false;

    return true;
  });

  // Draw paths on canvas
  useEffect(() => {
    // Need either loaded image or video to draw
    if ((!imageLoaded || !imageRef.current) && !videoInfo) return;
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // When video is playing, canvas is already sized by onLoadedMetadata
    // When showing static image, size canvas to match image
    if (!videoInfo && imageRef.current) {
      const img = imageRef.current;
      canvas.width = img.width;
      canvas.height = img.height;
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background image only if not showing video
    if (!videoInfo && imageRef.current) {
      const img = imageRef.current;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }

    // Draw entry area
    if (entryArea) {
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      const x = (Math.min(entryArea.x1, entryArea.x2) / 1000) * canvas.width;
      const y = (Math.min(entryArea.y1, entryArea.y2) / 1000) * canvas.height;
      const w = (Math.abs(entryArea.x2 - entryArea.x1) / 1000) * canvas.width;
      const h = (Math.abs(entryArea.y2 - entryArea.y1) / 1000) * canvas.height;
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }

    // Draw exit area
    if (exitArea) {
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      const x = (Math.min(exitArea.x1, exitArea.x2) / 1000) * canvas.width;
      const y = (Math.min(exitArea.y1, exitArea.y2) / 1000) * canvas.height;
      const w = (Math.abs(exitArea.x2 - exitArea.x1) / 1000) * canvas.width;
      const h = (Math.abs(exitArea.y2 - exitArea.y1) / 1000) * canvas.height;
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }

    // Draw paths
    const pathsToDraw = selectedPath ? [selectedPath] : filteredPaths;

    pathsToDraw.forEach((pathEvent) => {
      if (!pathEvent.path || pathEvent.path.length === 0) return;

      const colorHex = getColorForClass(pathEvent.class);
      const colorRgb = hexToRgb(colorHex);

      ctx.strokeStyle = `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.8)`;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      pathEvent.path.forEach((point, index) => {
        const x = (point.x / 1000) * canvas.width;
        const y = (point.y / 1000) * canvas.height;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Draw entry point (green circle)
      const firstPoint = pathEvent.path[0];
      const fx = (firstPoint.x / 1000) * canvas.width;
      const fy = (firstPoint.y / 1000) * canvas.height;
      ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
      ctx.beginPath();
      ctx.arc(fx, fy, 5, 0, 2 * Math.PI);
      ctx.fill();

      // Draw exit point (red circle)
      const lastPoint = pathEvent.path[pathEvent.path.length - 1];
      const lx = (lastPoint.x / 1000) * canvas.width;
      const ly = (lastPoint.y / 1000) * canvas.height;
      ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
      ctx.beginPath();
      ctx.arc(lx, ly, 5, 0, 2 * Math.PI);
      ctx.fill();
    });
  }, [imageLoaded, filteredPaths, selectedPath, entryArea, exitArea, videoInfo]);

  // Handle canvas mouse events for drawing areas
  const handleCanvasMouseDown = (e) => {
    if (!drawingMode) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1000;
    const y = ((e.clientY - rect.top) / rect.height) * 1000;

    setDrawStart({ x, y });
  };

  const handleCanvasMouseUp = (e) => {
    if (!drawingMode || !drawStart) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1000;
    const y = ((e.clientY - rect.top) / rect.height) * 1000;

    const area = {
      x1: drawStart.x,
      y1: drawStart.y,
      x2: x,
      y2: y,
    };

    if (drawingMode === 'entry') {
      setEntryArea(area);
    } else if (drawingMode === 'exit') {
      setExitArea(area);
    }

    setDrawingMode(null);
    setDrawStart(null);
  };

  // Handle canvas click to close video (only when overlay is active)
  const handleCanvasClick = (e) => {
    // If video is playing and canvas is in overlay mode, close the video
    if (videoInfo) {
      setVideoInfo(null);
      setSelectedPath(null);
    }
  };

  // Format date/time using system date format setting
  const formatDateTime = (timestamp) => {
    return formatDateTimeUtil(timestamp, dateFormat, timeFormat);
  };

  // Handle Query/Refresh button click
  const handleQuery = () => {
    if (!selectedCamera) {
      setToastMessage('Please select a camera first');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      return;
    }

    // Call parent's onQuery with limit
    if (onQuery) {
      onQuery({ limit: queryLimit });
    }
  };

  // Handle row click to select path and play video
  const handleRowClick = (pathEvent) => {
    // Toggle selection
    const newSelectedPath = selectedPath === pathEvent ? null : pathEvent;
    setSelectedPath(newSelectedPath);

    // If selecting a new path, request video via WebSocket
    // Use user's preferred pre/post time (which may override system defaults)
    if (newSelectedPath && newSelectedPath.serial && newSelectedPath.timestamp) {
      // Calculate correct video timing:
      // IMPORTANT: timestamp = when MQTT message sent (tracking completed/object exited)
      // - timestamp: when object exited/tracking completed (NOT when first detected)
      // - age: how long object was in scene (seconds)
      // - Object entered at: timestamp - age
      // - Object exited at: timestamp
      // - Start: (timestamp - age) - preTime = timestamp - age - preTime
      // - End: timestamp + postTime
      // - Duration: preTime + age + postTime
      const age = newSelectedPath.age || 0;

      setVideoInfo({
        serial: newSelectedPath.serial,
        timestamp: newSelectedPath.timestamp,
        preTime: videoPreTime,
        postTime: videoPostTime,
        age: age
      });
    } else {
      // Deselecting - clear video
      setVideoInfo(null);
    }
  };

  return (
    <div className="forensic-search">
      {/* Left Panel - Filters */}
      <div className="forensic-left-panel">
        <div className="camera-selector-container">
          <CameraSelector selectedCamera={selectedCamera} onCameraChange={onCameraChange} />
        </div>
        <h3>Filters</h3>
        <div className="filter-grid">
          {/* Row 1: Time & Min Age */}
          <div className="filter-row">
            <div className="filter-group">
              <label>Time *</label>
              <select
                value={filters.timeRange}
                onChange={(e) => setFilters({ ...filters, timeRange: e.target.value })}
              >
                <option value="3hours">Last 3 hours</option>
                <option value="6hours">Last 6 hours</option>
                <option value="12hours">Last 12 hours</option>
                <option value="24hours">Last 24 hours</option>
                <option value="2days">Last 2 days</option>
                <option value="3days">Last 3 days</option>
                <option value="4days">Last 4 days</option>
                <option value="5days">Last 5 days</option>
                <option value="week">Last week</option>
                <option value="2weeks">Last 2 weeks</option>
                <option value="3weeks">Last 3 weeks</option>
                <option value="month">Last month</option>
                <option value="2months">Last 2 months</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Min Age (s)</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={filters.minAge}
                onChange={(e) =>
                  setFilters({ ...filters, minAge: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
          </div>

          {/* Row 2: Object Class & Color */}
          <div className="filter-row">
            <div className="filter-group">
              <label>Object Class</label>
              <select
                value={filters.class}
                onChange={(e) => setFilters({ ...filters, class: e.target.value })}
              >
                <option value="">All</option>
                <option value="Human">Human</option>
                <option value="Car">Car</option>
                <option value="Truck">Truck</option>
                <option value="Bus">Bus</option>
                <option value="Bike">Bike</option>
                <option value="LicensePlate">LicensePlate</option>
                <option value="Head">Head</option>
                <option value="Bag">Bag</option>
                <option value="Vehicle">Vehicle</option>
                <option value="Animal">Animal</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Color 1</label>
              <select
                value={filters.color1}
                onChange={(e) => setFilters({ ...filters, color1: e.target.value })}
              >
                <option value="">All</option>
                <option value="White">White</option>
                <option value="Black">Black</option>
                <option value="Red">Red</option>
                <option value="Blue">Blue</option>
                <option value="Green">Green</option>
                <option value="Yellow">Yellow</option>
                <option value="Beige">Beige</option>
              </select>
            </div>
          </div>

          {/* Row 3: Direction & Min Dwell */}
          <div className="filter-row">
            <div className="filter-group">
              <label>Direction</label>
              <select
                value={filters.direction}
                onChange={(e) => setFilters({ ...filters, direction: e.target.value })}
              >
                <option value="">All</option>
                <option value="up">Up</option>
                <option value="down">Down</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Min Dwell (s)</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={filters.minDwell}
                onChange={(e) =>
                  setFilters({ ...filters, minDwell: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
          </div>

          {/* Row 4: Anomaly (Full Width) */}
          <div className="filter-row-full">
            <div className="filter-group">
              <div className="checkbox-wrapper">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.anomalyOnly}
                    onChange={(e) => setFilters({ ...filters, anomalyOnly: e.target.checked })}
                  />
                  <span>Anomaly Only</span>
                </label>
              </div>
            </div>
          </div>

          {/* Row 5: Area Buttons on Same Row */}
          <div className="filter-row">
            <div className="filter-group">
              <div className="area-button-wrapper">
                <button
                  className={`btn-area ${drawingMode === 'entry' ? 'active' : ''}`}
                  onClick={() => setDrawingMode(drawingMode === 'entry' ? null : 'entry')}
                >
                  {entryArea ? '✓ ' : ''}Entry Area
                </button>
                {entryArea && (
                  <button className="btn-clear" onClick={() => setEntryArea(null)}>
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="filter-group">
              <div className="area-button-wrapper">
                <button
                  className={`btn-area ${drawingMode === 'exit' ? 'active' : ''}`}
                  onClick={() => setDrawingMode(drawingMode === 'exit' ? null : 'exit')}
                >
                  {exitArea ? '✓ ' : ''}Exit Area
                </button>
                {exitArea && (
                  <button className="btn-clear" onClick={() => setExitArea(null)}>
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Row 6: Limit & Query Button */}
          <div className="filter-row">
            <div className="filter-group">
              <label>Max Results</label>
              <input
                type="number"
                min="1"
                max="10000"
                step="100"
                value={queryLimit}
                onChange={(e) => setQueryLimit(parseInt(e.target.value) || 500)}
              />
            </div>

            <div className="filter-group">
              <label>&nbsp;</label>
              <button
                className="btn-query"
                onClick={handleQuery}
                disabled={loading || !selectedCamera}
              >
                {loading ? 'Loading...' : 'Query / Refresh'}
              </button>
            </div>
          </div>
        </div>

        {drawingMode && (
          <div className="filter-info">
            <p className="drawing-hint">
              Click and drag on the image to draw {drawingMode} area
            </p>
          </div>
        )}
      </div>

      {/* Middle Panel - Image/Video with paths */}
      <div className="forensic-middle-panel">
        {!selectedCamera ? (
          <div className="no-camera-selected">
            <p>Select a camera to perform forensic search</p>
          </div>
        ) : (
          <div className="media-container">
            {!imageLoaded && !videoInfo && <div className="loading">Loading camera view...</div>}
            {videoInfo && (
              <WebSocketVideoPlayer
                serial={videoInfo.serial}
                timestamp={videoInfo.timestamp}
                preTime={videoInfo.preTime}
                postTime={videoInfo.postTime}
                age={videoInfo.age}
                onError={(error) => {
                  console.error('Video playback error:', error);
                  setToastMessage(error || 'Failed to load video');
                  setShowToast(true);
                  setTimeout(() => setShowToast(false), 3000);
                }}
                onClose={() => {
                  setVideoInfo(null);
                  setSelectedPath(null);
                }}
              />
            )}
            <canvas
              ref={canvasRef}
              className={`forensic-canvas ${drawingMode ? 'drawing-mode' : ''} ${videoInfo ? 'overlay-canvas' : ''}`}
              onMouseDown={handleCanvasMouseDown}
              onMouseUp={handleCanvasMouseUp}
              onClick={handleCanvasClick}
              style={{ display: imageLoaded || videoInfo ? 'block' : 'none' }}
            />
          </div>
        )}
      </div>

      {/* Right Panel - Table */}
      <div className="forensic-right-panel">
        <div className="results-header">
          <h3>Results</h3>
          <p className="result-count">
            Found: <strong>{filteredPaths.length}</strong> paths
          </p>
        </div>
        <div className="forensic-table-container">
          <table className="forensic-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Label</th>
                <th>Age (s)</th>
                <th>Anomaly</th>
              </tr>
            </thead>
            <tbody>
              {filteredPaths.map((pathEvent, index) => (
                <tr
                  key={pathEvent._id || index}
                  className={selectedPath === pathEvent ? 'selected' : ''}
                  onClick={() => handleRowClick(pathEvent)}
                >
                  <td>{formatDateTime(pathEvent.timestamp)}</td>
                  <td>
                    <span
                      className={`label-badge label-${pathEvent.class?.toLowerCase() || 'unknown'}`}
                    >
                      {pathEvent.class}
                    </span>
                  </td>
                  <td>{pathEvent.age?.toFixed(1) || 'N/A'}</td>
                  <td className="anomaly-cell">{pathEvent.anomaly || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredPaths.length === 0 && (
            <div className="no-results">No paths match the current filters</div>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      {showToast && (
        <div className="toast-notification">
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default ForensicSearch;
