/* ══════════════════════════════════════════════════════════════
   SIH26025 — Core Simulation Engine
   20-Node, 3-Zone, 3-Gateway Architecture
   ══════════════════════════════════════════════════════════════ */

/* ── 20-NODE SYSTEM STATE ── */
const ZONES = {
  east:  { id:'East',  nodes:['E1','E2','E3','E4','E5','E6','E7'], gw:'GW-E', color:'#059669' },
  west:  { id:'West',  nodes:['W1','W2','W3','W4','W5','W6','W7'], gw:'GW-W', color:'#3b82f6' },
  north: { id:'North', nodes:['N1','N2','N3','N4','N5','N6'],       gw:'GW-N', color:'#7c3aed' },
};

function mkNode(id, bat) {
  return {
    id, x:0, y:0, st:'online', bat,
    tilt: +(Math.random()*0.5+0.1).toFixed(2),
    vib:  +(Math.random()*0.15+0.05).toFixed(2),
    str:  +(Math.random()*0.03+0.005).toFixed(3),
    moi:  +(Math.random()*15+30).toFixed(0),
    temp: +(Math.random()*5+28).toFixed(1),
    anom: false, drift: false, hist: []
  };
}
function mkGW(id) { return { id, x:0, y:0, st:'online', inet:true }; }

const N = [];
['E1','E2','E3','E4','E5','E6','E7'].forEach(id => N.push(mkNode(id, 90+~~(Math.random()*10))));
['W1','W2','W3','W4','W5','W6','W7'].forEach(id => N.push(mkNode(id, 85+~~(Math.random()*15))));
['N1','N2','N3','N4','N5','N6'].forEach(id => N.push(mkNode(id, 70+~~(Math.random()*25))));

const GW  = [mkGW('GW-E'), mkGW('GW-W'), mkGW('GW-N')];
const CLD = { x:0, y:0 };

let links = [], pkts = [];
let aLvl = 0;
let ml = { if:0.08, lstm:0.10, pinn:0.18, ens:0.12 };
let pph = 51, lat = 698, simSpeed = 1, simT = 0;
let running = false, steps = [], si = 0;
let selNode = null, dragNode = null, dragOff = { x:0, y:0 };
const testLog = [];

/* Timer state */
let timerStart = 0, timerInterval = null;

function ni(id) { return N.find(n => n.id === id); }

/* ══════════════════════════════════════
   CANVAS SETUP
   ══════════════════════════════════════ */
const cv = document.getElementById('cv');
const c  = cv.getContext('2d');
let W, H;

function resize() {
  const r = cv.parentElement.getBoundingClientRect();
  W = cv.width  = r.width  * devicePixelRatio;
  H = cv.height = r.height * devicePixelRatio;
  cv.style.width  = r.width  + 'px';
  cv.style.height = r.height + 'px';
  c.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  layoutAll();
}

function layoutAll() {
  const w = W / devicePixelRatio, h = H / devicePixelRatio;
  // East zone — left column
  N.filter(n => n.id.startsWith('E')).forEach((n, i) => {
    n.x = w*0.15 + Math.cos(i*0.9-1.5)*w*0.1;
    n.y = h*0.15 + i*(h*0.7/6);
  });
  // West zone — center
  N.filter(n => n.id.startsWith('W')).forEach((n, i) => {
    n.x = w*0.42 + Math.cos(i*0.7-1)*w*0.08;
    n.y = h*0.12 + i*(h*0.72/6);
  });
  // North zone — right
  N.filter(n => n.id.startsWith('N')).forEach((n, i) => {
    n.x = w*0.68 + Math.sin(i*0.8)*w*0.06;
    n.y = h*0.18 + i*(h*0.65/5);
  });
  // Gateways & Cloud
  GW[0].x = w*0.28; GW[0].y = h*0.5;
  GW[1].x = w*0.52; GW[1].y = h*0.5;
  GW[2].x = w*0.78; GW[2].y = h*0.45;
  CLD.x   = w*0.88; CLD.y   = h*0.12;
  rebuildLinks();
}

function rebuildLinks() {
  links = [];
  const addChain = (ids) => {
    for (let i=0; i<ids.length-1; i++) {
      const a=ni(ids[i]), b=ni(ids[i+1]);
      if (a.st!=='offline' && b.st!=='offline')
        links.push({ f:a, t:b, on:true, tp:'lora' });
    }
  };
  addChain(['E1','E2','E3','E4','E5','E6','E7']);
  addChain(['W1','W2','W3','W4','W5','W6','W7']);
  addChain(['N1','N2','N3','N4','N5','N6']);
  // Cross-links within zones
  [['E1','E3'],['E2','E5'],['E4','E6'],['W1','W4'],['W2','W5'],['W3','W6'],['N1','N4'],['N2','N5']].forEach(([a,b]) => {
    const na=ni(a), nb=ni(b);
    if (na.st!=='offline' && nb.st!=='offline') links.push({ f:na, t:nb, on:true, tp:'lora' });
  });
  // Nodes → zone gateway
  [['E3',0],['E5',0],['W3',1],['W5',1],['N3',2],['N5',2]].forEach(([id,gi]) => {
    const n=ni(id);
    if (n.st!=='offline' && GW[gi].st==='online') links.push({ f:n, t:GW[gi], on:true, tp:'gw' });
  });
  // Inter-gateway fallback links
  if (GW[0].st==='online' && GW[1].st==='online') links.push({ f:GW[0], t:GW[1], on:true, tp:'inter' });
  if (GW[1].st==='online' && GW[2].st==='online') links.push({ f:GW[1], t:GW[2], on:true, tp:'inter' });
  // Gateways → cloud
  GW.forEach(g => { if (g.st==='online' && g.inet) links.push({ f:g, t:CLD, on:true, tp:'inet' }); });
}

window.addEventListener('resize', resize);

/* ══════════════════════════════════════
   DRAWING
   ══════════════════════════════════════ */
function draw() {
  const w = W/devicePixelRatio, h = H/devicePixelRatio;
  c.clearRect(0, 0, w, h);
  drawZone(w*0.04, h*0.05, w*0.3,  h*0.9,  'East Panel',  'rgba(5,150,105,0.04)', 'rgba(5,150,105,0.12)');
  drawZone(w*0.32, h*0.03, w*0.26, h*0.92, 'West Panel',  'rgba(59,130,246,0.04)', 'rgba(59,130,246,0.12)');
  drawZone(w*0.6,  h*0.08, w*0.25, h*0.82, 'North Panel', 'rgba(124,58,237,0.04)', 'rgba(124,58,237,0.12)');
  links.forEach(drawLink);
  pkts.forEach(drawPkt);
  N.forEach(drawNode);
  GW.forEach(drawGW);
  drawCld();
}

function drawZone(x, y, w, h, label, fill, textClr) {
  c.save();
  c.beginPath(); rr(c, x, y, w, h, 12);
  c.fillStyle = fill; c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.04)'; c.lineWidth = 1;
  c.setLineDash([6,4]); c.stroke(); c.setLineDash([]);
  c.font = '600 10px Inter'; c.fillStyle = textClr;
  c.textAlign = 'center'; c.fillText(label, x+w/2, y+14);
  c.restore();
}

function drawLink(l) {
  c.save(); c.beginPath();
  c.moveTo(l.f.x, l.f.y); c.lineTo(l.t.x, l.t.y);
  if (!l.on) { c.strokeStyle='rgba(220,38,38,0.2)'; c.setLineDash([4,5]); c.lineWidth=1; }
  else if (l.tp==='inet')  { c.strokeStyle='rgba(124,58,237,0.25)'; c.setLineDash([5,4]); c.lineWidth=1; }
  else if (l.tp==='inter') { c.strokeStyle='rgba(59,130,246,0.2)';  c.setLineDash([3,3]); c.lineWidth=1; }
  else if (l.tp==='gw')    { c.strokeStyle='rgba(59,130,246,0.25)'; c.lineWidth=1.5; }
  else                     { c.strokeStyle='rgba(8,145,178,0.18)';  c.lineWidth=1; }
  c.stroke(); c.restore();
}

function nClr(n) {
  if (n.st==='offline')  return { f:'rgba(220,38,38,0.12)', s:'#dc2626', g:'rgba(220,38,38,0.2)' };
  if (n.st==='critical') return { f:'rgba(220,38,38,0.1)',  s:'#dc2626', g:'rgba(220,38,38,0.25)' };
  if (n.anom)            return { f:'rgba(217,119,6,0.1)',  s:'#d97706', g:'rgba(217,119,6,0.2)' };
  if (n.drift)           return { f:'rgba(234,88,12,0.1)',  s:'#ea580c', g:'rgba(234,88,12,0.2)' };
  if (n.bat < 20)        return { f:'rgba(217,119,6,0.08)',s:'#d97706', g:'rgba(217,119,6,0.15)' };
  return { f:'rgba(5,150,105,0.08)', s:'#059669', g:'rgba(5,150,105,0.12)' };
}

function drawNode(n) {
  const cl = nClr(n), r = 16;
  c.save();
  if (selNode === n.id) {
    c.beginPath(); c.arc(n.x, n.y, r+5, 0, Math.PI*2);
    c.strokeStyle = 'rgba(59,130,246,0.4)'; c.lineWidth = 2; c.stroke();
  }
  if (n.anom || n.st === 'critical') {
    const pr = r + 4 + Math.sin(simT*4)*3;
    c.beginPath(); c.arc(n.x, n.y, pr, 0, Math.PI*2);
    c.strokeStyle = cl.s; c.globalAlpha = 0.2 + Math.sin(simT*4)*0.15;
    c.lineWidth = 1.5; c.stroke(); c.globalAlpha = 1;
  }
  c.beginPath(); c.arc(n.x, n.y, r, 0, Math.PI*2);
  c.fillStyle = cl.f; c.fill();
  c.strokeStyle = cl.s; c.lineWidth = 1.5; c.stroke();
  c.font = '700 8px JetBrains Mono'; c.fillStyle = cl.s;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(n.id, n.x, n.y);
  c.font = '400 7px Inter'; c.fillStyle = 'rgba(0,0,0,0.35)';
  const st = n.st==='offline' ? 'OFF' : n.drift ? 'DRIFT' : n.anom ? '⚠' : n.bat<20 ? 'LOW' : `${n.bat}%`;
  c.fillText(st, n.x, n.y + r + 9);
  c.restore();
}

function drawGW(g) {
  const sz=22, online = g.st==='online';
  c.save(); c.beginPath(); rr(c, g.x-sz, g.y-sz*0.6, sz*2, sz*1.2, 6);
  c.fillStyle = online ? 'rgba(59,130,246,0.06)' : 'rgba(220,38,38,0.06)';
  c.fill();
  c.strokeStyle = online ? '#3b82f6' : '#dc2626';
  c.lineWidth = 1.5; c.stroke();
  c.font = '700 8px JetBrains Mono';
  c.fillStyle = online ? '#3b82f6' : '#dc2626';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(g.id, g.x, g.y);
  c.font = '400 6px Inter'; c.fillStyle = 'rgba(0,0,0,0.3)';
  c.fillText(g.inet ? '●4G' : '✕4G', g.x, g.y + sz*0.6 + 8);
  c.restore();
}

function drawCld() {
  c.save(); c.beginPath(); rr(c, CLD.x-22, CLD.y-14, 44, 28, 6);
  c.fillStyle = 'rgba(124,58,237,0.05)'; c.fill();
  c.strokeStyle = 'rgba(124,58,237,0.3)'; c.lineWidth = 1; c.stroke();
  c.font = '700 8px JetBrains Mono'; c.fillStyle = '#7c3aed';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('CLOUD', CLD.x, CLD.y);
  c.restore();
}

function drawPkt(p) {
  c.save(); c.beginPath(); c.arc(p.x, p.y, 3, 0, Math.PI*2);
  c.fillStyle = p.c; c.fill();
  if (p.l) {
    c.font = '600 6px JetBrains Mono';
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.textAlign = 'center';
    c.fillText(p.l, p.x, p.y - 6);
  }
  c.restore();
}

function rr(ctx, x, y, w, h, r) {
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
}

/* ══════════════════════════════════════
   PACKET ANIMATION
   ══════════════════════════════════════ */
function spawn(f, t, co, l) {
  pkts.push({ x:f.x, y:f.y, sx:f.x, sy:f.y, tx:t.x, ty:t.y, p:0, c:co||'#0891b2', l:l||'' });
}

function updPkts(dt) {
  for (let i = pkts.length-1; i >= 0; i--) {
    const p = pkts[i];
    p.p += dt * 1.5 * simSpeed;
    p.x = p.sx + (p.tx - p.sx) * p.p;
    p.y = p.sy + (p.ty - p.sy) * p.p;
    if (p.p >= 1) pkts.splice(i, 1);
  }
}

/* ══════════════════════════════════════
   INTERACTION — Click & Drag Nodes
   ══════════════════════════════════════ */
cv.addEventListener('mousedown', e => {
  const r = cv.getBoundingClientRect(), mx = e.clientX-r.left, my = e.clientY-r.top;
  for (const n of N) {
    const dx = mx-n.x, dy = my-n.y;
    if (dx*dx + dy*dy < 20*20) {
      dragNode = n; dragOff = {x:dx, y:dy};
      selNode = n.id; showND(n); return;
    }
  }
  selNode = null;
  document.getElementById('ndPanel').classList.remove('show');
});
cv.addEventListener('mousemove', e => {
  if (!dragNode) return;
  const r = cv.getBoundingClientRect();
  dragNode.x = e.clientX - r.left - dragOff.x;
  dragNode.y = e.clientY - r.top  - dragOff.y;
  rebuildLinks();
});
cv.addEventListener('mouseup',    () => { dragNode = null; });
cv.addEventListener('mouseleave', () => { dragNode = null; });

/* ══════════════════════════════════════
   NODE DETAIL PANEL
   ══════════════════════════════════════ */
function showND(n) {
  const p = document.getElementById('ndPanel');
  p.classList.add('show');
  document.getElementById('ndId').textContent = n.id;
  document.getElementById('ndId').style.color = nClr(n).s;
  const items = [
    { l:'Status',    v:n.st.toUpperCase(), cl: n.st==='online'?'var(--green)':n.st==='offline'?'var(--red)':'var(--yellow)' },
    { l:'Battery',   v:n.bat+'%',    cl: n.bat>50?'var(--green)':n.bat>20?'var(--yellow)':'var(--red)' },
    { l:'Tilt',      v:n.tilt+'°',   cl: n.tilt<1?'var(--text)':n.tilt<2?'var(--yellow)':'var(--red)' },
    { l:'Vibration', v:n.vib+'g',    cl: 'var(--text)' },
    { l:'Strain',    v:n.str,        cl: 'var(--text)' },
    { l:'Moisture',  v:n.moi+'%',    cl: 'var(--cyan)' },
    { l:'Temp',      v:n.temp+'°C',  cl: 'var(--text)' },
    { l:'Anomaly',   v:n.anom?'YES':'No', cl: n.anom?'var(--red)':'var(--green)' },
  ];
  document.getElementById('ndGrid').innerHTML = items.map(i =>
    `<div class="nd-item"><div class="nd-lbl">${i.l}</div><div class="nd-val" style="color:${i.cl}">${i.v}</div></div>`
  ).join('');
  drawNDChart(n);
}
function closeND() { document.getElementById('ndPanel').classList.remove('show'); selNode = null; }

/* ── Welcome Popup Minimize/Restore ── */
function minimizeWelcome() {
  document.getElementById('scInfo').classList.add('minimized');
  document.getElementById('scRestore').classList.add('show');
}
function restoreWelcome() {
  document.getElementById('scInfo').classList.remove('minimized');
  document.getElementById('scRestore').classList.remove('show');
}

function drawNDChart(n) {
  const cv2 = document.getElementById('ndChart');
  const cx2 = cv2.getContext('2d');
  const pw  = cv2.parentElement.offsetWidth;
  const w = cv2.width = pw*2, h = cv2.height = 80*2;
  cv2.style.width = pw + 'px'; cv2.style.height = '80px';
  cx2.setTransform(2, 0, 0, 2, 0, 0);
  cx2.clearRect(0, 0, pw, 80);
  const hist = n.hist.length ? n.hist : Array(60).fill(n.tilt);
  const max = Math.max(...hist, 1), min = Math.min(...hist, 0);
  const range = max - min || 1;
  cx2.beginPath();
  cx2.moveTo(0, 80 - ((hist[0]-min)/range)*64 - 8);
  for (let i=1; i<hist.length; i++) {
    cx2.lineTo(i*(pw/(hist.length-1)), 80 - ((hist[i]-min)/range)*64 - 8);
  }
  cx2.strokeStyle = nClr(n).s; cx2.lineWidth = 1.5; cx2.stroke();
}

/* ══════════════════════════════════════
   LOGGING
   ══════════════════════════════════════ */
function log(tag, cls, msg) {
  const b = document.getElementById('logBox');
  const t = new Date().toLocaleTimeString('en-IN', { hour12:false });
  const e = document.createElement('div');
  e.className = 'le';
  e.innerHTML = `<span class="lt">${t}</span><span class="ltg ${cls}">[${tag}]</span><span class="lm">${msg}</span>`;
  b.prepend(e);
  while (b.children.length > 300) b.removeChild(b.lastChild);
  testLog.push({ time:t, tag, cls, msg });
}
function clearLog() { document.getElementById('logBox').innerHTML = ''; }

/* ══════════════════════════════════════
   UI UPDATE
   ══════════════════════════════════════ */
function upUI() {
  const bn = document.getElementById('aBanner');
  const lvls  = ['l0','l1','l2','l3'];
  const names = ['L0 — NORMAL','L1 — WATCH','L2 — WARNING','L3 — CRITICAL'];
  const icons = ['✅','👁️','⚠️','🚨'];
  const msgs  = ['All systems operational','Anomaly detected — monitoring','Multiple anomalies — mine manager notified','EVACUATION — Siren activated'];
  bn.className = 'alert-bar ' + lvls[aLvl];
  document.getElementById('aIcon').textContent = icons[aLvl];
  document.getElementById('aText').textContent = `TARP Level ${names[aLvl]} — ${msgs[aLvl]}`;
  const on = N.filter(n => n.st!=='offline').length;
  const an = N.filter(n => n.anom).length;
  const gwOn = GW.filter(g => g.st==='online').length;
  document.getElementById('aDetail').textContent = `${on}/20 nodes · ${an} anomalies · ${gwOn} gateways online`;

  const mc = (id,v,s,cl) => {
    const e = document.getElementById(id);
    e.querySelector('.mv').textContent = v;
    e.querySelector('.ms').textContent = s;
    e.className = 'mc ' + cl;
  };
  mc('mN',  `${on}/20`, `${20-on} offline`, on>=18?'cg':on>=12?'cy':'cr');
  mc('mML', ml.ens.toFixed(2), `IF:${ml.if.toFixed(2)} LSTM:${ml.lstm.toFixed(2)} PINN:${ml.pinn.toFixed(2)}`, ml.ens<0.3?'cb':ml.ens<0.6?'cy':'cr');
  mc('mGW', `${gwOn}/3`, gwOn===3?'All online':`${3-gwOn} down`, gwOn===3?'cg':gwOn>=2?'cy':'cr');
  const bufPct = GW.some(g => !g.inet) ? 15 : 0;
  mc('mBuf', bufPct+'%', `${bufPct?~~(bufPct*302.4):0} / 30240 rows`, bufPct<30?'cb':bufPct<70?'cy':'cr');

  const zoneUp = (zId, prefix, total) => {
    const cnt   = N.filter(n => n.id.startsWith(prefix) && n.st!=='offline').length;
    const anCnt = N.filter(n => n.id.startsWith(prefix) && n.anom).length;
    const el = document.getElementById(zId);
    el.className = 'zone-card ' + (anCnt>0 ? 'crit' : cnt<total ? 'warn' : 'ok');
    el.querySelector('.zs').textContent = anCnt>0 ? `${anCnt} anomalies` : `${cnt}/${total} nodes`;
  };
  zoneUp('zE','E',7); zoneUp('zW','W',7); zoneUp('zN','N',6);

  document.getElementById('cPkt').innerHTML = `<span class="dot" style="background:var(--cyan)"></span>${pph} pkt/hr/node`;
  document.getElementById('cLat').innerHTML = `<span class="dot" style="background:var(--purple)"></span>${lat}ms avg`;

  if (selNode) { const sn = ni(selNode); if (sn) showND(sn); }
}

/* ══════════════════════════════════════
   CONTROLS
   ══════════════════════════════════════ */
function setSpeed(s) {
  simSpeed = s;
  document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('cSim').innerHTML = `<span class="dot" style="background:var(--pink)"></span>Speed: ${s}×`;
}

function forceAlert(l) { aLvl = l; log('MANUAL','warn',`Alert manually forced to L${l}`); upUI(); }

function exportJSON() {
  const data = {
    timestamp: new Date().toISOString(), alertLevel: aLvl, mlScores: ml,
    nodes: N.map(n => ({ id:n.id, status:n.st, battery:n.bat, tilt:n.tilt, vibration:n.vib, strain:n.str, moisture:n.moi, anomaly:n.anom })),
    gateways: GW.map(g => ({ id:g.id, status:g.st, internet:g.inet })),
    log: testLog.slice(-100)
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `SIH26025_test_${Date.now()}.json`; a.click();
  log('SYS','ok','Test results exported as JSON.');
}

/* ══════════════════════════════════════
   TEST RUNNER — with 20-second auto-padding
   ══════════════════════════════════════ */
const AMBIENT_MSGS = [
  ['NET','net','Sensor telemetry cycle. All active nodes reporting on schedule.'],
  ['GW','ok','Edge processing: feature vectors aggregated. Buffer flushed.'],
  ['ML','ml','ML inference cycle complete. Ensemble scores within baseline parameters.'],
  ['NET','net','AODV routing table refresh. Link quality metrics updated.'],
  ['GW','ok','SQLite WAL buffer: write-ahead log checkpoint complete.'],
  ['NET','net','LoRa channel scan: RSSI -92dBm avg. SNR 8.2dB. Normal range.'],
  ['GW','ok','Heartbeat check: all registered nodes responded within timeout.'],
  ['ML','ml','PINN Knothe residual calculation: within ±0.3σ. No anomaly.'],
  ['NET','net','Duty cycle monitor: 0.4% used (limit: 1.0%). Bandwidth headroom OK.'],
  ['GW','ok','System health: CPU 12%, RAM 340MB/4GB, Temp 48°C. All nominal.'],
  ['NET','net','Multi-hop latency check: E7→GW-E 2094ms (3 hops). Within spec.'],
  ['ML','ml','Feature extraction: Δtilt/Δt, FFT(vib), strain_rate computed for all nodes.'],
  ['GW','ok','Cloud sync heartbeat: last sync 45s ago. Connection stable.'],
  ['NET','net','AES-128 key rotation scheduled in 23:14:07. All nodes current.'],
  ['GW','ok','Solar panel status: 5 nodes solar-powered, avg charge rate 280mA.'],
];

let ambientIdx = 0;

function ambientTick() {
  // Spawn random packet animation
  const onNodes = N.filter(n => n.st !== 'offline');
  if (onNodes.length > 2) {
    const from = onNodes[~~(Math.random()*onNodes.length)];
    const gwIdx = from.id.startsWith('E') ? 0 : from.id.startsWith('W') ? 1 : 2;
    if (GW[gwIdx].st === 'online') spawn(from, GW[gwIdx], '#0891b2', 'DATA');
  }
  // Log ambient message
  const m = AMBIENT_MSGS[ambientIdx % AMBIENT_MSGS.length];
  ambientIdx++;
  log(m[0], m[1], m[2]);
}

function sched(st) {
  // Calculate total scenario duration
  let total = st.reduce((s, x) => s + (x.d || 1000), 0);
  const MIN_DURATION = 22000; // 22 seconds minimum

  if (total < MIN_DURATION) {
    // Distribute ambient steps evenly throughout the scenario
    const deficit = MIN_DURATION - total;
    const ambientCount = Math.ceil(deficit / 1400);
    const spacing = Math.max(1, Math.floor(st.length / (ambientCount + 1)));

    for (let i = 0; i < ambientCount; i++) {
      const pos = Math.min(st.length, (i+1) * spacing);
      st.splice(pos, 0, { d: 1400, a: ambientTick });
    }
  }

  startTimer();
  steps = st; si = 0; running = true; nxt();
}

function nxt() {
  if (!running || si >= steps.length) {
    running = false;
    stopTimer();
    return;
  }
  const s = steps[si++];
  s.a();
  upUI();
  rebuildLinks();
  setTimeout(nxt, (s.d || 1000) / simSpeed);
}

function sI(title, body) {
  document.getElementById('scInfo').innerHTML =
    `<div class="sc-title">${title}</div><div class="sc-body">${body}</div>`;
}

function runT(n) {
  if (running) { running = false; steps = []; stopTimer(); }
  resetState();
  resetTimer();
  document.querySelectorAll('.tbtn').forEach(b => b.classList.remove('active'));
  document.getElementById('tb'+n).classList.add('active');
  log('SYS','info', `━━━ Test #${n} initiated ━━━`);
  const tests = [, t1,t2,t3,t4,t5,t6,t7,t8,t9,t10,t11,t12,t13,t14,t15,t16,t17,t18,t19,t20,t21];
  if (tests[n]) tests[n]();
}

/* ══════════════════════════════════════
   RESET
   ══════════════════════════════════════ */
function resetState() {
  N.forEach(n => {
    n.st='online'; n.bat=80+~~(Math.random()*20);
    n.tilt=+(Math.random()*0.4+0.1).toFixed(2); n.vib=+(Math.random()*0.1+0.05).toFixed(2);
    n.str=+(Math.random()*0.02+0.005).toFixed(3); n.moi=+(Math.random()*10+32).toFixed(0);
    n.temp=+(Math.random()*5+28).toFixed(1); n.anom=false; n.drift=false;
  });
  GW.forEach(g => { g.st='online'; g.inet=true; });
  aLvl=0; ml={if:0.08,lstm:0.10,pinn:0.18,ens:0.12}; pph=51; lat=698;
  pkts=[]; running=false; steps=[];
  rebuildLinks(); upUI();
}

/* ══════════════════════════════════════
   TIMER
   ══════════════════════════════════════ */
function fmtTime(ms) {
  const totalSec = ms / 1000;
  const min = ~~(totalSec / 60);
  const sec = ~~(totalSec % 60);
  const dec = ~~((totalSec % 1) * 10);
  return `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${dec}`;
}

function startTimer() {
  timerStart = performance.now();
  const box = document.getElementById('timerBox');
  box.className = 'timer-display running';
  document.getElementById('timerIcon').textContent = '⏱️';
  document.getElementById('timerStatus').textContent = 'RUNNING';
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(updateTimer, 100);
}

function updateTimer() {
  const elapsed = performance.now() - timerStart;
  document.getElementById('timerVal').textContent = fmtTime(elapsed);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  const elapsed = performance.now() - timerStart;
  document.getElementById('timerVal').textContent = fmtTime(elapsed);
  const box = document.getElementById('timerBox');
  box.className = 'timer-display done';
  document.getElementById('timerIcon').textContent = '✅';
  document.getElementById('timerStatus').textContent = fmtTime(elapsed);
  log('SYS','ok', `Simulation completed in ${fmtTime(elapsed)}`);
}

function resetTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  document.getElementById('timerVal').textContent = '00:00.0';
  document.getElementById('timerBox').className = 'timer-display';
  document.getElementById('timerIcon').textContent = '⏱️';
  document.getElementById('timerStatus').textContent = 'READY';
}

function resetAll() {
  resetState(); clearLog(); testLog.length=0;
  resetTimer();
  document.querySelectorAll('.tbtn').forEach(b => b.classList.remove('active'));
  selNode=null; document.getElementById('ndPanel').classList.remove('show');
  sI('👋 Welcome — 20-Node Simulator',
    'Select a <strong>test scenario</strong> from the left panel.<br><br><strong>20 nodes</strong> across <strong>3 mine zones</strong> with <strong>3 gateways</strong>. Click nodes to inspect. Drag to reposition.');
  log('SYS','ok','System reset. 20/20 nodes online. Ready.');
}

/* ══════════════════════════════════════
   CONTINUOUS SENSOR SIMULATION
   ══════════════════════════════════════ */
function simSensors() {
  N.forEach(n => {
    if (n.st === 'offline') return;
    if (!n.anom && !n.drift && n.st !== 'critical') {
      n.tilt = Math.max(0, +(n.tilt + ((Math.random()-0.5)*0.02)).toFixed(2));
      n.vib  = Math.max(0, +(n.vib  + ((Math.random()-0.5)*0.005)).toFixed(2));
    }
    n.hist.push(+n.tilt);
    if (n.hist.length > 60) n.hist.shift();
  });
}

/* ══════════════════════════════════════
   ANIMATION LOOP
   ══════════════════════════════════════ */
let lt = performance.now();
function anim(t) {
  const dt = (t - lt) / 1000; lt = t; simT += dt;
  updPkts(dt);
  if (~~(simT*2)%2 === 0 && ~~((simT-dt)*2)%2 !== 0) simSensors();
  draw();
  requestAnimationFrame(anim);
}

/* ══════════════════════════════════════
   INIT
   ══════════════════════════════════════ */
resize(); upUI();
log('SYS','ok','20-Node Mine Subsidence Simulator initialized.');
log('SYS','info','Zones: East(7) + West(7) + North(6) = 20 nodes, 3 gateways');
log('SYS','info','ML: Isolation Forest + LSTM Autoencoder + PINN (Knothe physics loss)');
log('SYS','info','LoRa: 865MHz IN865 | AES-128 | AODV | Offline-first');
log('SYS','info','Click any node for live data. Drag to reposition. Select a test to begin.');
requestAnimationFrame(anim);
