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

  const state = {
    metric: 'engagement',
    region: 'All',
  };

  const controls = createElement('div', { class: 'demo-controls' });
  const metricSelect = createElement('select');
  ['engagement', 'retention', 'sessions'].forEach(metric => {
    metricSelect.appendChild(createElement('option', { value: metric, text: metric }));
  });
  metricSelect.value = state.metric;
  const regionSelect = createElement('select');
  const regions = ['All', ...new Set(dataset.map(d => d.region))];
  regions.forEach(region => {
    regionSelect.appendChild(createElement('option', { value: region, text: region }));
  });
  regionSelect.value = state.region;
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

  function getSeries() {
    return dataset
      .filter(d => state.region === 'All' || d.region === state.region)
      .map(d => ({ label: `W${d.week}`, value: d[state.metric] }));
  }

  function paintChart() {
    const data = getSeries();
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
      <strong>Quick read</strong>
      <p>${state.metric} avg: ${avg.toFixed(1)} • peak: ${Math.max(...values).toFixed(1)}</p>
      <p>Samples: ${values.length} (${state.region})</p>
    `;
  }

  metricSelect.addEventListener('change', () => {
    state.metric = metricSelect.value;
    paintChart();
  });
  regionSelect.addEventListener('change', () => {
    state.region = regionSelect.value;
    paintChart();
  });
  paintChart();
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
    ['Polish landing page', 'Hook up auth', 'Ship the beta build'].forEach((task, idx) => {
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

function renderFlappyDemo(mount) {
  mount.innerHTML = '';
  const section = mount.closest('#projectDemo');
  const heading = section ? section.querySelector('h3') : null;
  if (heading) heading.textContent = 'How it works (illustrated)';

  const intro = createElement('p', { class: 'text-gray-700' });
  intro.textContent =
    'Flappy Bird AI evolves an agent with NEAT. The bird sees gaps ahead, feeds those inputs into a neural net, and decides when to flap. Fitness is the distance survived; the best genomes breed and mutate each generation.';

  const figure = createElement('figure', { style: 'margin:1rem 0;' });
  figure.innerHTML = `
    <svg viewBox="0 0 720 360" role="img" aria-label="Diagram of Flappy Bird AI gameplay and neural net" style="width:100%;border-radius:14px;border:1px solid rgba(10,37,64,0.12);box-shadow:0 12px 28px rgba(10,37,64,0.12);background:linear-gradient(180deg,#cde8ff,#f8fbff);">
      <defs>
        <linearGradient id="pipe" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#10b981"/>
          <stop offset="100%" stop-color="#0ea271"/>
        </linearGradient>
      </defs>
      <rect x="0" y="280" width="720" height="80" fill="#dbeafe" />
      <rect x="360" y="0" width="60" height="120" fill="url(#pipe)" rx="6" />
      <rect x="360" y="220" width="60" height="140" fill="url(#pipe)" rx="6" />
      <rect x="520" y="0" width="60" height="150" fill="url(#pipe)" rx="6" />
      <rect x="520" y="230" width="60" height="130" fill="url(#pipe)" rx="6" />
      <ellipse cx="180" cy="190" rx="22" ry="16" fill="#fbbf24" stroke="#0f172a" stroke-width="2" />
      <circle cx="188" cy="182" r="3" fill="#0f172a" />
      <path d="M202 190 l12 -6 l0 12 z" fill="#f97316" stroke="#c2410c" stroke-width="1" />
      <text x="170" y="175" font-family="Inter, sans-serif" font-size="14" fill="#0f172a">Bird (agent)</text>
      <line x1="210" y1="190" x2="340" y2="150" stroke="#0f172a" stroke-width="2" marker-end="url(#arrow)"/>
      <line x1="210" y1="195" x2="340" y2="230" stroke="#0f172a" stroke-width="2" marker-end="url(#arrow)"/>
      <rect x="360" y="140" width="140" height="120" rx="10" fill="#fff" stroke="#0f172a" stroke-width="2" />
      <text x="430" y="160" text-anchor="middle" font-family="Inter, sans-serif" font-size="14" fill="#0f172a">NEAT Neural Net</text>
      <circle cx="390" cy="190" r="10" fill="#38bdf8" />
      <circle cx="390" cy="220" r="10" fill="#38bdf8" />
      <circle cx="430" cy="205" r="10" fill="#a855f7" />
      <circle cx="470" cy="205" r="10" fill="#34d399" />
      <line x1="390" y1="190" x2="430" y2="205" stroke="#0f172a" stroke-width="1.5" />
      <line x1="390" y1="220" x2="430" y2="205" stroke="#0f172a" stroke-width="1.5" />
      <line x1="430" y1="205" x2="470" y2="205" stroke="#0f172a" stroke-width="1.5" />
      <text x="480" y="208" font-family="Inter, sans-serif" font-size="12" fill="#0f172a">Flap?</text>
      <line x1="500" y1="205" x2="560" y2="205" stroke="#f97316" stroke-width="2" marker-end="url(#arrow)"/>
      <text x="570" y="210" font-family="Inter, sans-serif" font-size="12" fill="#f97316">Action</text>
      <text x="360" y="320" font-family="Inter, sans-serif" font-size="13" fill="#0f172a" text-anchor="middle">Fitness = distance survived. Best genome is saved and breeds the next generation.</text>
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="6" refY="5" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill="#0f172a" />
        </marker>
      </defs>
    </svg>
  `;

  const list = createElement('ul', { class: 'list-disc list-inside text-gray-700', style: 'margin:1rem 0 0.5rem 0;' });
  [
    'Sensors feed gap position and bird state into the neural net.',
    'The net outputs a flap/no-flap decision each frame.',
    'Fitness = distance survived; top genomes are saved and used to seed the next generation.'
  ].forEach(item => list.appendChild(createElement('li', { text: item })));

  const cta = createElement('a', {
    href: 'https://github.com/promitdas345/FlappyBirdAi',
    target: '_blank',
    rel: 'noopener',
    class: 'btn btn-primary',
    style: 'margin-top:0.75rem;display:inline-flex;',
    text: 'View GitHub repo'
  });

  mount.append(intro, figure, list, cta);
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
    'flappy-bird-ai': renderFlappyDemo,
  };

  const renderer = registry[slug];
  if (renderer) {
    renderer(mount);
  } else {
    mount.textContent = 'Application coming soon.';
  }
}

document.addEventListener('DOMContentLoaded', hydrateProjectDemo);
