function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else el.setAttribute(key, value);
  });
  [].concat(children).forEach(child => {
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      el.appendChild(child);
    }
  });
  return el;
}

function renderDataVizDemo(mount) {
  const dataset = [
    { week: 1, region: 'North America', engagement: 65, retention: 52, sessions: 12 },
    { week: 2, region: 'North America', engagement: 72, retention: 54, sessions: 14 },
    { week: 3, region: 'North America', engagement: 68, retention: 53, sessions: 15 },
    { week: 4, region: 'North America', engagement: 80, retention: 58, sessions: 17 },
    { week: 5, region: 'Europe', engagement: 75, retention: 60, sessions: 16 },
    { week: 6, region: 'Europe', engagement: 82, retention: 63, sessions: 19 },
    { week: 7, region: 'Europe', engagement: 85, retention: 65, sessions: 20 },
    { week: 8, region: 'APAC', engagement: 70, retention: 55, sessions: 18 },
    { week: 9, region: 'APAC', engagement: 78, retention: 58, sessions: 19 },
    { week: 10, region: 'APAC', engagement: 90, retention: 67, sessions: 24 },
  ];

  const controls = createElement('div', { class: 'demo-controls' });
  const metricSelect = createElement('select');
  ['engagement', 'retention', 'sessions'].forEach(metric => {
    metricSelect.appendChild(createElement('option', { value: metric, text: metric }));
  });
  const regionSelect = createElement('select');
  const regions = ['All', ...new Set(dataset.map(d => d.region))];
  regions.forEach(region => {
    regionSelect.appendChild(createElement('option', { value: region, text: region }));
  });
  controls.append(
    createElement('label', { text: 'Metric', style: 'font-weight:600' }),
    metricSelect,
    createElement('label', { text: 'Region', style: 'font-weight:600;margin-left:1rem' }),
    regionSelect
  );

  mount.innerHTML = '';
  mount.appendChild(controls);

  const canvas = createElement('canvas', { width: 620, height: 280 });
  canvas.style.width = '100%';
  canvas.style.maxWidth = '620px';
  canvas.style.display = 'block';
  mount.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const summary = createElement('div', { class: 'stat-output', style: 'margin-top:1.25rem;background:#eef4ff;' });
  mount.appendChild(summary);

  function filteredData() {
    const currentMetric = metricSelect.value;
    const currentRegion = regionSelect.value;
    return dataset
      .filter(d => currentRegion === 'All' || d.region === currentRegion)
      .map(d => ({ label: `W${d.week}`, value: d[currentMetric] }));
  }

  function drawChart() {
    const data = filteredData();
    if (!data.length) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      summary.textContent = 'No samples for this region yet.';
      return;
    }
    const padding = 40;
    const width = canvas.width - padding * 2;
    const height = canvas.height - padding * 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();

    const maxValue = Math.max(...data.map(d => d.value)) * 1.2;
    const step = width / Math.max(1, data.length - 1);
    ctx.strokeStyle = '#00A3A3';
    ctx.lineWidth = 3;
    ctx.beginPath();
    data.forEach((point, idx) => {
      const x = padding + idx * step;
      const y = canvas.height - padding - (point.value / maxValue) * height;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      ctx.fillStyle = '#FFB100';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0A2540';
      ctx.font = '12px Inter';
      ctx.fillText(point.label, x - 10, canvas.height - padding + 15);
    });
    ctx.stroke();

    const values = data.map(d => d.value);
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    summary.innerHTML = `
      <strong>Insight</strong>
      <p>Avg ${metricSelect.value}: ${avg.toFixed(1)} • Peak ${Math.max(...values).toFixed(1)}</p>
      <p>Data points: ${values.length} (${regionSelect.value})</p>
    `;
  }

  metricSelect.addEventListener('change', drawChart);
  regionSelect.addEventListener('change', drawChart);
  drawChart();
}

function renderTaskManagerDemo(mount) {
  mount.innerHTML = '';
  const stored = JSON.parse(localStorage.getItem('portfolioTasks') || '[]');
  const columns = ['Backlog', 'In Progress', 'Review', 'Done'];
  const board = createElement('div', { class: 'kanban-board' });
  const columnEls = {};
  const totals = createElement('p', { class: 'text-sm text-gray-600' });

  const form = createElement('form', { class: 'demo-controls', style: 'margin-bottom:1rem;' });
  form.innerHTML = `
    <input type="text" id="taskTitle" placeholder="New task title" style="flex:1;padding:0.5rem;border-radius:999px;border:1px solid rgba(10,37,64,0.2);">
    <select id="taskColumn" style="padding:0.5rem;border-radius:999px;border:1px solid rgba(10,37,64,0.2);">
      ${columns.map(col => `<option value="${col}">${col}</option>`).join('')}
    </select>
    <button type="submit" class="btn btn-primary" style="padding:0.5rem 1.2rem;">Add Task</button>
  `;

  mount.append(form, totals, board);

  columns.forEach(col => {
    const columnEl = createElement('div', { class: 'kanban-column' }, [createElement('h4', { text: col })]);
    columnEls[col] = columnEl;
    board.appendChild(columnEl);
  });

  function persist() {
    const snapshot = columns.flatMap(col =>
      Array.from(columnEls[col].querySelectorAll('.kanban-task span')).map(span => ({
        title: span.textContent,
        column: col,
      }))
    );
    localStorage.setItem('portfolioTasks', JSON.stringify(snapshot));
    updateTotals();
  }

  function updateTotals() {
    const counts = columns.map(col => `${col}: ${columnEls[col].querySelectorAll('.kanban-task').length}`);
    totals.textContent = counts.join(' • ');
  }

  function createTaskElement(title, columnIndex = 0) {
    const taskEl = createElement('div', { class: 'kanban-task' });
    const text = createElement('span', { text: title });
    const action = createElement('button', { type: 'button', text: columnIndex < columns.length - 1 ? '→' : '✓' });
    action.addEventListener('click', () => {
      const nextIndex = Math.min(columnIndex + 1, columns.length - 1);
      columnEls[columns[nextIndex]].appendChild(createTaskElement(title, nextIndex));
      taskEl.remove();
      persist();
    });
    taskEl.append(text, action);
    return taskEl;
  }

  form.addEventListener('submit', evt => {
    evt.preventDefault();
    const titleInput = form.querySelector('#taskTitle');
    const columnInput = form.querySelector('#taskColumn');
    const value = titleInput.value.trim();
    if (!value) return;
    const columnIndex = columns.indexOf(columnInput.value);
    columnEls[columnInput.value].appendChild(createTaskElement(value, columnIndex));
    titleInput.value = '';
    persist();
  });

  if (stored.length) {
    stored.forEach(task => {
      const columnIndex = columns.indexOf(task.column);
      if (columnIndex >= 0) {
        columnEls[task.column].appendChild(createTaskElement(task.title, columnIndex));
      }
    });
  } else {
    ['Define success metrics', 'Implement authentication', 'Ship beta build'].forEach((task, idx) => {
      columnEls[columns[idx]].appendChild(createTaskElement(task, idx));
    });
  }

  updateTotals();
}

function renderStatsDemo(mount) {
  mount.innerHTML = '';
  const form = createElement('div', { class: 'stat-form' });
  const textarea = createElement('textarea');
  textarea.placeholder = 'Enter comma-separated numbers, e.g. 12, 14, 18, 17';
  const controls = createElement('div', { class: 'demo-controls' });
  const actionBtn = createElement('button', { class: 'btn btn-secondary', text: 'Run analysis' });
  actionBtn.type = 'button';
  controls.appendChild(actionBtn);
  const presets = [
    { label: 'Marketing CTR', data: '2.1,2.4,1.8,2.3,2.6,2.0,2.5' },
    { label: 'Sensor Temp', data: '71,69,72,70,74,73,72,71' },
  ];
  presets.forEach(preset => {
    const btn = createElement('button', { class: 'btn btn-secondary', text: preset.label });
    btn.type = 'button';
    btn.addEventListener('click', () => {
      textarea.value = preset.data;
      runStats();
    });
    controls.appendChild(btn);
  });
  form.append(textarea, controls);
  mount.appendChild(form);

  const output = createElement('div', { class: 'stat-output' });
  output.textContent = 'Enter data or choose a preset to see statistics.';
  mount.appendChild(output);

  function parseNumbers() {
    return textarea.value
      .split(/[,\s]+/)
      .map(num => parseFloat(num))
      .filter(num => !Number.isNaN(num));
  }

  function mean(values) {
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  function stddev(values, mu) {
    if (values.length < 2) return 0;
    return Math.sqrt(values.reduce((sum, val) => sum + Math.pow(val - mu, 2), 0) / (values.length - 1));
  }

  function runStats() {
    const values = parseNumbers();
    if (!values.length) {
      output.textContent = 'Please enter at least one numeric value.';
      return;
    }
    const mu = mean(values);
    const sd = stddev(values, mu);
    const stderr = values.length > 1 ? sd / Math.sqrt(values.length) : 0;
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    output.innerHTML = `
      <strong>Results (${values.length} observations)</strong>
      <ul>
        <li>Mean: ${mu.toFixed(2)}</li>
        <li>Median: ${median.toFixed(2)}</li>
        <li>Std Dev: ${sd.toFixed(2)}</li>
        <li>Std Error: ${stderr.toFixed(2)}</li>
      </ul>
    `;
  }

  actionBtn.addEventListener('click', runStats);
}

function hydrateProjectDemo() {
  const container = document.querySelector('[data-project-slug]');
  if (!container) return;
  const mount = document.getElementById('projectDemoMount');
  if (!mount) return;
  const slug = window.__PROJECT_SLUG__ || container.getAttribute('data-project-slug');

  const registry = {
    'data-visualization-dashboard': renderDataVizDemo,
    'task-management-app': renderTaskManagerDemo,
    'statistical-analysis-toolkit': renderStatsDemo,
  };

  const renderer = registry[slug];
  if (renderer) {
    renderer(mount);
  } else {
    mount.textContent = 'Demo coming soon.';
  }
}

document.addEventListener('DOMContentLoaded', hydrateProjectDemo);
