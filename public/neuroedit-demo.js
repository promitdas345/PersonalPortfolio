/* ──────────────────────────────────────────────────────────────────
   NeuroEdit Interactive Demo
   Client-side simulation of the AI background removal pipeline.
   ────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const canvas = document.getElementById('neuroEditCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const status = document.getElementById('neDemoStatus');

  let originalImageData = null;
  let currentState = 'empty'; // empty | loaded | processing | processed

  // ── Draw initial state ────────────────────────────────────────
  function drawInitialState() {
    const w = canvas.width;
    const h = canvas.height;

    // Dark background
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, w, h);

    // Grid pattern (subtle)
    ctx.strokeStyle = 'rgba(0, 163, 163, 0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 30) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Neural network visualization
    drawNeuralNet(w, h);

    // Title
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px Poppins, Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NeuroEdit Demo', w / 2, h / 2 - 40);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '16px Inter, sans-serif';
    ctx.fillText('Click "Load Sample Image" to start', w / 2, h / 2);

    // Animated accent line
    const grad = ctx.createLinearGradient(w * 0.25, 0, w * 0.75, 0);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(0.5, '#00A3A3');
    grad.addColorStop(1, 'transparent');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.25, h / 2 + 20);
    ctx.lineTo(w * 0.75, h / 2 + 20);
    ctx.stroke();
  }

  function drawNeuralNet(w, h) {
    const layers = [3, 5, 7, 5, 3];
    const layerSpacing = w / (layers.length + 1);
    const nodeRadius = 5;

    ctx.globalAlpha = 0.15;

    const nodePositions = [];
    for (let l = 0; l < layers.length; l++) {
      const x = layerSpacing * (l + 1);
      const nodeCount = layers[l];
      const layerHeight = h * 0.6;
      const startY = (h - layerHeight) / 2;
      const spacing = layerHeight / (nodeCount + 1);
      const positions = [];

      for (let n = 0; n < nodeCount; n++) {
        const y = startY + spacing * (n + 1);
        positions.push({ x, y });
      }
      nodePositions.push(positions);
    }

    // Draw connections
    ctx.strokeStyle = '#00A3A3';
    ctx.lineWidth = 0.5;
    for (let l = 0; l < nodePositions.length - 1; l++) {
      for (const from of nodePositions[l]) {
        for (const to of nodePositions[l + 1]) {
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
        }
      }
    }

    // Draw nodes
    for (const layer of nodePositions) {
      for (const node of layer) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#00A3A3';
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;
  }

  // ── Generate a sample image (gradient scene) ──────────────────
  function generateSampleImage() {
    const w = canvas.width;
    const h = canvas.height;

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.6);
    sky.addColorStop(0, '#1a1a2e');
    sky.addColorStop(0.5, '#16213e');
    sky.addColorStop(1, '#0f3460');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h * 0.6);

    // Stars
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 80; i++) {
      const sx = Math.random() * w;
      const sy = Math.random() * h * 0.5;
      const sr = Math.random() * 1.5 + 0.5;
      ctx.globalAlpha = Math.random() * 0.7 + 0.3;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Ground
    const ground = ctx.createLinearGradient(0, h * 0.55, 0, h);
    ground.addColorStop(0, '#0f3460');
    ground.addColorStop(0.3, '#1a5e2a');
    ground.addColorStop(1, '#0d3b18');
    ctx.fillStyle = ground;
    ctx.fillRect(0, h * 0.55, w, h * 0.45);

    // Hills
    ctx.fillStyle = '#1a5e2a';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.65);
    for (let x = 0; x <= w; x += 5) {
      const y = h * 0.6 + Math.sin(x * 0.008) * 35 + Math.sin(x * 0.015) * 20;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // Subject: A person silhouette (centered)
    drawPerson(w / 2, h * 0.35, h * 0.5);

    // Moon
    ctx.fillStyle = '#FFB100';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(w * 0.78, h * 0.15, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Original Image', 20, 30);
  }

  function drawPerson(cx, topY, personH) {
    // Head
    const headR = personH * 0.07;
    const headCY = topY + headR;

    ctx.fillStyle = '#c98a5a';
    ctx.beginPath();
    ctx.arc(cx, headCY, headR, 0, Math.PI * 2);
    ctx.fill();

    // Body
    const bodyTop = headCY + headR;
    const bodyBot = topY + personH * 0.55;
    const bodyW = personH * 0.12;

    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.moveTo(cx - bodyW, bodyBot);
    ctx.lineTo(cx - bodyW * 0.6, bodyTop);
    ctx.quadraticCurveTo(cx, bodyTop - 5, cx + bodyW * 0.6, bodyTop);
    ctx.lineTo(cx + bodyW, bodyBot);
    ctx.closePath();
    ctx.fill();

    // Arms
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.5, bodyTop + 15);
    ctx.lineTo(cx - bodyW * 1.8, bodyTop + personH * 0.2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + bodyW * 0.5, bodyTop + 15);
    ctx.lineTo(cx + bodyW * 1.8, bodyTop + personH * 0.15);
    ctx.stroke();

    // Legs
    const legBot = topY + personH;
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.4, bodyBot);
    ctx.lineTo(cx - bodyW * 0.8, legBot);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + bodyW * 0.4, bodyBot);
    ctx.lineTo(cx + bodyW * 0.8, legBot);
    ctx.stroke();
  }

  // ── Simulate background removal ───────────────────────────────
  function simulateBackgroundRemoval() {
    if (currentState !== 'loaded') return;
    currentState = 'processing';
    updateStatus('🧠 Running U²-Net salient object detection...', 'active');

    const w = canvas.width;
    const h = canvas.height;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    // Simulate progressive segmentation with scanning effect
    let scanLine = 0;
    const scanSpeed = 4;

    function scanStep() {
      // Draw scan line
      ctx.putImageData(imageData, 0, 0);

      // Scanning effect
      ctx.fillStyle = 'rgba(0, 163, 163, 0.15)';
      ctx.fillRect(0, scanLine, w, 3);

      // Process lines
      for (let y = scanLine; y < Math.min(scanLine + scanSpeed, h); y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          // Simple segmentation: detect non-background pixels
          // (person = warm tones and blue clothing, background = dark sky/green)
          const isSkin = r > 150 && g > 100 && b < 150;
          const isClothing = b > 100 && r < 100 && g < 100;
          const isDarkClothing = r < 50 && g < 70 && b > 60 && b < 120;
          const isMoon = r > 200 && g > 150 && b < 50;

          const isSubject = isSkin || isClothing || isDarkClothing;

          if (!isSubject && !isMoon) {
            // Make background checkerboard pattern (transparency indication)
            const checkSize = 12;
            const isLight = ((Math.floor(x / checkSize) + Math.floor(y / checkSize)) % 2) === 0;
            data[idx] = isLight ? 240 : 200;
            data[idx + 1] = isLight ? 240 : 200;
            data[idx + 2] = isLight ? 240 : 200;
          }
        }
      }

      scanLine += scanSpeed;

      if (scanLine < h) {
        requestAnimationFrame(scanStep);
      } else {
        ctx.putImageData(imageData, 0, 0);

        // Draw label
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, 250, 40);
        ctx.fillStyle = '#5ee7e7';
        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('✓ Background Removed (U²-Net)', 15, 26);

        currentState = 'processed';
        updateStatus('✓ Salient object detection complete — background removed', 'done');
      }
    }

    // Simulate model loading delay
    setTimeout(scanStep, 800);
  }

  // ── Simulate Portrait Mode (Bokeh) ────────────────────────────────
  function simulatePortraitMode() {
    if (currentState === 'empty') return;
    updateStatus('📸 Applying AI depth estimation and bokeh blur...', 'active');
    
    setTimeout(() => {
      const w = canvas.width;
      const h = canvas.height;
      
      // We need to restore original background and blur it
      if (originalImageData) {
        ctx.putImageData(originalImageData, 0, 0);
      }
      
      // Use Canvas filter for fast high-quality Gaussian blur
      // Note: to blur the existing canvas content, we draw the canvas onto itself with a filter
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = w;
      tempCanvas.height = h;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.putImageData(ctx.getImageData(0, 0, w, h), 0, 0);
      
      ctx.filter = 'blur(12px)';
      ctx.drawImage(tempCanvas, 0, 0);
      ctx.filter = 'none'; // reset filter

      // Redraw Subject sharp on top
      drawPerson(w / 2, h * 0.35, h * 0.5);

      // Draw label
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, 250, 40);
      ctx.fillStyle = '#5ee7e7';
      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('📸 Portrait Mode (Depth Blur)', 15, 26);

      currentState = 'portrait';
      updateStatus('📸 Portrait Mode complete — background blurred', 'done');
    }, 500);
  }

  // ── Simulate Generative Fill ───────────────────────────────────────
  function simulateGenerativeFill() {
    if (currentState === 'empty') return;
    updateStatus('🌌 Generating new background with AI...', 'active');
    
    setTimeout(() => {
      const w = canvas.width;
      const h = canvas.height;
      
      // Cyberpunk/Synthwave background
      const sky = ctx.createLinearGradient(0, 0, 0, h * 0.6);
      sky.addColorStop(0, '#2b0f4c');
      sky.addColorStop(0.5, '#51125e');
      sky.addColorStop(1, '#e2316e');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h * 0.6);
      
      // Sun
      ctx.fillStyle = '#ffb703';
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.6, 60, Math.PI, 0);
      ctx.fill();

      // Ground (Neon grid)
      ctx.fillStyle = '#0f0c29';
      ctx.fillRect(0, h * 0.6, w, h * 0.4);
      
      ctx.strokeStyle = '#e2316e';
      ctx.lineWidth = 1;
      // Horizontal lines
      for (let y = h * 0.6; y < h; y += Math.pow((y - h * 0.6) / 20, 2) + 2) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      // Vertical lines
      for (let x = -w; x < w * 2; x += 40) {
        ctx.beginPath();
        ctx.moveTo(w / 2, h * 0.6);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      // Redraw Subject
      drawPerson(w / 2, h * 0.35, h * 0.5);

      // Draw label
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, 250, 40);
      ctx.fillStyle = '#e2316e';
      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('🌌 Generative Fill (Outpainting)', 15, 26);

      currentState = 'filled';
      updateStatus('🌌 Generative Fill complete — background replaced', 'done');
    }, 600);
  }

  // ── Simulate Pro Color Filter ───────────────────────────────────────
  function simulateProFilter() {
    if (currentState === 'empty') return;
    updateStatus('🎬 Applying Cinematic Teal & Orange LUT...', 'active');
    
    setTimeout(() => {
      const w = canvas.width;
      const h = canvas.height;
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;

      // Simple Teal & Orange cinematic grading
      for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        // Contrast boost
        r = ((r / 255 - 0.5) * 1.2 + 0.5) * 255;
        g = ((g / 255 - 0.5) * 1.2 + 0.5) * 255;
        b = ((b / 255 - 0.5) * 1.2 + 0.5) * 255;

        // Teal/Orange shift
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        if (luma > 128) {
            r += 20;
            b -= 10;
        } else {
            r -= 10;
            g += 10;
            b += 20;
        }

        data[i] = Math.min(255, Math.max(0, r));
        data[i + 1] = Math.min(255, Math.max(0, g));
        data[i + 2] = Math.min(255, Math.max(0, b));
      }

      ctx.putImageData(imageData, 0, 0);

      // Draw label
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, h - 40, 220, 40);
      ctx.fillStyle = '#FFB100';
      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('🎬 Pro Color Grade Applied', 15, h - 15);

      updateStatus('🎬 Cinematic Pro Filter applied', 'done');
    }, 400);
  }

  // ── Reset ─────────────────────────────────────────────────────
  function resetCanvas() {
    if (originalImageData) {
      ctx.putImageData(originalImageData, 0, 0);
      currentState = 'loaded';
      updateStatus('Image reset to original — try the tools above', 'active');
    } else {
      drawInitialState();
      currentState = 'empty';
      updateStatus('Click "Load Sample Image" to begin the demo', '');
    }
  }

  function updateStatus(text, cls) {
    if (!status) return;
    status.textContent = text;
    status.className = 'ne-demo-status' + (cls ? ' ' + cls : '');
  }

  // ── Button handlers ───────────────────────────────────────────
  const loadBtn = document.getElementById('neLoadSample');
  const removeBgBtn = document.getElementById('neRemoveBg');
  const genFillBtn = document.getElementById('neGenFill');
  const portraitBtn = document.getElementById('nePortrait');
  const proFilterBtn = document.getElementById('neProFilter');
  const resetBtn = document.getElementById('neReset');

  if (loadBtn) {
    loadBtn.addEventListener('click', () => {
      generateSampleImage();
      originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      currentState = 'loaded';
      updateStatus('Sample image loaded — try the Pro Features below', 'active');
    });
  }

  if (removeBgBtn) {
    removeBgBtn.addEventListener('click', () => {
      if (currentState === 'empty') {
        updateStatus('Load a sample image first!', '');
        return;
      }
      if (currentState === 'processing') return;
      if (currentState === 'processed' || currentState === 'filled' || currentState === 'portrait') {
        resetCanvas();
        setTimeout(simulateBackgroundRemoval, 200);
      } else {
        simulateBackgroundRemoval();
      }
    });
  }

  if (genFillBtn) {
    genFillBtn.addEventListener('click', () => {
      if (currentState === 'empty') {
        updateStatus('Load a sample image first!', '');
        return;
      }
      simulateGenerativeFill();
    });
  }

  if (portraitBtn) {
    portraitBtn.addEventListener('click', () => {
      if (currentState === 'empty') {
        updateStatus('Load a sample image first!', '');
        return;
      }
      simulatePortraitMode();
    });
  }

  if (proFilterBtn) {
    proFilterBtn.addEventListener('click', () => {
      if (currentState === 'empty') {
        updateStatus('Load a sample image first!', '');
        return;
      }
      simulateProFilter();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', resetCanvas);
  }

  // Initialize
  drawInitialState();
})();
