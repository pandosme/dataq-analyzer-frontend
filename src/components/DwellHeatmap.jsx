import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import useContainerFit from '../hooks/useContainerFit';
import './DwellHeatmap.css';

// Grid resolution for heat accumulation (independent of canvas size)
const GRID_W = 200;
const GRID_H = 200;
const SPREAD = 14; // Gaussian spread in grid cells
const SIGMA2 = (SPREAD / 2.5) ** 2;

// AOI handle constants
const HANDLE_SIZE = 8;   // drawn size (px)
const HANDLE_HIT  = 14;  // hit-test radius (px)

// Default AOI = full image (no filtering effect)
const DEFAULT_AOI = { x1: 0, y1: 0, x2: 1, y2: 1 };

// HSV heat colour: t=0 → blue, t=1 → red
function heatColor(t) {
  const h = (1 - t) * 240; // 240° blue → 0° red
  const c = 1, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = 0;
  let r, g, b;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

// Check if a normalized coordinate (0–1) falls inside the AOI rect (also 0–1)
function insideAOI(normX, normY, aoi) {
  const x1 = Math.min(aoi.x1, aoi.x2), x2 = Math.max(aoi.x1, aoi.x2);
  const y1 = Math.min(aoi.y1, aoi.y2), y2 = Math.max(aoi.y1, aoi.y2);
  return normX >= x1 && normX <= x2 && normY >= y1 && normY <= y2;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Normalize an AOI so x1<x2, y1<y2
function normAoi(a) {
  return {
    x1: Math.min(a.x1, a.x2), y1: Math.min(a.y1, a.y2),
    x2: Math.max(a.x1, a.x2), y2: Math.max(a.y1, a.y2),
  };
}

// 8 handle positions around a rectangle
function handlePositions(a) {
  const n = normAoi(a);
  const mx = (n.x1 + n.x2) / 2, my = (n.y1 + n.y2) / 2;
  return [
    { key: 'tl', x: n.x1, y: n.y1, cursor: 'nwse-resize' },
    { key: 'tc', x: mx,   y: n.y1, cursor: 'ns-resize' },
    { key: 'tr', x: n.x2, y: n.y1, cursor: 'nesw-resize' },
    { key: 'ml', x: n.x1, y: my,   cursor: 'ew-resize' },
    { key: 'mr', x: n.x2, y: my,   cursor: 'ew-resize' },
    { key: 'bl', x: n.x1, y: n.y2, cursor: 'nesw-resize' },
    { key: 'bc', x: mx,   y: n.y2, cursor: 'ns-resize' },
    { key: 'br', x: n.x2, y: n.y2, cursor: 'nwse-resize' },
  ];
}

function DwellHeatmap({ pathData, backgroundImage, loading }) {
  const canvasRef  = useRef(null);
  const overlayRef = useRef(null);
  const containerRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [opacity, setOpacity]         = useState(0.75);
  const [minPointDwell, setMinPointDwell] = useState(0.5);
  const [mode, setMode]               = useState('points'); // 'points' | 'peak'
  const imageRef = useRef(null);

  // Compute image aspect ratio for container-fit sizing
  const imageAspect = useMemo(() => {
    if (!imageRef.current) return null;
    return imageRef.current.width / imageRef.current.height;
  }, [imageLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const fitted = useContainerFit(containerRef, imageAspect);

  // AOI: always exists, defaults to full image
  const [aoi, setAoi]           = useState(DEFAULT_AOI); // committed AOI for rendering
  const [editAoi, setEditAoi]   = useState(null);         // working copy during editing (null = not editing)
  const [aoiEditing, setAoiEditing] = useState(false);
  const dragRef = useRef(null); // { type: 'move'|'handle', handle?, startAoi, startMouse }

  const isFullImage = useCallback((a) => {
    return a.x1 <= 0.001 && a.y1 <= 0.001 && a.x2 >= 0.999 && a.y2 >= 0.999;
  }, []);

  // Load background image
  useEffect(() => {
    if (!backgroundImage) {
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      setImageLoaded(false);
      imageRef.current = null;
      return;
    }

    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setImageLoaded(false);
    imageRef.current = null;

    const img = new Image();
    img.onload = () => { imageRef.current = img; setImageLoaded(true); };
    img.onerror = () => { setImageLoaded(false); };
    img.src = backgroundImage;
  }, [backgroundImage]);

  // --- Build heat map and draw (uses committed aoi) ---
  useEffect(() => {
    if (!imageLoaded || !imageRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = imageRef.current;

    canvas.width = fitted.width || img.width;
    canvas.height = fitted.height || img.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    if (!pathData || pathData.length === 0) return;

    // --- Accumulate heat on a fixed-resolution grid ---
    const heat = new Float32Array(GRID_W * GRID_H);

    const addHeat = (normX, normY, weight) => {
      if (!insideAOI(normX, normY, aoi)) return;
      const gx = Math.round(normX * (GRID_W - 1));
      const gy = Math.round(normY * (GRID_H - 1));
      for (let dy = -SPREAD; dy <= SPREAD; dy++) {
        for (let dx = -SPREAD; dx <= SPREAD; dx++) {
          const nx = gx + dx, ny = gy + dy;
          if (nx >= 0 && nx < GRID_W && ny >= 0 && ny < GRID_H) {
            heat[ny * GRID_W + nx] += weight * Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA2));
          }
        }
      }
    };

    if (mode === 'peak') {
      pathData.forEach((event) => {
        const idle = event.maxIdle;
        if (!idle || idle < minPointDwell) return;
        const x = event.bx !== undefined ? event.bx / 1000 : (event.path?.[0]?.x ?? 500) / 1000;
        const y = event.by !== undefined ? event.by / 1000 : (event.path?.[0]?.y ?? 500) / 1000;
        addHeat(x, y, idle);
      });
    } else {
      pathData.forEach((event) => {
        if (!event.path || event.path.length === 0) return;
        const points = event.path.slice(0, -1);
        points.forEach((point) => {
          if (!point.d || point.d < minPointDwell) return;
          addHeat(point.x / 1000, point.y / 1000, point.d);
        });
      });
    }

    let maxHeat = 0;
    for (let i = 0; i < heat.length; i++) {
      if (heat[i] > maxHeat) maxHeat = heat[i];
    }
    if (maxHeat === 0) return;

    const imageData = new ImageData(GRID_W, GRID_H);
    for (let i = 0; i < GRID_W * GRID_H; i++) {
      const t = heat[i] / maxHeat;
      if (t < 0.02) continue;
      const [r, g, b] = heatColor(t);
      const alpha = Math.round(Math.min(t * 1.5, 1) * opacity * 255);
      imageData.data[i * 4 + 0] = r;
      imageData.data[i * 4 + 1] = g;
      imageData.data[i * 4 + 2] = b;
      imageData.data[i * 4 + 3] = alpha;
    }

    const offscreen = document.createElement('canvas');
    offscreen.width = GRID_W;
    offscreen.height = GRID_H;
    offscreen.getContext('2d').putImageData(imageData, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);

    // Draw AOI outline on heatmap canvas (only when not full-image)
    if (!isFullImage(aoi)) {
      const n = normAoi(aoi);
      const ax = n.x1 * canvas.width, ay = n.y1 * canvas.height;
      const aw = (n.x2 - n.x1) * canvas.width, ah = (n.y2 - n.y1) * canvas.height;
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(ax, ay, aw, ah);
      ctx.setLineDash([]);
      ctx.font = '13px sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      const tw = ctx.measureText('AOI').width;
      ctx.fillRect(ax, ay - 18, tw + 8, 18);
      ctx.fillStyle = '#00ff00';
      ctx.fillText('AOI', ax + 4, ay - 5);
    }

  }, [imageLoaded, pathData, opacity, minPointDwell, mode, aoi, isFullImage, fitted]);

  // --- AOI overlay: draw rect + handles while editing ---
  const drawOverlay = useCallback((a) => {
    const overlay = overlayRef.current;
    const canvas  = canvasRef.current;
    if (!overlay || !canvas) return;
    overlay.width  = canvas.width;
    overlay.height = canvas.height;
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const n  = normAoi(a);
    const ax = n.x1 * overlay.width,  ay = n.y1 * overlay.height;
    const aw = (n.x2 - n.x1) * overlay.width, ah = (n.y2 - n.y1) * overlay.height;

    // Dim outside AOI
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, overlay.width, overlay.height);
    ctx.clearRect(ax, ay, aw, ah);

    // Green border
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.strokeRect(ax, ay, aw, ah);

    // Handles
    ctx.fillStyle   = '#00ff00';
    ctx.strokeStyle = '#000';
    ctx.lineWidth   = 1;
    handlePositions(a).forEach((h) => {
      const hx = h.x * overlay.width  - HANDLE_SIZE / 2;
      const hy = h.y * overlay.height - HANDLE_SIZE / 2;
      ctx.fillRect(hx, hy, HANDLE_SIZE, HANDLE_SIZE);
      ctx.strokeRect(hx, hy, HANDLE_SIZE, HANDLE_SIZE);
    });

    // Label
    ctx.font      = 'bold 13px sans-serif';
    ctx.fillStyle = '#00ff00';
    ctx.fillText('AOI', ax + 4, ay - 5 > 14 ? ay - 5 : ay + 14);
  }, []);

  // Redraw overlay whenever editAoi changes
  useEffect(() => {
    if (!aoiEditing || !editAoi) return;
    drawOverlay(editAoi);
  }, [aoiEditing, editAoi, drawOverlay]);

  // Convert mouse event to normalized 0–1 coords relative to the overlay (which matches the canvas)
  const toNorm = useCallback((e) => {
    const el = overlayRef.current || canvasRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: clamp((e.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((e.clientY - rect.top) / rect.height, 0, 1),
    };
  }, []);

  // Hit-test: which handle (if any) is near the mouse?
  const hitTestHandle = useCallback((a, mx, my) => {
    const el = overlayRef.current || canvasRef.current;
    if (!el) return null;
    const cw = el.getBoundingClientRect().width;
    const ch = el.getBoundingClientRect().height;
    for (const h of handlePositions(a)) {
      const dx = (h.x - mx) * cw;
      const dy = (h.y - my) * ch;
      if (Math.abs(dx) < HANDLE_HIT && Math.abs(dy) < HANDLE_HIT) return h;
    }
    return null;
  }, []);

  // Hit-test: is mouse inside the AOI rect body?
  const hitTestBody = useCallback((a, mx, my) => {
    const n = normAoi(a);
    return mx >= n.x1 && mx <= n.x2 && my >= n.y1 && my <= n.y2;
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (!aoiEditing || !editAoi) return;
    e.preventDefault();
    const p = toNorm(e);
    const h = hitTestHandle(editAoi, p.x, p.y);
    if (h) {
      dragRef.current = { type: 'handle', handle: h.key, startAoi: { ...editAoi }, startMouse: p };
      return;
    }
    if (hitTestBody(editAoi, p.x, p.y)) {
      dragRef.current = { type: 'move', startAoi: { ...editAoi }, startMouse: p };
    }
  }, [aoiEditing, editAoi, toNorm, hitTestHandle, hitTestBody]);

  const handleMouseMove = useCallback((e) => {
    if (!aoiEditing || !editAoi) return;
    const p = toNorm(e);

    // Update cursor
    const overlay = overlayRef.current;
    if (overlay && !dragRef.current) {
      const h = hitTestHandle(editAoi, p.x, p.y);
      if (h) { overlay.style.cursor = h.cursor; }
      else if (hitTestBody(editAoi, p.x, p.y)) { overlay.style.cursor = 'move'; }
      else { overlay.style.cursor = 'default'; }
    }

    if (!dragRef.current) return;

    const d  = dragRef.current;
    const dx = p.x - d.startMouse.x;
    const dy = p.y - d.startMouse.y;
    const sa = d.startAoi;

    if (d.type === 'move') {
      const n = normAoi(sa);
      const w = n.x2 - n.x1, h = n.y2 - n.y1;
      let nx1 = n.x1 + dx, ny1 = n.y1 + dy;
      nx1 = clamp(nx1, 0, 1 - w);
      ny1 = clamp(ny1, 0, 1 - h);
      setEditAoi({ x1: nx1, y1: ny1, x2: nx1 + w, y2: ny1 + h });
    } else if (d.type === 'handle') {
      const n = normAoi(sa);
      let { x1, y1, x2, y2 } = n;
      const k = d.handle;
      if (k.includes('l'))  x1 = clamp(n.x1 + dx, 0, x2 - 0.02);
      if (k.includes('r'))  x2 = clamp(n.x2 + dx, x1 + 0.02, 1);
      if (k.includes('t'))  y1 = clamp(n.y1 + dy, 0, y2 - 0.02);
      if (k.includes('b'))  y2 = clamp(n.y2 + dy, y1 + 0.02, 1);
      setEditAoi({ x1, y1, x2, y2 });
    }
  }, [aoiEditing, editAoi, toNorm, hitTestHandle, hitTestBody]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // --- Button handlers ---
  const enterEdit = useCallback(() => {
    setEditAoi({ ...aoi });
    setAoiEditing(true);
  }, [aoi]);

  const saveAoi = useCallback(() => {
    if (editAoi) setAoi(normAoi(editAoi));
    setAoiEditing(false);
    setEditAoi(null);
  }, [editAoi]);

  const resetAoi = useCallback(() => {
    setAoi(DEFAULT_AOI);
    setEditAoi(null);
    setAoiEditing(false);
  }, []);

  return (
    <div className="dwell-heatmap">
      {/* Controls */}
      <div className="heatmap-controls">
        <div className="control-group">
          <label>Mode</label>
          <div className="mode-toggle">
            <button
              className={mode === 'points' ? 'active' : ''}
              onClick={() => setMode('points')}
              title="Uses every point along each tracked path. Each point is weighted by how long the object paused there. Gives a detailed, granular heatmap."
            >Path Points</button>
            <button
              className={mode === 'peak' ? 'active' : ''}
              onClick={() => setMode('peak')}
              title="Uses only the single location per path where the object was stationary the longest. Best for identifying queuing spots and waiting areas."
            >Peak Idle</button>
          </div>
        </div>
        <div className="control-group">
          <label>Min Idle: {minPointDwell}s</label>
          <input
            type="range" min="0.1" max="120" step="0.1"
            value={minPointDwell}
            onChange={(e) => setMinPointDwell(parseFloat(e.target.value))}
            title="Only include points where the object was idle for at least this many seconds. Increase to focus on longer stops, decrease to include brief pauses."
          />
        </div>
        <div className="control-group">
          <label>Intensity: {Math.round(opacity * 100)}%</label>
          <input
            type="range" min="0.1" max="1" step="0.05"
            value={opacity}
            onChange={(e) => setOpacity(parseFloat(e.target.value))}
            title="Controls the opacity of the heatmap overlay on top of the camera image. Lower values make the background more visible."
          />
        </div>
        <div className="control-group aoi-controls">
          <label title="Limit the heatmap to a specific area. Useful for excluding zones with known high idle times (e.g. parked vehicles, waiting areas) so you can focus on the area you want to analyze.">Area of Interest</label>
          <div className="aoi-buttons">
            {!aoiEditing ? (
              <button className="btn-small btn-secondary" onClick={enterEdit} title="Draw a rectangle to focus the heatmap on a specific area, excluding surrounding zones with high idle times that may dominate the visualization.">
                AOI
              </button>
            ) : (
              <button className="btn-small btn-aoi-save" onClick={saveAoi} title="Apply the selected area and redraw the heatmap using only data within this region.">
                Save AOI
              </button>
            )}
            {!isFullImage(aoi) && !aoiEditing && (
              <button className="btn-small btn-secondary" onClick={resetAoi} title="Remove the area filter and show the heatmap for the entire camera view.">
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Colour legend */}
      <div className="dwell-legend">
        <span className="legend-label">Low</span>
        <div className="gradient-bar"></div>
        <span className="legend-label">High dwell</span>
      </div>

      <div className="canvas-container" ref={containerRef}>
        {loading && <div className="loading">Loading...</div>}
        {!imageLoaded && !loading && <div className="loading">Loading camera view...</div>}
        <div className="canvas-wrapper">
          <canvas
            ref={canvasRef}
            className="heatmap-canvas"
            style={{ display: imageLoaded ? 'block' : 'none' }}
          />
          {aoiEditing && imageLoaded && (
            <canvas
              ref={overlayRef}
              className="aoi-overlay"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default DwellHeatmap;

