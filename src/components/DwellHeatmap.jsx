import { useEffect, useRef, useState } from 'react';
import './DwellHeatmap.css';

function DwellHeatmap({ pathData, backgroundImage, minDwell = 5, loading }) {
  const canvasRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [opacity, setOpacity] = useState(0.6);
  const [displayMinDwell, setDisplayMinDwell] = useState(minDwell);
  const imageRef = useRef(null);

  // Reset display slider when query minDwell changes or new data is loaded
  useEffect(() => {
    setDisplayMinDwell(minDwell);
  }, [minDwell, pathData]);

  // Load background image
  useEffect(() => {
    if (!backgroundImage) {
      console.warn('DwellHeatmap: No background image provided');
      // Clear canvas when no background image
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      setImageLoaded(false);
      imageRef.current = null;
      return;
    }

    // Clear canvas immediately when background image changes (before new image loads)
    // This prevents showing old camera's image during loading
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setImageLoaded(false);
    imageRef.current = null;

    if (import.meta.env.DEV) {
      console.log('DwellHeatmap: Loading image:',
        backgroundImage.substring(0, 50) + (backgroundImage.length > 50 ? '...' : ''));
    }

    const img = new Image();
    img.onload = () => {
      if (import.meta.env.DEV) {
        console.log('DwellHeatmap: Image loaded successfully', img.width, 'x', img.height);
      }
      imageRef.current = img;
      setImageLoaded(true);
    };
    img.onerror = (e) => {
      console.error('DwellHeatmap: Failed to load background image', e);
      console.error('Image source:', backgroundImage.substring(0, 100));
      setImageLoaded(false);
    };
    img.src = backgroundImage;
  }, [backgroundImage]);

  // Draw dwell heatmap on canvas
  useEffect(() => {
    if (!imageLoaded) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = imageRef.current;

    // Set canvas size to match image
    canvas.width = img.width;
    canvas.height = img.height;

    // Clear canvas and draw background image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // If no path data, just show the background
    if (!pathData || pathData.length === 0) {
      if (import.meta.env.DEV) {
        console.log('DwellHeatmap: No path data, showing background only');
      }
      return;
    }

    if (import.meta.env.DEV) {
      console.log('DwellHeatmap: Drawing', pathData.length, 'paths with minDwell:', displayMinDwell);
    }

    // Collect all dwell points from all paths, applying filters
    const dwellPoints = [];
    pathData.forEach((pathEvent) => {
      if (!pathEvent.path || pathEvent.path.length === 0) return;

      // Ignore the last position in the path array
      const pathToProcess = pathEvent.path.slice(0, -1);

      pathToProcess.forEach((point) => {
        // Filter by display minimum dwell time (only show points with d >= displayMinDwell)
        if (point.d && point.d >= displayMinDwell) {
          dwellPoints.push({
            x: point.x,
            y: point.y,
            dwell: point.d,
            class: pathEvent.class,
          });
        }
      });
    });

    // Sort by dwell time (draw longest dwell last so they appear on top)
    dwellPoints.sort((a, b) => a.dwell - b.dwell);

    if (import.meta.env.DEV) {
      console.log('DwellHeatmap: Found', dwellPoints.length, 'dwell points >= ', displayMinDwell, 's');
    }

    // Draw each dwell point as a circle
    dwellPoints.forEach((point) => {
      const x = (point.x / 1000) * canvas.width;
      const y = (point.y / 1000) * canvas.height;

      // Calculate color based on dwell time (gradient from cyan to red)
      const color = getDwellColor(point.dwell);

      // Calculate radius based on dwell time (min 3, max 20)
      const radius = Math.min(20, Math.max(3, 3 + point.dwell * 2));

      // Draw circle with gradient
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      const rgbColor = hexToRgb(color);
      gradient.addColorStop(0, `rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, ${opacity})`);
      gradient.addColorStop(1, `rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, 0)`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fill();
    });
  }, [imageLoaded, pathData, opacity, displayMinDwell]);

  // Convert hex to RGB
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 0, b: 0 };
  };

  // Get color based on dwell time (heatmap gradient)
  // Dynamic scale: Blue at minDwell → Red at 10x minDwell
  const getDwellColor = (dwellSeconds) => {
    const maxDwell = minDwell * 10;

    // Clamp value between minDwell and maxDwell
    const clampedDwell = Math.max(minDwell, Math.min(dwellSeconds, maxDwell));

    // Calculate position in gradient (0 = minDwell/blue, 1 = maxDwell/red)
    const position = (clampedDwell - minDwell) / (maxDwell - minDwell);

    // Multi-stop gradient: Blue → Cyan → Green → Yellow → Orange → Red
    if (position < 0.2) {
      // Blue to Cyan
      const t = position / 0.2;
      return interpolateColor('#0000FF', '#00FFFF', t);
    } else if (position < 0.4) {
      // Cyan to Green
      const t = (position - 0.2) / 0.2;
      return interpolateColor('#00FFFF', '#00FF00', t);
    } else if (position < 0.6) {
      // Green to Yellow
      const t = (position - 0.4) / 0.2;
      return interpolateColor('#00FF00', '#FFFF00', t);
    } else if (position < 0.8) {
      // Yellow to Orange
      const t = (position - 0.6) / 0.2;
      return interpolateColor('#FFFF00', '#FFA500', t);
    } else {
      // Orange to Red
      const t = (position - 0.8) / 0.2;
      return interpolateColor('#FFA500', '#FF0000', t);
    }
  };

  // Interpolate between two hex colors
  const interpolateColor = (color1, color2, t) => {
    const c1 = hexToRgb(color1);
    const c2 = hexToRgb(color2);
    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const b = Math.round(c1.b + (c2.b - c1.b) * t);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  };

  return (
    <div className="dwell-heatmap">
      {/* Control Row */}
      <div className="heatmap-controls">
        {/* Dwell Filter Control */}
        <div className="control-group">
          <label htmlFor="min-dwell-slider">
            Dwell: {displayMinDwell}s
          </label>
          <input
            id="min-dwell-slider"
            type="range"
            min={minDwell}
            max="900"
            step="0.5"
            value={displayMinDwell}
            onChange={(e) => setDisplayMinDwell(parseFloat(e.target.value))}
          />
        </div>

        {/* Opacity Control */}
        <div className="control-group">
          <label htmlFor="opacity-slider">
            Intensity: {Math.round(opacity * 100)}%
          </label>
          <input
            id="opacity-slider"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={opacity}
            onChange={(e) => setOpacity(parseFloat(e.target.value))}
          />
        </div>
      </div>

      {/* Color Legend */}
      <div className="dwell-legend">
        <div className="legend-title">Dwell Time:</div>
        <div className="legend-gradient">
          <span>{minDwell}s</span>
          <div className="gradient-bar"></div>
          <span>{minDwell * 10}s+</span>
        </div>
      </div>

      {!imageLoaded && <div className="loading">Loading camera view...</div>}
      <canvas
        ref={canvasRef}
        style={{
          display: imageLoaded ? 'block' : 'none',
          maxWidth: '100%',
          height: 'auto',
          border: '1px solid #ddd',
        }}
      />
    </div>
  );
}

export default DwellHeatmap;
