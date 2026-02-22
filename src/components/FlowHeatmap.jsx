import { useEffect, useRef, useState } from 'react';
import './FlowHeatmap.css';

function FlowHeatmap({ pathData, backgroundImage, loading }) {
  const canvasRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [transparency, setTransparency] = useState(0.7);
  const imageRef = useRef(null);

  // Load background image
  useEffect(() => {
    if (!backgroundImage) {
      console.warn('FlowHeatmap: No background image provided');
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
      console.log('FlowHeatmap: Loading image:',
        backgroundImage.substring(0, 50) + (backgroundImage.length > 50 ? '...' : ''));
    }

    const img = new Image();
    img.onload = () => {
      if (import.meta.env.DEV) {
        console.log('FlowHeatmap: Image loaded successfully', img.width, 'x', img.height);
      }
      imageRef.current = img;
      setImageLoaded(true);
    };
    img.onerror = (e) => {
      console.error('FlowHeatmap: Failed to load background image', e);
      console.error('Image source:', backgroundImage.substring(0, 100));
      setImageLoaded(false);
    };
    img.src = backgroundImage;
  }, [backgroundImage]);

  // Draw paths on canvas
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
        console.log('FlowHeatmap: No path data, showing background only');
      }
      return;
    }

    // Draw paths
    pathData.forEach((pathEvent) => {
      if (!pathEvent.path || pathEvent.path.length === 0) return;

      // Set path color based on object class
      const color = getColorForClass(pathEvent.class);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = transparency;

      ctx.beginPath();
      const firstPoint = pathEvent.path[0];
      const startX = (firstPoint.x / 1000) * canvas.width;
      const startY = (firstPoint.y / 1000) * canvas.height;
      ctx.moveTo(startX, startY);

      // Draw path line
      pathEvent.path.forEach((point, index) => {
        if (index === 0) return;
        const x = (point.x / 1000) * canvas.width;
        const y = (point.y / 1000) * canvas.height;
        ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Draw entry and exit points
      ctx.globalAlpha = 1.0;

      // Entry point (green) - start of path
      ctx.fillStyle = '#00ff00';
      ctx.beginPath();
      ctx.arc(startX, startY, 4, 0, 2 * Math.PI);
      ctx.fill();

      // Exit point (red) - end of path
      const lastPoint = pathEvent.path[pathEvent.path.length - 1];
      const endX = (lastPoint.x / 1000) * canvas.width;
      const endY = (lastPoint.y / 1000) * canvas.height;
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(endX, endY, 4, 0, 2 * Math.PI);
      ctx.fill();
    });
  }, [imageLoaded, pathData, transparency]);

  const getColorForClass = (className) => {
    const colors = {
      Car: '#FFFF00',           // Yellow
      Human: '#00FF00',         // Lime
      Truck: '#0000FF',         // Blue
      Bus: '#FFA500',           // Orange
      Bike: '#FF1493',          // DeepPink
      LicensePlate: '#00BFFF',  // DeepSkyBlue
      Bag: '#800080',           // Purple
      Head: '#FFD700',          // Gold
      Animal: '#7FFF00',        // Chartreuse
      Vehicle: '#00FFFF',       // Cyan (Aqua)
      Other: '#FF0000',         // Red
    };
    return colors[className] || '#FF0000'; // Red for unknown
  };

  return (
    <div className="flow-heatmap">
      {/* Control Row */}
      <div className="heatmap-controls">
        {/* Transparency Control */}
        <div className="control-group">
          <label htmlFor="transparency-slider">
            Line Transparency: {Math.round(transparency * 100)}%
          </label>
          <input
            id="transparency-slider"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={transparency}
            onChange={(e) => setTransparency(parseFloat(e.target.value))}
          />
        </div>
      </div>

      <div className="canvas-container">
        {!imageLoaded && <div className="loading">Loading camera view...</div>}
        <canvas
          ref={canvasRef}
          className="heatmap-canvas"
          style={{ display: imageLoaded ? 'block' : 'none' }}
        />
      </div>
    </div>
  );
}

export default FlowHeatmap;
