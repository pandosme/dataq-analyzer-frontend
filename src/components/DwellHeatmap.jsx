import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import useContainerFit from '../hooks/useContainerFit';
import './DwellHeatmap.css';

// Grid resolution for density accumulation
const GRID_W = 200;
const GRID_H = 200;

// Gaussian spread for path-points mode
const SPREAD   = 8;
const SIGMA2   = (SPREAD / 2.5) ** 2;

// Absolute density floor & edge ramp
const DENSITY_CUTOFF = 0.25;
const EDGE_SOFTNESS  = 0.6;

// Single colour (warm orange)
const ZONE_R = 255, ZONE_G = 120, ZONE_B = 0;

// AOI handle constants
const HANDLE_SIZE = 8;
const HANDLE_HIT  = 14;
const DEFAULT_AOI = { x1: 0, y1: 0, x2: 1, y2: 1 };

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function normAoi(a) {
  return {
    x1: Math.min(a.x1, a.x2), y1: Math.min(a.y1, a.y2),
    x2: Math.max(a.x1, a.x2), y2: Math.max(a.y1, a.y2),
  };
}

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

/** Pretty-print seconds */
function fmtTime(sec) {
  if (sec == null) return '—';
  const s = Math.round(sec);
  if (s < 60)  return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs > 0 ? `${m}m ${rs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function autoStep(range) {
  if (range <= 0)   return 0.1;
  if (range <= 10)  return 0.1;
  if (range <= 60)  return 0.5;
  if (range <= 300) return 1;
  if (range <= 1800) return 2;
  return 5;
}

// ---------------------------------------------------------------------------

function DwellHeatmap({ pathData, backgroundImage, loading, filters, onQuery }) {
  const canvasRef     = useRef(null);
  const overlayRef    = useRef(null);
  const containerRef  = useRef(null);
  const imageRef      = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [opacity, setOpacity]         = useState(0.65);

  // AOI state
  const [aoi, setAoi]             = useState(DEFAULT_AOI);
  const [editAoi, setEditAoi]     = useState(null);
  const [aoiEditing, setAoiEditing] = useState(false);
  const dragRef = useRef(null);

  const isFullImage = useCallback((a) => {
    return a.x1 <= 0.001 && a.y1 <= 0.001 && a.x2 >= 0.999 && a.y2 >= 0.999;
  }, []);

  /* ---------- query-level minIdle ---------- */
  const queryMinIdle = useMemo(() => {
    const v = filters?.minIdle;
    return (v !== undefined && v !== null && v !== '' && parseFloat(v) > 0) ? parseFloat(v) : 0;
  }, [filters]);

  /* ---------- image aspect ratio ---------- */
  const imageAspect = useMemo(() => {
    if (!imageRef.current) return null;
    return imageRef.current.width / imageRef.current.height;
  }, [imageLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const fitted = useContainerFit(containerRef, imageAspect);

  /* ---------- idle-time range from dataset ---------- */
  const idleRange = useMemo(() => {
    if (!pathData || pathData.length === 0) return { min: queryMinIdle, max: 60, total: 0 };

    let lo = Infinity, hi = 0, n = 0;
    pathData.forEach((ev) => {
      if (!ev.path) return;
      ev.path.slice(0, -1).forEach((pt) => {
        if (pt.d > 0) { lo = Math.min(lo, pt.d); hi = Math.max(hi, pt.d); n++; }
      });
    });

    if (lo === Infinity) lo = queryMinIdle;
    if (hi === 0) hi = 60;
    // Slider min = the query-level minIdle so user sees what they asked for
    const sliderMin = Math.max(queryMinIdle, Math.floor(lo));
    return { min: sliderMin, max: Math.ceil(hi), total: n };
  }, [pathData, queryMinIdle]);

  /* ---------- idle-time slider ---------- */
  const [idleThreshold, setIdleThreshold] = useState(0);
  useEffect(() => { setIdleThreshold(idleRange.min); }, [idleRange.min]);

  /* ---------- qualifying point count ---------- */
  const qualifyingCount = useMemo(() => {
    if (!pathData || pathData.length === 0) return 0;
    let c = 0;
    pathData.forEach((ev) => {
      if (!ev.path) return;
      ev.path.slice(0, -1).forEach((pt) => { if (pt.d >= idleThreshold) c++; });
    });
    return c;
  }, [pathData, idleThreshold]);

  /* ---------- load background image ---------- */
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
    img.onload  = () => { imageRef.current = img; setImageLoaded(true); };
    img.onerror = () => { setImageLoaded(false); };
    img.src = backgroundImage;
  }, [backgroundImage]);

  /* ---------- render heatmap ---------- */
  useEffect(() => {
    if (!imageLoaded || !imageRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    const img    = imageRef.current;

    canvas.width  = fitted.width  || img.width;
    canvas.height = fitted.height || img.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    if (!pathData || pathData.length === 0) return;

    // Accumulate count-based density (path-points only)
    const heat = new Float32Array(GRID_W * GRID_H);

    const addPoint = (normX, normY) => {
      const gx = Math.round(normX * (GRID_W - 1));
      const gy = Math.round(normY * (GRID_H - 1));
      for (let dy = -SPREAD; dy <= SPREAD; dy++) {
        for (let dx = -SPREAD; dx <= SPREAD; dx++) {
          const nx = gx + dx, ny = gy + dy;
          if (nx >= 0 && nx < GRID_W && ny >= 0 && ny < GRID_H) {
            heat[ny * GRID_W + nx] += Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA2));
          }
        }
      }
    };

    pathData.forEach((ev) => {
      if (!ev.path || ev.path.length === 0) return;
      ev.path.slice(0, -1).forEach((pt) => {
        if (!pt.d || pt.d < idleThreshold) return;
        addPoint(pt.x / 1000, pt.y / 1000);
      });
    });

    let maxHeat = 0;
    for (let i = 0; i < heat.length; i++) if (heat[i] > maxHeat) maxHeat = heat[i];
    if (maxHeat === 0) return;

    const imageData = new ImageData(GRID_W, GRID_H);
    for (let i = 0; i < GRID_W * GRID_H; i++) {
      const d = heat[i];
      if (d < DENSITY_CUTOFF) continue;
      const edge = clamp((d - DENSITY_CUTOFF) / EDGE_SOFTNESS, 0, 1);
      const a    = Math.round(edge * opacity * 255);
      imageData.data[i * 4 + 0] = ZONE_R;
      imageData.data[i * 4 + 1] = ZONE_G;
      imageData.data[i * 4 + 2] = ZONE_B;
      imageData.data[i * 4 + 3] = a;
    }

    const offscreen    = document.createElement('canvas');
    offscreen.width    = GRID_W;
    offscreen.height   = GRID_H;
    offscreen.getContext('2d').putImageData(imageData, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);

    // Draw AOI outline when not full-image (and not in edit mode)
    if (!isFullImage(aoi) && !aoiEditing) {
      const n  = normAoi(aoi);
      const ax = n.x1 * canvas.width,  ay = n.y1 * canvas.height;
      const aw = (n.x2 - n.x1) * canvas.width, ah = (n.y2 - n.y1) * canvas.height;
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth   = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(ax, ay, aw, ah);
      ctx.setLineDash([]);
      ctx.font      = '13px sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      const tw = ctx.measureText('AOI').width;
      ctx.fillRect(ax, ay - 18, tw + 8, 18);
      ctx.fillStyle = '#00ff00';
      ctx.fillText('AOI', ax + 4, ay - 5);
    }

  }, [imageLoaded, pathData, opacity, idleThreshold, aoi, aoiEditing, isFullImage, fitted]);

  /* ========== AOI overlay drawing ========== */
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

    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, overlay.width, overlay.height);
    ctx.clearRect(ax, ay, aw, ah);

    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth   = 2;
    ctx.strokeRect(ax, ay, aw, ah);

    ctx.fillStyle   = '#00ff00';
    ctx.strokeStyle = '#000';
    ctx.lineWidth   = 1;
    handlePositions(a).forEach((h) => {
      const hx = h.x * overlay.width  - HANDLE_SIZE / 2;
      const hy = h.y * overlay.height - HANDLE_SIZE / 2;
      ctx.fillRect(hx, hy, HANDLE_SIZE, HANDLE_SIZE);
      ctx.strokeRect(hx, hy, HANDLE_SIZE, HANDLE_SIZE);
    });

    ctx.font      = 'bold 13px sans-serif';
    ctx.fillStyle = '#00ff00';
    ctx.fillText('AOI', ax + 4, ay - 5 > 14 ? ay - 5 : ay + 14);
  }, []);

  useEffect(() => {
    if (!aoiEditing || !editAoi) return;
    drawOverlay(editAoi);
  }, [aoiEditing, editAoi, drawOverlay]);

  const toNorm = useCallback((e) => {
    const el = overlayRef.current || canvasRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: clamp((e.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((e.clientY - rect.top) / rect.height, 0, 1),
    };
  }, []);

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

  const hitTestBody = useCallback((a, mx, my) => {
    const n = normAoi(a);
    return mx >= n.x1 && mx <= n.x2 && my >= n.y1 && my <= n.y2;
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (!aoiEditing || !editAoi) return;
    e.preventDefault();
    const p = toNorm(e);
    const h = hitTestHandle(editAoi, p.x, p.y);
    if (h) { dragRef.current = { type: 'handle', handle: h.key, startAoi: { ...editAoi }, startMouse: p }; return; }
    if (hitTestBody(editAoi, p.x, p.y)) {
      dragRef.current = { type: 'move', startAoi: { ...editAoi }, startMouse: p };
    }
  }, [aoiEditing, editAoi, toNorm, hitTestHandle, hitTestBody]);

  const handleMouseMove = useCallback((e) => {
    if (!aoiEditing || !editAoi) return;
    const p = toNorm(e);
    const overlay = overlayRef.current;
    if (overlay && !dragRef.current) {
      const h = hitTestHandle(editAoi, p.x, p.y);
      if (h) overlay.style.cursor = h.cursor;
      else if (hitTestBody(editAoi, p.x, p.y)) overlay.style.cursor = 'move';
      else overlay.style.cursor = 'default';
    }
    if (!dragRef.current) return;
    const d  = dragRef.current;
    const dx = p.x - d.startMouse.x;
    const dy = p.y - d.startMouse.y;
    const sa = d.startAoi;
    if (d.type === 'move') {
      const n = normAoi(sa);
      const w = n.x2 - n.x1, h = n.y2 - n.y1;
      let nx1 = clamp(n.x1 + dx, 0, 1 - w);
      let ny1 = clamp(n.y1 + dy, 0, 1 - h);
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

  const handleMouseUp = useCallback(() => { dragRef.current = null; }, []);

  /* ---------- AOI button handlers ---------- */
  const enterEdit = useCallback(() => {
    setEditAoi({ ...aoi });
    setAoiEditing(true);
  }, [aoi]);

  // Save AOI → commit & re-query with the AOI bounding box
  const saveAoi = useCallback(() => {
    if (!editAoi) return;
    const saved = normAoi(editAoi);
    setAoi(saved);
    setAoiEditing(false);
    setEditAoi(null);
    // Re-query with AOI so the database returns only paths inside the box
    if (onQuery) {
      onQuery({ aoi: saved });
    }
  }, [editAoi, onQuery]);

  const resetAoi = useCallback(() => {
    setAoi(DEFAULT_AOI);
    setEditAoi(null);
    setAoiEditing(false);
    // Re-query without AOI
    if (onQuery) {
      onQuery({ aoi: undefined });
    }
  }, [onQuery]);

  /* ---------- UI ---------- */
  const step = autoStep(idleRange.max - idleRange.min);

  return (
    <div className="dwell-heatmap">

      {/* ---- Controls ---- */}
      <div className="heatmap-controls">

        {/* Dynamic idle-time slider */}
        <div className="control-group idle-slider-group">
          <label>
            Min idle: <strong>{fmtTime(idleThreshold)}</strong>
            {queryMinIdle > 0 && (
              <span className="query-floor"> (query floor: {fmtTime(queryMinIdle)})</span>
            )}
          </label>
          <input
            type="range"
            min={idleRange.min}
            max={idleRange.max}
            step={step}
            value={idleThreshold}
            onChange={(e) => setIdleThreshold(parseFloat(e.target.value))}
            title="Filter out points that idled less than this. Slide right to focus on longer stops."
          />
          <div className="range-labels">
            <span>{fmtTime(idleRange.min)}</span>
            <span>{fmtTime(idleRange.max)}</span>
          </div>
        </div>

        {/* Stats badge */}
        <div className="control-group stats-group">
          <label>Matching</label>
          <div className="stats-badge">
            <span className="stats-count">{qualifyingCount}</span>
            <span className="stats-unit">/ {idleRange.total} points</span>
          </div>
        </div>

        {/* Overlay opacity */}
        <div className="control-group">
          <label>Overlay: {Math.round(opacity * 100)}%</label>
          <input
            type="range" min="0.1" max="1" step="0.05"
            value={opacity}
            onChange={(e) => setOpacity(parseFloat(e.target.value))}
            title="Opacity of the dwell-zone overlay."
          />
        </div>

        {/* AOI controls */}
        <div className="control-group aoi-controls">
          <label title="Area of Interest — limits the database query to paths whose peak-idle position falls within this rectangle, maximizing your page limit with relevant data.">Area of Interest</label>
          <div className="aoi-buttons">
            {!aoiEditing ? (
              <button className="btn-small btn-secondary" onClick={enterEdit} title="Draw a rectangle to limit the query to a specific area.">
                AOI
              </button>
            ) : (
              <button className="btn-small btn-aoi-save" onClick={saveAoi} title="Apply the AOI and re-query. Only paths inside this area will be fetched.">
                Save &amp; Query
              </button>
            )}
            {!isFullImage(aoi) && !aoiEditing && (
              <button className="btn-small btn-secondary" onClick={resetAoi} title="Remove the AOI filter and re-query all data.">
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---- Legend ---- */}
      <div className="dwell-legend">
        <div className="legend-swatch" />
        <span className="legend-label">
          Idle zone — larger area = more points idling ≥ {fmtTime(idleThreshold)}
        </span>
      </div>

      {/* ---- Canvas ---- */}
      <div className="canvas-container" ref={containerRef}>
        {loading && <div className="loading">Loading…</div>}
        {!imageLoaded && !loading && <div className="loading">Loading camera view…</div>}
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

