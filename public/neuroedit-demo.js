/* ──────────────────────────────────────────────────────────────────
   NeuroEdit Interactive Demo
   Real functional photo editor.
   ────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const canvas = document.getElementById('neuroEditCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const status = document.getElementById('neDemoStatus');

  const uploadInput = document.getElementById('neUploadImage');
  const brightnessSlider = document.getElementById('neBrightness');
  const contrastSlider = document.getElementById('neContrast');
  const saturationSlider = document.getElementById('neSaturation');
  const blurSlider = document.getElementById('neBlur');
  
  const filterBtns = document.querySelectorAll('.ne-filter-btn');
  const resetBtn = document.getElementById('neReset');
  const downloadBtn = document.getElementById('neDownload');

  let originalImage = null; // HTMLImageElement
  let currentFilter = 'none';

  function drawInitialState() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0, 163, 163, 0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 30) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '16px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No image loaded. Upload a photo to begin.', w / 2, h / 2);
  }

  function updateStatus(text, cls) {
    if (!status) return;
    status.textContent = text;
    status.className = 'ne-demo-status' + (cls ? ' ' + cls : '');
  }

  function renderImage() {
    if (!originalImage) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get slider values
    const brightness = brightnessSlider.value; // -100 to 100
    const contrast = contrastSlider.value;     // -100 to 100
    const saturation = saturationSlider.value; // -100 to 100
    const blur = blurSlider.value;             // 0 to 20

    // Construct CSS filter string
    let filterString = `brightness(${100 + parseInt(brightness)}%) contrast(${100 + parseInt(contrast)}%) saturate(${100 + parseInt(saturation)}%) blur(${blur}px)`;

    if (currentFilter === 'vintage') {
      filterString += ' sepia(50%) hue-rotate(-30deg) saturate(120%) contrast(110%)';
    } else if (currentFilter === 'bw') {
      filterString += ' grayscale(100%) contrast(120%)';
    } else if (currentFilter === 'cinematic') {
      // Approximation of teal and orange
      filterString += ' sepia(20%) saturate(150%) contrast(120%) brightness(95%)';
    }

    ctx.filter = filterString;

    // Calculate aspect ratio fit
    const scale = Math.min(canvas.width / originalImage.width, canvas.height / originalImage.height);
    const w = originalImage.width * scale;
    const h = originalImage.height * scale;
    const x = (canvas.width / 2) - (w / 2);
    const y = (canvas.height / 2) - (h / 2);
    
    // Fill background so transparent images don't look weird if they have transparency
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.drawImage(originalImage, x, y, w, h);
    ctx.filter = 'none'; // reset
  }

  // Handle Upload
  if (uploadInput) {
    uploadInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          originalImage = img;
          resetControls();
          renderImage();
          updateStatus('Image loaded. Ready for editing.', 'active');
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
      
      // Clear input so the same file can be selected again
      e.target.value = '';
    });
  }

  function resetControls() {
    brightnessSlider.value = 0;
    contrastSlider.value = 0;
    saturationSlider.value = 0;
    blurSlider.value = 0;
    currentFilter = 'none';
    
    filterBtns.forEach(btn => {
      if (btn.dataset.filter === 'none') btn.classList.add('active');
      else btn.classList.remove('active');
    });
  }

  // Handle Sliders
  const sliders = [brightnessSlider, contrastSlider, saturationSlider, blurSlider];
  sliders.forEach(slider => {
    if (slider) {
      slider.addEventListener('input', () => {
        if (!originalImage) return;
        renderImage();
        updateStatus('Applying adjustments...', '');
      });
      slider.addEventListener('change', () => {
        if (!originalImage) return;
        updateStatus('Adjustments applied.', 'done');
      });
    }
  });

  // Handle Filters
  filterBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (!originalImage) return;
      currentFilter = e.currentTarget.dataset.filter;
      
      filterBtns.forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      
      renderImage();
      updateStatus(`Applied ${e.currentTarget.textContent.trim()} filter`, 'done');
    });
  });

  // Handle Reset
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (!originalImage) return;
      resetControls();
      renderImage();
      updateStatus('Edits reset to original', 'active');
    });
  }

  // Handle AI Remove Background
  const removeBgBtn = document.getElementById('neRemoveBgBtn');
  if (removeBgBtn) {
    removeBgBtn.addEventListener('click', async () => {
      if (!originalImage) {
        updateStatus('Please upload an image first', 'error');
        return;
      }
      
      updateStatus('AI Processing... this may take 10-20 seconds on free tier', 'active');
      removeBgBtn.disabled = true;
      removeBgBtn.textContent = '⏳ Processing...';
      document.body.style.cursor = 'wait';
      
      try {
        // Convert originalImage to blob
        const offCanvas = document.createElement('canvas');
        offCanvas.width = originalImage.width;
        offCanvas.height = originalImage.height;
        offCanvas.getContext('2d').drawImage(originalImage, 0, 0);
        
        const blob = await new Promise(resolve => offCanvas.toBlob(resolve, 'image/png'));
        
        const formData = new FormData();
        formData.append('image', blob, 'upload.png');
        
        const apiUrl = 'https://promitdas-neuroedit-backend.hf.space/api/remove-bg';

        const response = await fetch(apiUrl, {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) throw new Error('API failed to process image');
        
        const resultBlob = await response.blob();
        const objectUrl = URL.createObjectURL(resultBlob);
        
        const newImg = new Image();
        newImg.onload = () => {
          originalImage = newImg;
          renderImage();
          updateStatus('Background successfully removed!', 'done');
          URL.revokeObjectURL(objectUrl);
        };
        newImg.src = objectUrl;
      } catch (err) {
        console.error(err);
        updateStatus(err.message.includes('update the apiUrl') ? err.message : 'Failed to connect to AI backend. Make sure your Hugging Face Space is running!', 'error');
      } finally {
        removeBgBtn.disabled = false;
        removeBgBtn.textContent = '🧠 Remove Background';
        document.body.style.cursor = 'default';
      }
    });
  }

  // Handle Download
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      if (!originalImage) {
        updateStatus('Please upload an image first', 'error');
        return;
      }
      
      const link = document.createElement('a');
      link.download = 'neuroedit_edited.png';
      // If the image is large, we should probably render it to a temporary canvas 
      // of original size for high-quality download, but for a basic demo
      // downloading the canvas view is fine and matches WYSIWYG.
      link.href = canvas.toDataURL('image/png');
      link.click();
      updateStatus('Image downloaded successfully!', 'done');
    });
  }

  // Initialize
  drawInitialState();
})();
