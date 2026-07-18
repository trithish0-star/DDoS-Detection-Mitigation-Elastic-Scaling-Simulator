// ==================== STATE ====================
const state = {
  attack: { active: false, type: '', intensity: 0, duration: 0, elapsed: 0, timer: null, packets: 0, peak: 0 },
  mitigation: { blockedIps: [], rateLimitEnabled: false, rateLimit: 100, droppedRequests: 0, geoBlocked: {}, autoDetect: true, autoBlock: true, autoScale: true, autoBlockedCount: 0 },
  scaling: { servers: [], minServers: 2, maxServers: 10, scaleUpThreshold: 70, scaleDownThreshold: 30, history: { servers: [], cpu: [], requests: [] } },
  logs: [],
  startTime: Date.now(),
  trafficHistory: { labels: [], legit: [], malicious: [], total: [] },
  pieData: { legit: 0, malicious: 0, mitigated: 0 }
};

// ==================== INIT ====================
function init() {
  // Create initial servers
  for (let i = 0; i < 3; i++) addServer();
  initCharts();
  startSimulation();
  renderBlockedIps();
  updateUptime();
  setInterval(updateUptime, 1000);
}

// ==================== TABS ====================
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    switchTab(link.dataset.tab);
  });
});

function switchTab(tab) {
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
  document.getElementById(`tab-${tab}`)?.classList.add('active');
}

// ==================== SERVERS ====================
function addServer() {
  if (state.scaling.servers.length >= state.scaling.maxServers) return;
  const id = state.scaling.servers.length + 1;
  state.scaling.servers.push({
    id, name: `Server-${id}`, ip: `10.0.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`,
    cpu: 20 + Math.random() * 30, memory: 30 + Math.random() * 20, requests: 0, status: 'healthy'
  });
  addLog('info', `Server-${id} provisioned and added to fleet`);
  renderServers();
}

function removeServer() {
  if (state.scaling.servers.length <= state.scaling.minServers) return;
  const removed = state.scaling.servers.pop();
  addLog('warn', `${removed.name} decommissioned`);
  renderServers();
}

function manualScaleUp() { addServer(); }
function manualScaleDown() { removeServer(); }

function renderServers() {
  ['serverGrid', 'scalingServerGrid'].forEach(gridId => {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = state.scaling.servers.map(s => {
      const cpuColor = s.cpu > 80 ? 'red' : s.cpu > 50 ? 'orange' : 'green';
      const memColor = s.memory > 80 ? 'red' : s.memory > 50 ? 'orange' : 'green';
      return `<div class="server-card">
        <div class="server-card-header">
          <span class="server-name">${s.name}</span>
          <span class="badge ${s.status === 'healthy' ? '' : s.status === 'overloaded' ? 'danger' : 'warning'}">${s.status}</span>
        </div>
        <div class="server-bar">
          <div class="server-bar-label"><span>CPU</span><span>${s.cpu.toFixed(1)}%</span></div>
          <div class="server-bar-track"><div class="server-bar-fill ${cpuColor}" style="width:${s.cpu}%"></div></div>
        </div>
        <div class="server-bar">
          <div class="server-bar-label"><span>Memory</span><span>${s.memory.toFixed(1)}%</span></div>
          <div class="server-bar-track"><div class="server-bar-fill ${memColor}" style="width:${s.memory}%"></div></div>
        </div>
        <div class="server-ip">${s.ip}</div>
      </div>`;
    }).join('');
  });
  document.getElementById('kpiServers').textContent = state.scaling.servers.length;
  document.getElementById('kpiBlocked').textContent = state.mitigation.blockedIps.length + state.mitigation.autoBlockedCount;
}

// ==================== SIMULATION ====================
function startSimulation() {
  setInterval(() => {
    const baseRps = 200 + Math.random() * 300;
    let attackRps = 0;
    if (state.attack.active) {
      attackRps = state.attack.intensity * (0.7 + Math.random() * 0.6);
      state.attack.packets += attackRps;
      if (attackRps > state.attack.peak) state.attack.peak = attackRps;
    }

    let mitigated = 0;
    if (state.mitigation.rateLimitEnabled) {
      mitigated += Math.floor(attackRps * 0.3);
      state.mitigation.droppedRequests += mitigated;
    }

    const totalRps = baseRps + attackRps;
    const legitRps = baseRps + Math.floor(attackRps * 0.05);
    const maliciousRps = attackRps - mitigated;

    // Update pie
    state.pieData.legit = legitRps;
    state.pieData.malicious = Math.max(0, maliciousRps);
    state.pieData.mitigated = mitigated;

    // Update KPIs
    document.getElementById('kpiRps').textContent = Math.floor(totalRps).toLocaleString();
    document.getElementById('kpiLegit').textContent = Math.floor(legitRps).toLocaleString();
    document.getElementById('kpiMalicious').textContent = Math.max(0, Math.floor(maliciousRps)).toLocaleString();
    document.getElementById('droppedCount').textContent = state.mitigation.droppedRequests.toLocaleString();
    document.getElementById('autoBlockedCount').textContent = state.mitigation.autoBlockedCount;

    // System status
    const sysStatus = document.getElementById('systemStatus');
    if (state.attack.active && maliciousRps > 500) {
      sysStatus.innerHTML = '<span class="status-dot red"></span> Under Attack';
    } else {
      sysStatus.innerHTML = '<span class="status-dot green"></span> System Online';
    }

    // Update servers
    updateServers(totalRps, maliciousRps);

    // Update charts
    updateTrafficChart(totalRps, legitRps, maliciousRps);
    updatePieChart();
    updateAttackChart(attackRps);
    updateScalingChart();

    // Auto mitigation
    if (state.attack.active && state.mitigation.autoDetect && maliciousRps > 1000) {
      if (state.mitigation.autoBlock && Math.random() < 0.3) {
        const fakeIp = `${Math.floor(Math.random()*223)+1}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;
        if (!state.mitigation.blockedIps.includes(fakeIp)) {
          state.mitigation.blockedIps.push(fakeIp);
          state.mitigation.autoBlockedCount++;
          addLog('warn', `Auto-blocked suspicious IP: ${fakeIp}`);
        }
      }
    }
  }, 1000);
}

function updateServers(totalRps, maliciousRps) {
  const loadPerServer = totalRps / state.scaling.servers.length;
  state.scaling.servers.forEach(s => {
    s.cpu = Math.min(100, (loadPerServer / 500) * 60 + Math.random() * 20);
    s.memory = Math.min(100, s.memory + (Math.random() - 0.4) * 5);
    s.requests = Math.floor(loadPerServer);
    s.status = s.cpu > 90 ? 'overloaded' : s.cpu > 70 ? 'warning' : 'healthy';
  });

  // Auto-scaling
  if (state.mitigation.timeScale) {
    const avgCpu = state.scaling.servers.reduce((a, s) => a + s.cpu, 0) / state.scaling.servers.length;
    if (avgCpu > state.scaling.scaleUpThreshold && state.scaling.servers.length < state.scaling.maxServers) {
      addServer();
    } else if (avgCpu < state.scaling.scaleDownThreshold && state.scaling.servers.length > state.scaling.minServers) {
      removeServer();
    }
  }
  renderServers();
}

// ==================== CHARTS ====================
let trafficChart, pieChart, attackChart, scalingChart;
const maxDataPoints = 30;

function initCharts() {
  Chart.defaults.color = '#8b8fa3';
  Chart.defaults.borderColor = '#2d3148';

  trafficChart = new Chart(document.getElementById('trafficChart'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Total', data: [], borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.3, pointRadius: 0 },
        { label: 'Legitimate', data: [], borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.05)', fill: true, tension: 0.3, pointRadius: 0 },
        { label: 'Malicious', data: [], borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.05)', fill: true, tension: 0.3, pointRadius: 0 }
      ]
    },
    options: { responsive: true, animation: { duration: 300 }, scales: { y: { beginAtZero: true } }, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 15 } } } }
  });

  pieChart = new Chart(document.getElementById('pieChart'), {
    type: 'doughnut',
    data: {
      labels: ['Legitimate', 'Malicious', 'Mitigated'],
      datasets: [{ data: [100, 0, 0], backgroundColor: ['#22c55e', '#ef4444', '#f59e0b'], borderWidth: 0 }]
    },
    options: { responsive: true, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 15 } } } }
  });

  attackChart = new Chart(document.getElementById('attackChart'), {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{ label: 'Attack RPS', data: [], backgroundColor: 'rgba(239,68,68,0.6)', borderColor: '#ef4444', borderWidth: 1 }]
    },
    options: { responsive: true, animation: { duration: 200 }, scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } } }
  });

  scalingChart = new Chart(document.getElementById('scalingChart'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Servers', data: [], borderColor: '#3b82f6', tension: 0.3, pointRadius: 2, yAxisID: 'y' },
        { label: 'CPU %', data: [], borderColor: '#ef4444', tension: 0.3, pointRadius: 2, yAxisID: 'y1' },
        { label: 'Requests', data: [], borderColor: '#22c55e', tension: 0.3, pointRadius: 2, yAxisID: 'y1' }
      ]
    },
    options: {
      responsive: true, animation: { duration: 300 },
      scales: {
        y: { position: 'left', beginAtZero: true, title: { display: true, text: 'Servers' } },
        y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: 'CPU % / RPS' } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

function updateTrafficChart(total, legit, malicious) {
  const now = new Date().toLocaleTimeString();
  trafficChart.data.labels.push(now);
  trafficChart.data.datasets[0].data.push(total);
  trafficChart.data.datasets[1].data.push(legit);
  trafficChart.data.datasets[2].data.push(malicious);
  if (trafficChart.data.labels.length > maxDataPoints) {
    trafficChart.data.labels.shift();
    trafficChart.data.datasets.forEach(d => d.data.shift());
  }
  trafficChart.update('none');
}

function updatePieChart() {
  pieChart.data.datasets[0].data = [state.pieData.legit, state.pieData.malicious, state.pieData.mitigated];
  pieChart.update('none');
}

function updateAttackChart(rps) {
  const now = new Date().toLocaleTimeString();
  attackChart.data.labels.push(now);
  attackChart.data.datasets[0].data.push(rps);
  if (attackChart.data.labels.length > 20) {
    attackChart.data.labels.shift();
    attackChart.data.datasets[0].data.shift();
  }
  attackChart.update('none');
}

function updateScalingChart() {
  const now = new Date().toLocaleTimeString();
  const avgCpu = state.scaling.servers.length > 0 ? state.scaling.servers.reduce((a, s) => a + s.cpu, 0) / state.scaling.servers.length : 0;
  const totalReqs = state.scaling.servers.reduce((a, s) => a + s.requests, 0);
  scalingChart.data.labels.push(now);
  scalingChart.data.datasets[0].data.push(state.scaling.servers.length);
  scalingChart.data.datasets[1].data.push(avgCpu);
  scalingChart.data.datasets[2].data.push(totalReqs);
  if (scalingChart.data.labels.length > maxDataPoints) {
    scalingChart.data.labels.shift();
    scalingChart.data.datasets.forEach(d => d.data.shift());
  }
  scalingChart.update('none');
}

// ==================== ATTACK ====================
function launchAttack() {
  if (state.attack.active) return;
  const intensity = parseInt(document.getElementById('attackIntensity').value);
  const duration = parseInt(document.getElementById('attackDuration').value);
  const sources = parseInt(document.getElementById('attackSources').value);
  const type = document.getElementById('attackType').value;
  const port = document.getElementById('attackPort').value;

  state.attack = { active: true, type, intensity, duration, elapsed: 0, timer: null, packets: 0, peak: 0 };
  document.getElementById('launchBtn').disabled = true;
  document.getElementById('stopBtn').disabled = false;
  document.getElementById('attackProgress').style.display = 'block';

  const typeNames = { syn_flood: 'SYN Flood', udp_flood: 'UDP Flood', http_flood: 'HTTP Flood', icmp_flood: 'ICMP Flood', slowloris: 'Slowloris', dns_amplification: 'DNS Amplification' };
  document.querySelector('.attack-status-text').innerHTML = `<span style="color:var(--red)">&#128680; ${typeNames[type]} ACTIVE</span>`;
  document.querySelector('.attack-status-text').innerHTML += `<br><small style="color:var(--text2)">${intensity.toLocaleString()} rps from ${sources} sources on port ${port}</small>`;

  addLog('error', `Attack launched: ${typeNames[type]} at ${intensity.toLocaleString()} rps, ${sources} spoofed IPs, port ${port}`);

  state.attack.timer = setInterval(() => {
    state.attack.elapsed++;
    const pct = (state.attack.elapsed / state.attack.duration) * 100;
    document.getElementById('attackProgressFill').style.width = pct + '%';
    document.getElementById('attackTimeLeft').textContent = (state.attack.duration - state.attack.elapsed) + 's remaining';
    document.getElementById('atkPackets').textContent = state.attack.packets.toLocaleString();
    document.getElementById('atkBandwidth').textContent = ((state.attack.packets * 64) / 1000000).toFixed(1) + ' Mbps';
    document.getElementById('atkPeak').textContent = Math.floor(state.attack.peak).toLocaleString();

    if (state.attack.elapsed >= state.attack.duration) {
      stopAttack();
    }
  }, 1000);
}

function stopAttack() {
  clearInterval(state.attack.timer);
  const finalPackets = state.attack.packets;
  addLog('success', `Attack ended. Total packets: ${finalPackets.toLocaleString()}, Peak: ${Math.floor(state.attack.peak).toLocaleString()} rps`);
  state.attack = { active: false, type: '', intensity: 0, duration: 0, elapsed: 0, timer: null, packets: 0, peak: 0 };
  document.getElementById('launchBtn').disabled = false;
  document.getElementById('stopBtn').disabled = true;
  document.getElementById('attackProgress').style.display = 'none';
  document.getElementById('attackProgressFill').style.width = '0';
  document.querySelector('.attack-status-text').textContent = 'No active attack';
  document.getElementById('atkPackets').textContent = '0';
  document.getElementById('atkBandwidth').textContent = '0 Mbps';
  document.getElementById('atkPeak').textContent = '0';
}

// ==================== MITIGATION ====================
function blockIp() {
  const ip = document.getElementById('blockIpInput').value.trim();
  if (!ip) return;
  if (state.mitigation.blockedIps.includes(ip)) { addLog('warn', `IP ${ip} is already blocked`); return; }
  state.mitigation.blockedIps.push(ip);
  document.getElementById('blockIpInput').value = '';
  addLog('warn', `Manually blocked IP: ${ip}`);
  renderBlockedIps();
  renderServers();
}

function unblockIp(ip) {
  state.mitigation.blockedIps = state.mitigation.blockedIps.filter(i => i !== ip);
  addLog('success', `Unblocked IP: ${ip}`);
  renderBlockedIps();
  renderServers();
}

function renderBlockedIps() {
  const list = document.getElementById('blockedList');
  if (state.mitigation.blockedIps.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:10px;color:var(--text2);font-size:0.85rem">No blocked IPs</div>';
    return;
  }
  list.innerHTML = state.mitigation.blockedIps.map(ip =>
    `<div class="blocked-item"><span>${ip}</span><button onclick="unblockIp('${ip}')">&#10005;</button></div>`
  ).join('');
}

function toggleRateLimit() {
  state.mitigation.rateLimitEnabled = document.getElementById('rateLimitToggle').checked;
  state.mitigation.rateLimit = parseInt(document.getElementById('rateLimit').value);
  addLog('info', `Rate limiting ${state.mitigation.rateLimitEnabled ? 'enabled' : 'disabled'}: ${state.mitigation.rateLimit} req/min/IP`);
}

function toggleGeo(region, enabled) {
  state.mitigation.geoBlocked[region] = enabled;
  addLog('info', `Geo-blocking ${region}: ${enabled ? 'ON' : 'OFF'}`);
}

function toggleAutoDetect() { state.mitigation.autoDetect = document.getElementById('autoDetectToggle').checked; addLog('info', `Auto-detect: ${state.mitigation.autoDetect ? 'ON' : 'OFF'}`); }
function toggleAutoBlock() { state.mitigation.autoBlock = document.getElementById('autoBlockToggle').checked; addLog('info', `Auto-block: ${state.mitigation.autoBlock ? 'ON' : 'OFF'}`); }
function toggleAutoScale() { state.mitigation.timeScale = document.getElementById('autoScaleToggle').checked; addLog('info', `Auto-scale: ${state.mitigation.timeScale ? 'ON' : 'OFF'}`); }

// ==================== SCALING ====================
function applyScalingRules() {
  state.scaling.scaleUpThreshold = parseInt(document.getElementById('scaleUpThreshold').value);
  state.scaling.scaleDownThreshold = parseInt(document.getElementById('scaleDownThreshold').value);
  state.scaling.minServers = parseInt(document.getElementById('minServers').value);
  state.scaling.maxServers = parseInt(document.getElementById('maxServers').value);
  addLog('info', `Scaling rules updated: UP>${state.scaling.scaleUpThreshold}% DOWN<${state.scaling.scaleDownThreshold}% MIN=${state.scaling.minServers} MAX=${state.scaling.maxServers}`);
}

// ==================== LOGS ====================
function addLog(level, msg) {
  const time = new Date().toLocaleTimeString();
  state.logs.unshift({ time, level, msg });
  if (state.logs.length > 200) state.logs.pop();
  renderLogs();
}

function renderLogs() {
  const container = document.getElementById('logContainer');
  if (state.logs.length === 0) {
    container.innerHTML = '<div class="log-empty">No events yet.</div>';
    return;
  }
  container.innerHTML = state.logs.map(l =>
    `<div class="log-entry"><span class="log-time">${l.time}</span><span class="log-level ${l.level}">${l.level}</span><span class="log-msg">${l.msg}</span></div>`
  ).join('');
}

function clearLogs() { state.logs = []; renderLogs(); }

function exportLogs() {
  const csv = 'Time,Level,Message\n' + state.logs.map(l => `${l.time},${l.level},"${l.msg}"`).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ddos_logs.csv'; a.click();
}

// ==================== UPTIME ====================
function updateUptime() {
  const diff = Math.floor((Date.now() - state.startTime) / 1000);
  const h = String(Math.floor(diff / 3600)).padStart(2, '0');
  const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
  const s = String(diff % 60).padStart(2, '0');
  document.getElementById('kpiUptime').textContent = `${h}:${m}:${s}`;
}

// GO
init();
