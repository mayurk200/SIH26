/* ══════════════════════════════════════════════════════════════
   SIH26025 — All 21 Test Scenarios
   Each runs 20+ seconds with detailed step-by-step simulation
   ══════════════════════════════════════════════════════════════ */

/* ── Helper: spawn packets from a zone to its gateway ── */
function zonePulse(prefix, gwIdx, color, label) {
  N.filter(n => n.id.startsWith(prefix) && n.st !== 'offline').forEach(n => {
    spawn(n, GW[gwIdx], color || '#0891b2', label || 'DATA');
  });
}

/* ══════════════════════════════════════
   TESTS 1-5: Network & Communication
   ══════════════════════════════════════ */

function t1() {
  sI('✅ Test 1: Normal 20-Node Operation',
    'All <strong>20 ESP32+LoRa nodes</strong> across <strong>3 zones</strong> (East:7, West:7, North:6) communicating via <strong>AODV multi-hop</strong> to <strong>3 zone gateways</strong>.<br><br>' +
    'Each gateway aggregates its zone\'s data, runs <strong>edge ML inference</strong> (IF + LSTM + PINN), and syncs to cloud via 4G.<br><br>' +
    '<strong>Data flow:</strong> 50-byte feature vectors every 60s. SF10/BW125 @ 865 MHz. 1% duty cycle.');
  sched([
    {d:1000, a:() => log('NET','net','AODV: Routing tables initialized across all 3 zones. 20/20 nodes registered.')},
    {d:1200, a:() => log('NET','net','Zone topology: East(7 nodes, max 3 hops), West(7 nodes, max 3 hops), North(6 nodes, max 2 hops)')},
    {d:1000, a:() => { log('E1','ok','Tx: {tilt:0.31°, vib:0.09g, strain:0.018, moist:34%, temp:31.2°C} [50B]'); spawn(ni('E1'),ni('E2'),'#059669','DATA'); }},
    {d:800, a:() => { spawn(ni('E2'),ni('E3'),'#059669','DATA'); log('E2','ok','Relay E1→E3 + own payload appended.'); }},
    {d:800, a:() => { spawn(ni('E3'),GW[0],'#059669','DATA'); log('E3','ok','Delivering to GW-E: 3 payloads (E1+E2+E3).'); }},
    {d:1000, a:() => { ['E4','E5','E6','E7'].forEach(id => spawn(ni(id), ni('E5'), '#059669','DATA')); log('EAST','ok','E4→E5→GW-E, E6→E5→GW-E, E7→E6→E5→GW-E. All 7 East payloads received.'); }},
    {d:800, a:() => spawn(ni('E5'),GW[0],'#059669','DATA')},
    {d:1200, a:() => { zonePulse('W',1,'#3b82f6','DATA'); log('WEST','ok','All 7 West payloads aggregated at GW-W via multi-hop chains.'); }},
    {d:1000, a:() => { zonePulse('N',2,'#7c3aed','DATA'); log('NORTH','ok','All 6 North payloads aggregated at GW-N.'); }},
    {d:1200, a:() => log('GW','ok','GW-E: 7 payloads | GW-W: 7 payloads | GW-N: 6 payloads. Total: 20 feature vectors.')},
    {d:1000, a:() => log('ML','ml','Running edge inference on each gateway...')},
    {d:1200, a:() => log('ML','ml','GW-E → IF:0.07 LSTM:0.09 PINN:0.16 | GW-W → IF:0.09 LSTM:0.11 PINN:0.19 | GW-N → IF:0.06 LSTM:0.08 PINN:0.17')},
    {d:1000, a:() => log('ML','ml','Global ensemble average: 0.12 — TARP Level L0 (Normal). No action required.')},
    {d:1200, a:() => { GW.forEach(g => spawn(g,CLD,'#7c3aed','SYNC')); log('GW','ok','Cloud sync: 3 gateways → FastAPI backend. 20 records uploaded. ACK received.'); }},
    {d:1000, a:() => log('GW','ok','Model delta check: no retraining updates available. Current model version: v2.3.1')},
    {d:1200, a:() => log('SYS','ok','━━━ TEST 1 PASSED: 20-node normal operation across 3 zones verified ━━━')},
  ]);
}

function t2() {
  sI('📡 Test 2: AODV Multi-Hop Route Discovery',
    'Node <strong>E7</strong> (farthest in East panel) needs route to <strong>GW-East</strong>.<br>' +
    'Path discovered: E7 → E6 → E5 → GW-E (<strong>3 hops</strong>).<br><br>' +
    '1. E7 broadcasts <strong>RREQ</strong> {src:E7, dst:GW-E, seq:1}<br>' +
    '2. RREQ floods through East panel neighbors<br>' +
    '3. GW-E responds with <strong>RREP</strong> via reverse path<br>' +
    '4. Route cached with 30s lifetime<br><br>' +
    'Overhead: <strong>O(N_zone)</strong> broadcast per discovery. ~2094ms RTT for 3 hops.');
  sched([
    {d:1200, a:() => log('E7','net','Route table: no entry for GW-E. Initiating AODV RREQ...')},
    {d:1000, a:() => { log('E7','net','BROADCAST RREQ {src:E7, dst:GW-E, seq:1, hop_count:0, ttl:7}'); spawn(ni('E7'),ni('E6'),'#d97706','RREQ'); }},
    {d:1000, a:() => { log('E6','net','Received RREQ from E7. I am not destination. Incrementing hop_count to 1. Re-broadcasting...'); spawn(ni('E6'),ni('E5'),'#d97706','RREQ'); spawn(ni('E6'),ni('E4'),'#d97706','RREQ'); }},
    {d:1000, a:() => { log('E5','net','Received RREQ from E6 (hop:1). E5 has direct route to GW-E. Forwarding RREQ...'); spawn(ni('E5'),GW[0],'#d97706','RREQ'); }},
    {d:800, a:() => log('E4','net','Received RREQ from E6. Also forwarding to E5 (duplicate — discarded by E5 seq check).')},
    {d:1200, a:() => log('GW-E','net','RREQ received! seq:1, src:E7, hop_count:2. I AM the destination. Generating RREP...')},
    {d:1000, a:() => { log('GW-E','net','UNICAST RREP {src:GW-E, dst:E7, hop_count:3, lifetime:30s}'); spawn(GW[0],ni('E5'),'#059669','RREP'); }},
    {d:1000, a:() => { log('E5','net','RREP received from GW-E. Caching reverse route: E7 via E6. Forwarding...'); spawn(ni('E5'),ni('E6'),'#059669','RREP'); }},
    {d:1000, a:() => { log('E6','net','RREP received from E5. Route to GW-E: via E5 (2 hops). Forwarding to E7...'); spawn(ni('E6'),ni('E7'),'#059669','RREP'); }},
    {d:1200, a:() => { log('E7','ok','RREP received! Route ESTABLISHED: E7 → E6 → E5 → GW-E (3 hops)'); lat=2094; }},
    {d:1000, a:() => log('E7','ok','Route cached: {dst:GW-E, next_hop:E6, hop_count:3, lifetime:30s, seq:1}')},
    {d:1000, a:() => { log('E7','ok','Sending first data packet via established route...'); spawn(ni('E7'),ni('E6'),'#0891b2','DATA'); }},
    {d:800, a:() => spawn(ni('E6'),ni('E5'),'#0891b2','DATA')},
    {d:800, a:() => { spawn(ni('E5'),GW[0],'#0891b2','DATA'); log('GW-E','ok','Data from E7 received successfully (RTT: 2094ms).'); lat=698; }},
    {d:1200, a:() => log('SYS','ok','━━━ TEST 2 PASSED: 3-hop AODV route discovery and data delivery verified ━━━')},
  ]);
}

function t3() {
  sI('💥 Test 3: Single Node Failure + Re-route',
    '<strong>W3 goes offline</strong> (battery exhaustion).<br><br>' +
    '1. GW-W detects 5 missed heartbeats → marks W3 OFFLINE<br>' +
    '2. AODV <strong>RERR</strong> invalidates all routes through W3<br>' +
    '3. W2 discovers alternate: W2 → W4 → W5 → GW-W<br>' +
    '4. System continues with <strong>6/7 West nodes</strong><br><br>' +
    'Mitigation: Every node within LoRa range of ≥2 others.');
  sched([
    {d:1000, a:() => log('SYS','info','Simulating W3 battery exhaustion...')},
    {d:1200, a:() => log('GW-W','info','W3 heartbeat: missed #1 (timeout: 180s between expected check-ins)')},
    {d:1000, a:() => log('GW-W','info','W3 heartbeat: missed #2... missed #3...')},
    {d:1000, a:() => log('GW-W','warn','W3 heartbeat: missed #4... missed #5. Threshold reached.')},
    {d:1200, a:() => { ni('W3').st='offline'; ni('W3').bat=0; log('GW-W','err','W3 declared OFFLINE. Removing from active node list.'); }},
    {d:1000, a:() => log('NET','net','AODV RERR generated: {unreachable:[W3], affected_routes:[W2→W3→W5, W1→W2→W3]}')},
    {d:1000, a:() => log('W2','net','RERR received. Route W2→W3→W5 invalidated. Scanning alternatives...')},
    {d:1200, a:() => { log('W2','net','Cross-link available: W2→W4 (RSSI: -87dBm). Initiating RREQ to GW-W...'); spawn(ni('W2'),ni('W4'),'#d97706','RREQ'); }},
    {d:1000, a:() => { spawn(ni('W4'),ni('W5'),'#d97706','RREQ'); spawn(ni('W5'),GW[1],'#d97706','RREQ'); }},
    {d:1000, a:() => { spawn(GW[1],ni('W5'),'#059669','RREP'); spawn(ni('W5'),ni('W4'),'#059669','RREP'); }},
    {d:800, a:() => { spawn(ni('W4'),ni('W2'),'#059669','RREP'); log('W2','ok','New route: W2 → W4 → W5 → GW-W (3 hops). Cached.'); }},
    {d:1200, a:() => { spawn(ni('W2'),ni('W4'),'#0891b2','DATA'); log('W2','ok','Resuming data transmission via new route.'); }},
    {d:800, a:() => spawn(ni('W4'),ni('W5'),'#0891b2','DATA')},
    {d:800, a:() => { spawn(ni('W5'),GW[1],'#0891b2','DATA'); log('GW-W','ok','Data from W2 received via alternate route. 6/7 West nodes reporting.'); }},
    {d:1200, a:() => log('ALERT','warn','SMS → maintenance: "W3 offline since 18:05. Battery depletion suspected. Replace unit."')},
    {d:1000, a:() => log('GW-W','ok','Coverage assessment: 86% West panel covered. Gap: W3 immediate vicinity (~50m radius).')},
    {d:1200, a:() => log('SYS','ok','━━━ TEST 3 PASSED: Single node failure → AODV RERR + re-route in <8s ━━━')},
  ]);
}

function t4() {
  sI('🔌 Test 4: Zone Gateway Failure',
    '<strong>GW-North offline</strong> (power failure). 6 North-zone nodes lose primary gateway.<br><br>' +
    'Recovery: Cross-zone fallback via <strong>N3 → E6 → E5 → GW-East</strong>.<br>' +
    'GW-East accepts North traffic as fallback. All data reaches cloud via alternate path.<br><br>' +
    'This tests the inter-gateway resilience of the ad-hoc architecture.');
  sched([
    {d:1000, a:() => log('SYS','info','Simulating GW-North power failure...')},
    {d:1200, a:() => log('GW-N','warn','Power supply unstable: voltage dropping 5.1V → 4.6V → 3.8V...')},
    {d:1000, a:() => { GW[2].st='offline'; log('GW-N','err','GATEWAY OFFLINE — power supply failed. UPS exhausted.'); }},
    {d:1200, a:() => log('N3','err','Heartbeat to GW-N failed. Retry #1... TIMEOUT.')},
    {d:1000, a:() => log('N3','err','Retry #2... #3... TIMEOUT. GW-N declared unreachable.')},
    {d:1200, a:() => log('NET','err','North zone: 6 orphaned nodes. Scanning for cross-zone fallback routes...')},
    {d:1000, a:() => { log('N3','net','Cross-zone scan: Detected E6 (RSSI: -95dBm). Attempting RREQ...'); spawn(ni('N3'),ni('E6'),'#d97706','RREQ'); }},
    {d:1000, a:() => { spawn(ni('E6'),ni('E5'),'#d97706','RREQ'); log('E6','net','Forwarding N-zone RREQ toward GW-E...'); }},
    {d:800, a:() => { spawn(ni('E5'),GW[0],'#d97706','RREQ'); }},
    {d:1200, a:() => { log('GW-E','ok','Cross-zone RREQ from N3 (via E6→E5). Accepting as fallback. Generating RREP...'); spawn(GW[0],ni('E5'),'#059669','RREP'); }},
    {d:800, a:() => spawn(ni('E5'),ni('E6'),'#059669','RREP')},
    {d:800, a:() => { spawn(ni('E6'),ni('N3'),'#059669','RREP'); log('N3','ok','Fallback route established: N→E6→E5→GW-E (3 cross-zone hops)'); }},
    {d:1200, a:() => log('N3','ok','Broadcasting fallback route to all North-zone nodes: N1,N2,N4,N5,N6 relay via N3')},
    {d:1000, a:() => { zonePulse('N',0,'#7c3aed','DATA'); log('NORTH','ok','All 6 North nodes routing through N3→E6→E5→GW-E. Data flowing.'); }},
    {d:1000, a:() => { aLvl=1; log('ALERT','warn','TARP → L1: GW-N offline. Cross-zone fallback active. SMS → maintenance team.'); }},
    {d:1200, a:() => log('GW-E','ok','Load: now handling 13 nodes (7 East + 6 North). CPU: 34%. Within capacity.')},
    {d:1200, a:() => log('SYS','warn','━━━ TEST 4 RESULT: Gateway failure handled — cross-zone fallback route active ━━━')},
  ]);
}

function t5() {
  sI('📊 Test 5: LoRa Channel Saturation',
    '20 nodes switch to <strong>high-frequency Tx (15s interval)</strong> = 240 pkt/hr/node.<br>' +
    'Total: 20 × 240 = <strong>4800 pkt/hr</strong> across 3 IN865 channels.<br><br>' +
    '• Per-packet airtime: 698ms (SF10/BW125/50B)<br>' +
    '• 1% duty cycle → max 51 pkt/hr/node at SF10<br>' +
    '• <strong>Mitigation:</strong> Adaptive SF7 (airtime: 36ms, 19× faster) + 3-channel hopping');
  sched([
    {d:1000, a:() => { pph=240; log('SYS','info','All 20 nodes switching to anomaly-mode: 15s Tx interval.'); }},
    {d:1200, a:() => log('NET','warn','Channel 865.0625 MHz: load increasing. Concurrent Tx detected.')},
    {d:1000, a:() => { N.slice(0,7).forEach(n => spawn(n,GW[0],'#0891b2')); log('NET','warn','East zone: 7 simultaneous Tx. COLLISION on 865.0625 MHz!'); }},
    {d:1000, a:() => { N.slice(7,14).forEach(n => spawn(n,GW[1],'#3b82f6')); log('NET','warn','West zone: 7 simultaneous Tx. Collision rate rising.'); }},
    {d:1200, a:() => log('NET','err','Overall collision rate: 38%. Packet loss: E3,E5,W2,W6,N1,N4 packets lost.')},
    {d:1000, a:() => log('E3','warn','1% duty cycle EXHAUSTED. Cannot transmit for 35.3 seconds. Queuing packet (1/60).')},
    {d:1200, a:() => log('W2','warn','1% duty cycle EXHAUSTED. Queue: 2/60. Backoff timer started.')},
    {d:1000, a:() => log('GW','warn','Congestion detected across all 3 gateways. Activating ADAPTIVE SF...')},
    {d:1200, a:() => { lat=180; log('GW','ok','SF10 → SF7: airtime reduced 698ms → 36ms (19× improvement). More packets per duty cycle.'); }},
    {d:1000, a:() => log('GW','ok','Activating 3-channel hopping: 865.0625 / 865.4025 / 865.985 MHz. Load distributed.')},
    {d:1200, a:() => { pph=160; log('NET','ok','Collision rate: 38% → 6%. Packet delivery ratio recovering.'); }},
    {d:1000, a:() => log('GW','ok','Priority queue activated: anomaly-flagged packets get channel priority. Normal telemetry deferred.')},
    {d:1200, a:() => { zonePulse('E',0,'#059669','DATA'); zonePulse('W',1,'#3b82f6','DATA'); log('NET','ok','All zones receiving. Throughput stabilized at ~160 pkt/hr/node effective.'); }},
    {d:1000, a:() => { pph=51; lat=698; log('GW','ok','Anomaly mode ended. Returning to normal 60s interval. SF10 restored.'); }},
    {d:1200, a:() => log('SYS','ok','━━━ TEST 5 PASSED: 20-node saturation handled — adaptive SF + channel hopping ━━━')},
  ]);
}

/* ══════════════════════════════════════
   TESTS 6-9: AI/ML Pipeline
   ══════════════════════════════════════ */

function t6() {
  sI('👁️ Test 6: L1 Watch — Single Anomaly',
    '<strong>E4 tilt exceeds 2σ</strong> for >5 minutes. Edge ESP32 Z-score flags anomaly.<br><br>' +
    '1. E4 edge: Z-score(tilt) = <strong>2.9</strong> (threshold: 2.0)<br>' +
    '2. Anomaly flag appended to LoRa payload → priority Tx<br>' +
    '3. GW-E runs <strong>Isolation Forest</strong>: score = 0.45<br>' +
    '4. TARP → <strong>L1 Watch</strong>: yellow dashboard + SMS');
  sched([
    {d:1200, a:() => log('E4','info','IMU reading cycle: tilt=0.8° (baseline=0.4°). Elevated but within 2σ.')},
    {d:1000, a:() => { ni('E4').tilt=1.2; log('E4','info','Tilt increasing: 0.8° → 1.2°. Z-score: 1.6. Still below threshold.'); }},
    {d:1200, a:() => { ni('E4').tilt=1.8; log('E4','warn','Tilt: 1.8°. Z-score: 2.3. Exceeds 2σ threshold! Timer started (5 min).'); }},
    {d:1200, a:() => log('E4','warn','Sustained anomaly: 2 minutes. Z-score holding at 2.5. Tilt: 1.9°.')},
    {d:1200, a:() => log('E4','warn','Sustained anomaly: 4 minutes. Z-score: 2.7. Tilt: 2.1°. Accelerating.')},
    {d:1200, a:() => { ni('E4').tilt=2.3; ni('E4').anom=true; log('E4','err','5-minute threshold reached! Z-score: 2.9. ANOMALY FLAG SET on ESP32.'); }},
    {d:1000, a:() => { log('E4','warn','Switching to high-frequency Tx (15s interval). Anomaly flag in payload.'); spawn(ni('E4'),ni('E3'),'#d97706','ALERT'); }},
    {d:800, a:() => { spawn(ni('E3'),GW[0],'#d97706','ALERT'); log('GW-E','warn','Anomaly-flagged packet received from E4. Running Isolation Forest...'); }},
    {d:1200, a:() => { ml.if=0.45; log('ML','ml','Isolation Forest: anomaly_score = 0.45 (threshold: 0.30) — ANOMALOUS'); }},
    {d:1000, a:() => { ml.lstm=0.22; log('ML','ml','LSTM Autoencoder: reconstruction_error = 0.22 (threshold: 0.35) — within normal range'); }},
    {d:1000, a:() => { ml.pinn=0.19; log('ML','ml','PINN: severity = 0.19. Knothe residual: +0.4σ — not significant.'); }},
    {d:1200, a:() => { ml.ens=0.29; log('ML','ml','Ensemble voting: 1/3 models flag anomaly. Score: 0.29. Single-node event.'); }},
    {d:1000, a:() => { aLvl=1; log('ALERT','warn','TARP → L1 WATCH: E4 tilt anomaly. SMS → monitoring cell.'); }},
    {d:1200, a:() => log('DASH','warn','Dashboard update: E4 marker → YELLOW. Time-series graph highlighted.')},
    {d:1200, a:() => log('SYS','ok','━━━ TEST 6 PASSED: L1 Watch triggered correctly on single-node 5-min sustained anomaly ━━━')},
  ]);
}

function t7() {
  sI('⚠️ Test 7: L2 Warning — Spatial Cluster',
    '<strong>E4 + E5 + E6</strong> (3 adjacent nodes) all anomalous in East panel.<br><br>' +
    '• Spatial correlation coefficient: <strong>0.91</strong><br>' +
    '• LSTM Autoencoder: recon_error = <strong>0.64</strong> (above 0.35)<br>' +
    '• Ensemble: <strong>2/3 models agree</strong> → L2 confirmed<br>' +
    '• <strong>Siren ON</strong> + SMS to mine manager + dashboard orange');
  sched([
    {d:1000, a:() => { ni('E4').tilt=2.1; ni('E4').anom=true; log('E4','warn','Tilt: 2.1° | Z-score: 2.8 | ANOMALY FLAG'); }},
    {d:1000, a:() => { ni('E5').tilt=2.4; ni('E5').anom=true; log('E5','warn','Tilt: 2.4° | Z-score: 3.1 | ANOMALY FLAG — adjacent to E4!'); }},
    {d:1000, a:() => { ni('E6').tilt=1.9; ni('E6').anom=true; log('E6','warn','Tilt: 1.9° | Z-score: 2.4 | ANOMALY FLAG — 3-node cluster forming.'); }},
    {d:1200, a:() => { ['E4','E5','E6'].forEach(id => spawn(ni(id),GW[0],'#d97706','ALERT')); log('GW-E','warn','3 anomaly-flagged packets received. Running spatial analysis...'); }},
    {d:1200, a:() => log('ML','ml','Spatial gradient analysis: Δtilt/Δdistance between E4-E5: 0.15°/50m. E5-E6: 0.25°/50m.')},
    {d:1000, a:() => log('ML','ml','Pearson correlation coefficient (tilt vectors): 0.91 — HIGHLY CORRELATED movement.')},
    {d:1200, a:() => { ml.if=0.58; log('ML','ml','Isolation Forest: multi-variate anomaly_score = 0.58 (>0.30) — ANOMALOUS ⚠️'); }},
    {d:1000, a:() => { ml.lstm=0.64; log('ML','ml','LSTM Autoencoder: recon_error = 0.64 (>0.35) — temporal pattern ABNORMAL ⚠️'); }},
    {d:1000, a:() => { ml.pinn=0.42; log('ML','ml','PINN: severity = 0.42. Knothe residual: +0.8σ — elevated but below critical.'); }},
    {d:1200, a:() => { ml.ens=0.55; log('ML','ml','Ensemble voting: 2/3 models agree (IF + LSTM). Score: 0.55. L2 threshold MET.'); }},
    {d:1000, a:() => { aLvl=2; log('ALERT','err','TARP → L2 WARNING: Multi-node spatial cluster. Gateway siren ACTIVATED.'); }},
    {d:1200, a:() => log('ALERT','err','SMS → mine manager: "L2 WARNING — East panel E4/E5/E6 zone. Differential settlement detected. Inspect immediately."')},
    {d:1000, a:() => log('DASH','warn','Dashboard: E4/E5/E6 markers → ORANGE. Subsidence contour heatmap rendered.')},
    {d:1200, a:() => { spawn(GW[0],CLD,'#7c3aed','SYNC'); log('GW','ok','Syncing L2 alert + sensor data to cloud for archival and DGMS reporting.'); }},
    {d:1200, a:() => log('SYS','warn','━━━ TEST 7 RESULT: L2 Warning — 3-node spatial cluster confirmed by ensemble ━━━')},
  ]);
}

function t8() {
  sI('🚨 Test 8: L3 Critical — Evacuation',
    '<strong>All 3 ML models unanimous</strong> — subsidence onset &lt;18 hours.<br><br>' +
    '• PINN severity: <strong>0.91</strong> | days_to_critical: <strong>0.75</strong><br>' +
    '• LSTM recon_error: <strong>0.81</strong> | accelerating temporal pattern<br>' +
    '• Isolation Forest: <strong>0.85</strong> | multi-variate extreme outlier<br>' +
    '• Knothe residual: <strong>+1.6σ</strong> — 60% faster than model prediction<br><br>' +
    '<strong>Actions:</strong> Evacuation siren + SMS + CALL to DGMS');
  sched([
    {d:1000, a:() => { ni('E3').tilt=2.2; ni('E3').anom=true; log('E3','warn','Tilt: 2.2° and accelerating. Δtilt/Δt = 0.4°/hr.'); }},
    {d:1000, a:() => { ni('E4').tilt=3.8; ni('E4').anom=true; ni('E4').st='critical'; log('E4','err','CRITICAL: Tilt=3.8° | Δtilt/Δt=0.7°/hr | Strain: 0.12 (6× baseline)'); }},
    {d:1000, a:() => { ni('E5').tilt=4.5; ni('E5').anom=true; ni('E5').st='critical'; log('E5','err','CRITICAL: Tilt=4.5° | Δtilt/Δt=0.9°/hr | MAXIMUM tilt rate in dataset'); }},
    {d:1000, a:() => { ni('E6').tilt=3.1; ni('E6').anom=true; ni('E6').st='critical'; log('E6','err','CRITICAL: Tilt=3.1° | Vibration spike: 0.85g (10× baseline)'); }},
    {d:1200, a:() => { ['E3','E4','E5','E6'].forEach(id => spawn(ni(id),GW[0],'#dc2626','CRIT')); log('GW-E','err','4 CRITICAL packets received. Emergency ML inference...'); }},
    {d:1200, a:() => { ml.if=0.85; log('ML','ml','Isolation Forest: 0.85 🔴 — multi-variate extreme outlier. All features anomalous.'); }},
    {d:1200, a:() => { ml.lstm=0.81; log('ML','ml','LSTM Autoencoder: 0.81 🔴 — accelerating temporal pattern. Rate-of-change increasing exponentially.'); }},
    {d:1200, a:() => { ml.pinn=0.91; log('ML','ml','PINN severity: 0.91 🔴 — Knothe physics model: days_to_critical = 0.75 (~18 hours)'); }},
    {d:1000, a:() => log('ML','ml','Knothe residual analysis: +1.6σ — subsidence progressing 60% FASTER than Budryk-Knothe prediction.')},
    {d:1000, a:() => { ml.ens=0.86; log('ML','ml','Ensemble: UNANIMOUS 3/3. Confidence: 0.96. Score: 0.86. L3 TRIGGERED.'); }},
    {d:1200, a:() => { aLvl=3; log('ALERT','err','🚨 TARP → L3 CRITICAL: EVACUATION RECOMMENDED. Siren ON at all 3 gateways.'); }},
    {d:1000, a:() => log('ALERT','err','Twilio SMS → Mine Manager: "L3 CRITICAL — East panel E3-E6. Subsidence onset <18h. EVACUATE."')},
    {d:1000, a:() => log('ALERT','err','Twilio VOICE CALL → DGMS Emergency Hotline: "Automated alert — Mine ID: JH-127, East Panel"')},
    {d:1200, a:() => { spawn(GW[0],CLD,'#dc2626','EMRG'); log('GW','err','Emergency sync to cloud: full sensor dump + ML scores + alert timestamp.'); }},
    {d:1000, a:() => log('DASH','err','Dashboard: E3-E6 → RED. Evacuation overlay active. Contour map: predicted subsidence bowl.')},
    {d:1200, a:() => log('SYS','err','━━━ TEST 8 RESULT: L3 Critical — ALL evacuation protocols triggered. System performed as designed. ━━━')},
  ]);
}

function t9() {
  sI('🛡️ Test 9: False Positive Rejection',
    '<strong>Isolation Forest flags anomaly</strong>, but LSTM + PINN disagree → ensemble <strong>rejects</strong>.<br><br>' +
    'Scenario: Seasonal soil thermal expansion causes slow tilt drift on W5 over 6 hours.<br>' +
    '• IF: <strong>0.44</strong> ⚠️ | LSTM: <strong>0.16</strong> ✓ | PINN: <strong>0.13</strong> ✓<br>' +
    '• Ensemble: 1/3 agree → <strong>REJECTED</strong>. L0 maintained. Logged for retraining.');
  sched([
    {d:1200, a:() => { ni('W5').tilt=0.5; log('W5','info','Hour 0: Ambient temp rising (28°C → 38°C). Soil thermal expansion beginning.'); }},
    {d:1200, a:() => { ni('W5').tilt=0.65; log('W5','info','Hour 2: Tilt: 0.4° → 0.65°. Slow monotonic increase. No vibration/strain change.'); }},
    {d:1200, a:() => { ni('W5').tilt=0.82; log('W5','info','Hour 4: Tilt: 0.82°. Rate: 0.07°/hr (very slow). Temperature: 40°C.'); }},
    {d:1200, a:() => { ni('W5').tilt=0.95; log('W5','info','Hour 6: Tilt: 0.95°. Z-score reaching 1.9. Close to threshold.'); }},
    {d:1000, a:() => { spawn(ni('W5'),GW[1],'#3b82f6','DATA'); log('GW-W','info','W5 data showing gradual drift. Running ML ensemble check...'); }},
    {d:1200, a:() => { ml.if=0.44; log('ML','ml','Isolation Forest: score=0.44 — FLAGS ANOMALY (above 0.30 threshold). Single-feature outlier.'); }},
    {d:1200, a:() => { ml.lstm=0.16; log('ML','ml','LSTM Autoencoder: recon_error=0.16 — NORMAL. Temporal profile is smooth, no acceleration, no spikes.'); }},
    {d:1200, a:() => { ml.pinn=0.13; log('ML','ml','PINN: severity=0.13 — NORMAL. Knothe residual within ±0.3σ. Consistent with thermal effects, not subsidence.'); }},
    {d:1200, a:() => { ml.ens=0.24; log('ML','ml','Ensemble voting: 1/3 models flag (IF only). Minimum 2/3 required for alert. → REJECTED.'); }},
    {d:1000, a:() => log('ALERT','ok','False positive SUPPRESSED. TARP remains L0. No SMS, no siren, no dashboard change.')},
    {d:1200, a:() => log('ML','ml','Logging IF false-positive for next retraining cycle. Feature added: seasonal_thermal_flag, ambient_temp.')},
    {d:1000, a:() => { ni('W5').tilt=0.4; ml={if:0.08,lstm:0.10,pinn:0.18,ens:0.12}; log('W5','ok','Evening cooling: tilt returning to baseline (0.4°). Drift self-resolved.'); }},
    {d:1200, a:() => log('SYS','ok','━━━ TEST 9 PASSED: False positive correctly rejected. Ensemble voting prevented unnecessary alert. ━━━')},
  ]);
}

/* ══════════════════════════════════════
   TESTS 10-13: Hardware & Environment
   ══════════════════════════════════════ */

function t10() {
  sI('🌡️ Test 10: Sensor Drift + Auto-Zero',
    '<strong>MPU6050 on W5</strong> exhibits temperature-dependent bias drift (±0.5–2 mg/°C).<br><br>' +
    '• W5 reads 1.9° while all neighbors < 0.5°<br>' +
    '• <strong>Cross-node consensus</strong>: W5 deviates >3σ from cluster mean<br>' +
    '• No strain/vibration correlation → DRIFT diagnosis<br>' +
    '• <strong>Auto-zero</strong>: rest state → 1000 readings → offset subtraction');
  sched([
    {d:1000, a:() => log('W5','info','Ambient temperature: 42°C (peak afternoon). MPU6050 internal temp sensor confirms.')},
    {d:1200, a:() => { ni('W5').tilt=1.2; log('W5','info','Tilt reading drifting: 0.4° → 0.8° → 1.2° over 2 hours. Temperature-correlated.'); }},
    {d:1200, a:() => { ni('W5').tilt=1.9; ni('W5').drift=true; log('W5','warn','Tilt: 1.9° — ANOMALOUS reading. But strain: 0.018 (normal), vibration: 0.09g (normal).'); }},
    {d:1000, a:() => { spawn(ni('W5'),GW[1],'#ea580c','DATA'); log('GW-W','info','W5 data received. Tilt seems anomalous. Running cross-node consensus...'); }},
    {d:1200, a:() => log('GW-W','info','Cross-node readings: W1=0.35°, W2=0.42°, W3=0.28°, W4=0.39°, W6=0.31°, W7=0.44°')},
    {d:1000, a:() => log('GW-W','info','Cluster mean: 0.37° | Cluster σ: 0.06° | W5 deviation: 1.53° = 25.5σ')},
    {d:1200, a:() => log('GW-W','warn','Deviation >3σ with NO correlated strain or vibration → Diagnosis: SENSOR DRIFT (not subsidence)')},
    {d:1000, a:() => log('W5','warn','Auto-zero calibration command received from gateway.')},
    {d:1200, a:() => log('W5','info','Entering rest state. Motor/vibration sources off. Averaging 1000 IMU readings...')},
    {d:1500, a:() => log('W5','info','100/1000... 300/1000... 600/1000... 900/1000... 1000/1000 readings collected.')},
    {d:1200, a:() => log('W5','info','Calculated offset: +1.53° bias (thermal drift coefficient: 0.036°/°C)')},
    {d:1000, a:() => { ni('W5').tilt=0.37; ni('W5').drift=false; log('W5','ok','Offset applied: -1.53°. New reading: 0.37° (matches cluster mean). CALIBRATED.'); }},
    {d:1200, a:() => log('GW-W','ok','W5 readings now consistent with cluster. Drift event logged. Recal scheduled at T+6h.')},
    {d:1200, a:() => log('SYS','ok','━━━ TEST 10 PASSED: Sensor drift detected via cross-node consensus, auto-zero applied ━━━')},
  ]);
}

function t11() {
  sI('🔋 Test 11: Battery Low / Solar Cycle',
    '<strong>N3 battery drops to 12%</strong> — adaptive power management activates.<br><br>' +
    '• Deep sleep: 60s → 300s (5-minute polling)<br>' +
    '• LoRa Tx power: 20 dBm → 14 dBm (range -40%)<br>' +
    '• Non-essential sensors OFF (moisture, GPS)<br>' +
    '• ESP32 deep sleep: ~10μA between readings<br>' +
    '• TP4056 + 18650 solar recharge recovery');
  sched([
    {d:1000, a:() => { ni('N3').bat=18; log('N3','info','Battery check: 18% (3.42V). Approaching LOW threshold (20%).'); }},
    {d:1200, a:() => { ni('N3').bat=15; log('N3','warn','Battery: 15% (3.35V). LOW POWER THRESHOLD reached.'); }},
    {d:1000, a:() => log('N3','warn','Power management level 1: polling interval 60s → 120s.')},
    {d:1200, a:() => { ni('N3').bat=12; log('N3','warn','Battery: 12% (3.28V). Power management level 2 activated.'); }},
    {d:1000, a:() => log('N3','info','Polling: 120s → 300s. LoRa Tx: 20dBm → 14dBm. Reduced range ~40%.')},
    {d:1200, a:() => log('N3','info','Disabling: soil moisture sensor OFF. GPS module OFF. Only IMU + strain gauge active.')},
    {d:1000, a:() => log('N3','info','ESP32 entering extended deep sleep (10μA). Next wake: +300 seconds.')},
    {d:1500, a:() => { ni('N3').bat=10; log('N3','warn','Wake cycle #1: battery=10% (3.22V). Solar panel output: 0.4W (overcast).'); }},
    {d:1200, a:() => { spawn(ni('N3'),ni('N2'),'#7c3aed','DATA'); log('N3','info','Transmitting compressed payload (28B instead of 50B). Returning to deep sleep.'); }},
    {d:1500, a:() => { ni('N3').bat=8; log('N3','warn','Wake cycle #2: battery=8% (3.18V). Critical. Solar: 0.6W (partial cloud break).'); }},
    {d:1200, a:() => log('ALERT','warn','SMS → maintenance: "N3 battery critical (8%). Solar insufficient. Replace 18650 cell if no sun within 4h."')},
    {d:1500, a:() => { ni('N3').bat=14; log('N3','info','Wake cycle #3: battery=14% (3.32V). Sun exposure! TP4056 charging at 280mA.'); }},
    {d:1200, a:() => { ni('N3').bat=22; log('N3','ok','Wake cycle #4: battery=22% (3.52V). Recovering. Restoring normal polling (120s).'); }},
    {d:1000, a:() => { ni('N3').bat=28; log('N3','ok','Battery rising: 28%. Estimated full charge: ~4 hours in current sunlight.'); }},
    {d:1200, a:() => log('SYS','ok','━━━ TEST 11 PASSED: Adaptive power management + solar recovery demonstrated ━━━')},
  ]);
}

function t12() {
  sI('📴 Test 12: Internet Loss — Offline Mode',
    '<strong>All 3 gateways lose 4G</strong> simultaneously (tower outage).<br><br>' +
    '• SQLite WAL buffers activated on all gateways<br>' +
    '• <strong>All L0–L3 alerts FULLY OPERATIONAL offline</strong><br>' +
    '• Buffer: <strong>30,240 records</strong> (7-day, 3 gateways)<br>' +
    '• Retry sync every 5 minutes<br>' +
    '• On reconnection: gzipped <strong>bulk sync</strong>');
  sched([
    {d:1000, a:() => log('GW','info','4G signal check: GW-E: -98dBm, GW-W: -105dBm, GW-N: -110dBm — all weakening.')},
    {d:1200, a:() => log('GW','warn','4G signal degrading rapidly: -105dBm → -115dBm → -120dBm... Handover failing.')},
    {d:1000, a:() => { GW.forEach(g => g.inet=false); log('NET','err','ALL 3 GATEWAYS: 4G DISCONNECTED. Likely cell tower outage.'); }},
    {d:1200, a:() => log('GW-E','ok','OFFLINE MODE activated. SQLite WAL buffer: open. Max capacity: 10,080 records.')},
    {d:1000, a:() => log('GW-W','ok','OFFLINE MODE activated. SQLite WAL buffer: open.')},
    {d:1000, a:() => log('GW-N','ok','OFFLINE MODE activated. SQLite WAL buffer: open.')},
    {d:1200, a:() => log('GW','ok','Edge ML models remain loaded in memory. Inference continues on-device.')},
    {d:1000, a:() => log('ALERT','ok','CRITICAL: Alert pipeline FULLY OPERATIONAL offline. L0-L3 decisions on gateway. ZERO cloud dependency.')},
    {d:1200, a:() => { zonePulse('E',0,'#059669','DATA'); zonePulse('W',1,'#3b82f6','DATA'); log('GW','ok','Sensor data flowing normally. All 20 nodes reporting. Buffering locally.'); }},
    {d:1200, a:() => log('GW','warn','4G retry #1: Scanning... No signal. Next retry: 5 minutes.')},
    {d:1200, a:() => log('GW','warn','4G retry #2: Scanning... Faint signal -118dBm. Connection failed.')},
    {d:1200, a:() => log('GW','info','Buffer status: GW-E: 340 rows | GW-W: 335 rows | GW-N: 320 rows.')},
    {d:1200, a:() => { log('GW','info','4G retry #3: Scanning... Signal recovering -95dBm. Attempting connection...'); }},
    {d:1200, a:() => { GW.forEach(g => g.inet=true); log('NET','ok','4G RESTORED on all 3 gateways! Signal: -82dBm. Initiating bulk sync...'); }},
    {d:1000, a:() => { GW.forEach(g => spawn(g,CLD,'#7c3aed','BULK')); log('GW','ok','Bulk sync: 995 records from 3 gateways (gzipped JSON, ~148KB). Uploading...'); }},
    {d:1200, a:() => log('GW','ok','Cloud ACK received. All buffers cleared. Model delta v2.3.2 downloaded + applied.')},
    {d:1200, a:() => log('SYS','ok','━━━ TEST 12 PASSED: Offline-first architecture verified — zero data loss, alerts continued ━━━')},
  ]);
}

function t13() {
  sI('🔒 Test 13: Data Tampering Blocked',
    'An <strong>unauthorized LoRa module</strong> injects a spoofed packet on 865 MHz.<br><br>' +
    '• Fake packet claims to be E2 with critical tilt readings<br>' +
    '• Layer 1: <strong>AES-128-CBC</strong> — decryption fails (wrong key)<br>' +
    '• Layer 2: <strong>HMAC-SHA256</strong> — signature mismatch<br>' +
    '• Layer 3: <strong>Monotonic sequence #</strong> — out of order<br>' +
    '• Packet <strong>DROPPED</strong>. No false alert. Incident logged.');
  sched([
    {d:1200, a:() => log('NET','info','Normal traffic on 865.0625 MHz. All packets authenticated.')},
    {d:1200, a:() => log('NET','warn','⚡ Anomalous LoRa transmission detected: unusual preamble pattern, non-standard sync word.')},
    {d:1000, a:() => { spawn({x:GW[0].x-70,y:GW[0].y+50},GW[0],'#dc2626','SPOOF'); log('NET','err','Incoming packet: header claims src=E2, payload={tilt:9.2°, flag:CRITICAL, strain:0.95}'); }},
    {d:1200, a:() => log('SEC','sec','Validation Layer 1: AES-128-CBC decryption attempt...')},
    {d:1200, a:() => log('SEC','sec','AES-128-CBC: DECRYPTION FAILED. Ciphertext does not match pre-shared key for node E2.')},
    {d:1200, a:() => log('SEC','sec','Validation Layer 2: HMAC-SHA256 verification...')},
    {d:1000, a:() => log('SEC','sec','HMAC-SHA256: SIGNATURE MISMATCH. MAC tag does not correspond to any registered node key.')},
    {d:1200, a:() => log('SEC','sec','Validation Layer 3: Sequence number check...')},
    {d:1000, a:() => log('SEC','sec','Sequence: received seq=0. Expected seq ≥ 3847 for E2. REPLAY or SPOOF confirmed.')},
    {d:1200, a:() => log('SEC','err','VERDICT: PACKET DROPPED. All 3 validation layers rejected. Not a legitimate node.')},
    {d:1000, a:() => log('ALERT','warn','Security incident logged: unauthorized_lora_tx. SMS → network admin.')},
    {d:1200, a:() => log('GW-E','ok','System integrity verified. Real E2 data from last cycle: tilt=0.42° (normal). No false alert.')},
    {d:1200, a:() => log('SYS','ok','━━━ TEST 13 PASSED: Spoofed packet rejected at all 3 layers — AES + HMAC + seq ━━━')},
  ]);
}

/* ══════════════════════════════════════
   TESTS 14-20: Real-Life Incident Simulations
   ══════════════════════════════════════ */

function t14() {
  sI('🏚️ Test 14: Jharia Monsoon Subsidence (Real-Life)',
    '<em>Simulating Sep 2026 Jharia event</em>: Monsoon rain saturates soil above century-old mine voids. Progressive subsidence over <strong>48 hours</strong>.<br><br>' +
    '<strong>If our system was deployed:</strong><br>' +
    '• L1 at hour 6 (moisture spike + slight tilt)<br>' +
    '• L2 at hour 18 (multi-node correlation)<br>' +
    '• L3 at hour 30 (PINN: collapse &lt;18h)<br>' +
    '• <strong>18+ hours warning before actual collapse</strong>');
  sched([
    {d:1000, a:() => log('SYS','info','═══ REAL-LIFE SIMULATION: Jharia Monsoon Subsidence (September 2026) ═══')},
    {d:1200, a:() => log('ENV','info','Hour 0: Heavy monsoon rainfall begins. Intensity: 85mm/hr. Dhanbad district.')},
    {d:1200, a:() => { ['E3','E4','E5'].forEach(id => { ni(id).moi=55; }); log('E3','info','Hour 2: Moisture sensors rising: 35% → 55%. Soil absorbing rainwater above old voids.'); }},
    {d:1200, a:() => { ['E3','E4','E5'].forEach(id => { ni(id).moi=72; }); log('E4','info','Hour 4: Moisture: 72%. Approaching saturation. Historical void depth: 15-25m below surface.'); }},
    {d:1200, a:() => { ni('E4').tilt=0.6; log('E4','info','Hour 6: Subtle tilt change: 0.3° → 0.6°. Z-score: 1.2 (below threshold, but trending up).'); }},
    {d:1200, a:() => { ni('E4').tilt=0.9; ['E3','E4','E5'].forEach(id => { ni(id).moi=85; }); log('ML','ml','Hour 8: Moisture-weighted instability index rising. Knothe residual: +0.3σ. Not yet anomalous.'); }},
    {d:1200, a:() => { ni('E4').tilt=1.4; ni('E4').anom=true; ml.if=0.38; log('E4','warn','Hour 9: Tilt: 1.4°. Z-score: 2.3 > threshold. ANOMALY FLAG set.'); }},
    {d:1000, a:() => { spawn(ni('E4'),GW[0],'#d97706','ALERT'); ml.ens=0.28; }},
    {d:1200, a:() => { aLvl=1; log('ALERT','warn','Hour 9: TARP → L1 WATCH. "E4 zone — elevated tilt + high soil moisture (85%). Monitor closely."'); }},
    {d:1200, a:() => { ni('E3').tilt=1.0; ni('E5').tilt=0.8; log('EAST','info','Hour 12: Adjacent nodes developing tilt: E3=1.0°, E5=0.8°. Spread beginning.'); }},
    {d:1200, a:() => { ni('E3').tilt=1.5; ni('E3').anom=true; ni('E5').tilt=1.1; ni('E5').anom=true; ni('E4').tilt=2.0; log('EAST','warn','Hour 15: E3(1.5°), E4(2.0°), E5(1.1°) — 3 adjacent nodes anomalous!'); }},
    {d:1000, a:() => { ['E3','E4','E5'].forEach(id => spawn(ni(id),GW[0],'#d97706','ALERT')); }},
    {d:1200, a:() => { ml.if=0.62; ml.lstm=0.58; ml.ens=0.52; log('ML','ml','Hour 18: Spatial correlation=0.89. LSTM confirms temporal acceleration. Ensemble: 0.52.'); }},
    {d:1200, a:() => { aLvl=2; log('ALERT','err','Hour 18: TARP → L2 WARNING. Siren ON. SMS → mine manager: "Multi-node subsidence in East panel."'); }},
    {d:1200, a:() => { ni('E4').tilt=3.2; ni('E4').st='critical'; ni('E3').tilt=2.5; ni('E5').tilt=2.0; log('EAST','err','Hour 24: Accelerating! E4: 3.2° (Δ=0.5°/hr). Ground cracking audible at surface.'); }},
    {d:1200, a:() => { ml.pinn=0.85; ml.ens=0.78; log('ML','ml','Hour 28: PINN severity: 0.85. Days-to-critical: 0.9. Knothe residual: +1.2σ.'); }},
    {d:1200, a:() => { ['E3','E4','E5'].forEach(id => { ni(id).st='critical'; }); ni('E4').tilt=4.8; ml.pinn=0.92; ml.ens=0.85; log('ML','ml','Hour 30: PINN: 0.92. Onset <18h. Knothe residual: +1.6σ. ALL 3 models unanimous.'); }},
    {d:1200, a:() => { aLvl=3; log('ALERT','err','🚨 Hour 30: TARP → L3 CRITICAL. EVACUATION ORDER. DGMS notified. All sirens.'); }},
    {d:1200, a:() => log('ENV','err','Hour 48: Ground collapse occurs at predicted location. (Actual: 45+ collapses in Dhanbad district, 2026)')},
    {d:1200, a:() => log('SYS','ok','━━━ RESULT: System would have provided 18+ HOURS advance warning ━━━')},
    {d:1200, a:() => log('SYS','ok','━━━ vs actual outcome: ZERO warning, reactive rescue operations only ━━━')},
  ]);
}

function t15() {
  sI('⛏️ Test 15: Keshalpur Tunnel Collapse (Sep 13, 2026)',
    '<em>3 deaths in illegal mining tunnel collapse, Katras, Dhanbad.</em><br><br>' +
    '<strong>If our system was deployed:</strong><br>' +
    '• Hour -12: Vibration anomaly from unauthorized digging<br>' +
    '• Hour -8: L1 Watch (unusual continuous vibration pattern)<br>' +
    '• Hour -3: Strain gauge spike (void roof weakening)<br>' +
    '• Hour -2: L2 Warning → <strong>evacuation possible</strong><br>' +
    '• <strong>2 hours to evacuate = 3 lives saved</strong>');
  sched([
    {d:1000, a:() => log('SYS','info','═══ REAL-LIFE: Keshalpur Tunnel Collapse (Sep 13, 2026 — 3 deaths) ═══')},
    {d:1200, a:() => log('SYS','info','Context: Illegal rat-hole mining creating unauthorized void beneath residential area.')},
    {d:1200, a:() => { ni('W2').vib=0.28; log('W2','info','Hour -12: Unusual vibration: 0.05g → 0.28g. Continuous low-frequency pattern (not blasting).'); }},
    {d:1200, a:() => { ni('W2').vib=0.45; log('W2','info','Hour -10: Vibration increasing: 0.45g. Rhythmic pattern consistent with manual excavation.'); }},
    {d:1200, a:() => { ni('W2').vib=0.6; ni('W2').anom=true; log('W2','warn','Hour -8: Vibration: 0.6g (12× baseline). Z-score: 4.2. ANOMALY FLAG.'); }},
    {d:1000, a:() => { ml.if=0.42; aLvl=1; spawn(ni('W2'),GW[1],'#d97706','ALERT'); }},
    {d:1200, a:() => log('ALERT','warn','Hour -8: L1 WATCH. "W2 zone — continuous vibration anomaly. Possible unauthorized excavation activity."')},
    {d:1200, a:() => log('ML','ml','Hour -6: Vibration FFT analysis: dominant frequency 2-5 Hz (manual digging signature, not machinery or blasting).')},
    {d:1200, a:() => { ni('W2').str=0.08; log('W2','warn','Hour -4: Strain gauge rising: 0.02 → 0.08. Void roof beginning to deform.'); }},
    {d:1200, a:() => { ni('W2').str=0.14; ni('W3').str=0.06; ni('W3').anom=true; log('W2','err','Hour -3: Strain SPIKE: 0.14 (7× baseline). W3 also showing strain increase.'); }},
    {d:1200, a:() => { ml.if=0.65; ml.lstm=0.59; ml.ens=0.55; log('ML','ml','Hour -2.5: IF:0.65, LSTM:0.59. Ensemble: 0.55. 2/3 models agree.'); }},
    {d:1200, a:() => { aLvl=2; log('ALERT','err','Hour -2: TARP → L2 WARNING. "Imminent void collapse risk near W2-W3. EVACUATE surrounding area."'); }},
    {d:1200, a:() => log('ALERT','err','SMS → authorities: "Unauthorized excavation detected. Structural failure imminent. Evacuate 200m radius."')},
    {d:1200, a:() => { ni('W2').tilt=5.2; ni('W2').st='critical'; ml.pinn=0.92; ml.ens=0.84; aLvl=3; log('ALERT','err','🚨 Hour -0.5: L3. Rapid tilt acceleration 0→5.2° in 30 min. COLLAPSE IMMINENT.'); }},
    {d:1200, a:() => log('ENV','err','Hour 0: Tunnel collapses. (Actual: 3 workers died, bodies recovered with manual tools over 2 days.)')},
    {d:1200, a:() => log('SYS','ok','━━━ RESULT: L2 warning 2 HOURS before collapse. Evacuation window: sufficient to save 3 lives. ━━━')},
    {d:1200, a:() => log('SYS','ok','━━━ Additionally: illegal excavation pattern detected at hour -8 (vibration FFT) ━━━')},
  ]);
}

function t16() {
  sI('🏠 Test 16: Sijua Ground Caving (Sep 8, 2026)',
    '<em>Houses damaged near Sijua Kali Temple. 12-year-old Vikram Kumar Bhuiyan died, 6 injured.</em><br><br>' +
    '<strong>If deployed:</strong> Progressive tilt over 3 days detected.<br>' +
    '• Day 1: L1 (slow tilt 0.6°)<br>' +
    '• Day 2: L2 (spatial spread to 3 nodes)<br>' +
    '• Day 2.5: L3 (PINN: collapse in 12h)<br>' +
    '• <strong>12 hours to evacuate families</strong>');
  sched([
    {d:1000, a:() => log('SYS','info','═══ REAL-LIFE: Sijua Ground Caving (Sep 8, 2026 — 1 child dead, 6 injured) ═══')},
    {d:1200, a:() => log('SYS','info','Location: Near Sijua Kali Temple, Jharia. Old mine workings beneath residential colony.')},
    {d:1200, a:() => { ni('N2').tilt=0.35; log('N2','info','Day 0.5: Baseline deviation begins. Tilt: 0.2° → 0.35°. Subsidence velocity: 0.006°/hr.'); }},
    {d:1200, a:() => { ni('N2').tilt=0.6; log('N2','info','Day 1: Tilt: 0.6°. Subsidence velocity increasing: 0.017°/hr. Z-score: 1.8.'); }},
    {d:1200, a:() => { ni('N2').tilt=0.9; ni('N2').anom=true; aLvl=1; log('ALERT','warn','Day 1.5: L1 WATCH. N2 tilt: 0.9°. Z-score: 2.4. "Progressive tilt in residential zone."'); }},
    {d:1200, a:() => { ni('N1').tilt=0.5; ni('N3').tilt=0.7; log('NORTH','info','Day 1.8: Adjacent nodes developing: N1=0.5°, N3=0.7°. Subsidence bowl widening.'); }},
    {d:1200, a:() => { ni('N2').tilt=1.6; ni('N1').tilt=0.7; ni('N1').anom=true; ni('N3').tilt=0.9; ni('N3').anom=true; log('NORTH','warn','Day 2: N1(0.7°), N2(1.6°), N3(0.9°). 3-node spatial cluster. Correlation: 0.86.'); }},
    {d:1200, a:() => { ml.if=0.61; ml.lstm=0.67; ml.ens=0.57; aLvl=2; log('ALERT','err','Day 2: TARP → L2 WARNING. "Differential settlement in residential zone. Evacuate affected houses."'); }},
    {d:1200, a:() => log('ALERT','err','SMS → District Admin + DGMS: "L2 — Sijua residential area. Ground settlement detected. Immediate inspection required."')},
    {d:1200, a:() => { ni('N2').tilt=2.4; ni('N2').st='critical'; log('N2','err','Day 2.3: Tilt acceleration: 1.6° → 2.4° in 7 hours. Δtilt/Δt = 0.11°/hr.'); }},
    {d:1200, a:() => { ni('N2').tilt=2.8; ml.pinn=0.85; ml.ens=0.79; log('ML','ml','Day 2.5: PINN severity: 0.85. Predicted collapse: ~12 hours. Knothe residual: +1.3σ.'); }},
    {d:1200, a:() => { aLvl=3; log('ALERT','err','🚨 Day 2.5: L3 CRITICAL. "EVACUATE all families within 150m of N2 sensor. Ground collapse imminent."'); }},
    {d:1200, a:() => log('ALERT','err','If evacuated at this point: 12 hours before actual collapse. ALL residents safe.')},
    {d:1200, a:() => log('ENV','err','Day 3: Ground caves in near Kali Temple. Houses damaged. (Actual: Vikram, age 12, died. 6 others injured.)')},
    {d:1200, a:() => log('SYS','ok','━━━ RESULT: 12-hour advance warning. Evacuation could have saved Vikram\'s life. ━━━')},
    {d:1200, a:() => log('SYS','ok','━━━ System detected progressive tilt pattern starting Day 1. L2 at Day 2. L3 at Day 2.5. ━━━')},
  ]);
}

function t17() {
  sI('🔥 Test 17: Coal Fire Subsidence',
    '<em>Jharia coal fire zone</em>: Underground fire thermally weakens roof strata over weeks.<br><br>' +
    '<strong>Detection chain:</strong><br>' +
    '• Week 1: Soil moisture anomalously low (thermal drying)<br>' +
    '• Week 2: Progressive tilt + Knothe residual rising<br>' +
    '• Week 3: L1 (multi-parameter anomaly)<br>' +
    '• Week 4: L2 (void collapse risk)');
  sched([
    {d:1000, a:() => log('SYS','info','═══ REAL-LIFE: Jharia Coal Fire Zone — Thermal Subsidence ═══')},
    {d:1200, a:() => log('ENV','info','Context: Underground fire has been burning for decades. Temperature >300°C in fire zone.')},
    {d:1200, a:() => { ['E1','E2','E3'].forEach(id => { ni(id).moi=22; ni(id).temp=38; }); log('E1','info','Week 1: Soil moisture dropping: 35% → 22%. Thermal drying from underground fire below.'); }},
    {d:1200, a:() => { ['E1','E2','E3'].forEach(id => { ni(id).moi=15; ni(id).temp=45; }); log('E2','info','Week 1.5: Moisture: 15%. Surface temperature: 45°C (ambient: 33°C). Thermal anomaly confirmed.'); }},
    {d:1200, a:() => { ni('E2').tilt=0.5; log('ML','ml','Week 2: Knothe residual: +0.5σ. Subsidence rate slightly elevated. Monitoring.'); }},
    {d:1200, a:() => { ni('E2').tilt=0.9; log('E2','info','Week 2.5: Tilt: 0.9°. Low moisture + elevated temp + progressive tilt = multi-parameter anomaly pattern.'); }},
    {d:1200, a:() => { ni('E2').tilt=1.4; ni('E2').anom=true; ni('E1').tilt=0.7; aLvl=1; log('ALERT','warn','Week 3: L1 WATCH. E2 tilt: 1.4°. Thermal weakening + progressive settlement. Multi-week trend.'); }},
    {d:1200, a:() => log('ML','ml','Week 3: PINN Knothe model: fire-zone correction factor applied. Thermal weakening coefficient: 0.3. Adjusted prediction.')},
    {d:1200, a:() => { ni('E2').tilt=2.2; ni('E2').st='critical'; ni('E1').tilt=1.1; ni('E1').anom=true; ml.pinn=0.72; ml.ens=0.58; }},
    {d:1200, a:() => { aLvl=2; log('ALERT','err','Week 4: L2 WARNING. Fire-induced void collapse imminent. E1-E3 zone unsafe.'); }},
    {d:1200, a:() => log('ALERT','err','SMS → BCCL + DGMS: "Fire-zone subsidence. E1-E3 panel. Thermal weakening confirmed by multi-sensor fusion."')},
    {d:1200, a:() => log('SYS','ok','━━━ RESULT: Weeks of progressive warning for coal fire subsidence — multi-parameter detection ━━━')},
  ]);
}

function t18() {
  sI('⛰️ Test 18: Multi-Seam Cascade Collapse',
    'Overlapping extraction panels: East seam (shallow) above West seam (deep).<br>' +
    'Upper seam extraction destabilizes inter-seam pillars.<br><br>' +
    '<strong>8 nodes affected across 2 zones</strong> — cross-zone correlation detected by ML.');
  sched([
    {d:1000, a:() => log('SYS','info','═══ REAL-LIFE: Multi-Seam Cascade Collapse ═══')},
    {d:1200, a:() => log('SYS','info','Scenario: East panel (seam 1, 20m deep) above West panel (seam 2, 45m deep). Active extraction in both.')},
    {d:1200, a:() => { ['E4','E5','E6','E7'].forEach(id => { ni(id).tilt=+(0.8+Math.random()*0.4).toFixed(1); ni(id).anom=true; }); log('EAST','warn','Phase 1: East panel extraction effect. E4-E7: tilt 0.8-1.2°. Normal for active mining.'); }},
    {d:1200, a:() => log('ML','ml','East panel: Knothe model matches expected subsidence trough. Within predicted bounds.')},
    {d:1500, a:() => { ['W4','W5','W6','W7'].forEach(id => { ni(id).tilt=+(0.6+Math.random()*0.5).toFixed(1); ni(id).anom=true; }); log('WEST','warn','Phase 2: CASCADE! West panel W4-W7 developing tilt 0.6-1.1°. Inter-seam stress transfer!'); }},
    {d:1200, a:() => log('ML','ml','CRITICAL: West panel subsidence NOT predicted by West-seam Knothe model. Cross-seam interaction detected.')},
    {d:1200, a:() => { ml.if=0.72; ml.lstm=0.68; ml.pinn=0.74; ml.ens=0.71; log('ML','ml','Cross-zone correlation: East↔West Pearson r=0.84. 8/20 nodes anomalous. Ensemble: 0.71.'); }},
    {d:1200, a:() => { aLvl=2; log('ALERT','err','L2 WARNING: Multi-seam cascade detected. 2 zones affected simultaneously.'); }},
    {d:1200, a:() => { ['E5','E6','W5','W6'].forEach(id => { ni(id).tilt=+(2.0+Math.random()*1.0).toFixed(1); ni(id).st='critical'; }); ml.pinn=0.88; ml.ens=0.82; }},
    {d:1200, a:() => { aLvl=3; log('ALERT','err','🚨 L3: Multi-seam cascade collapse. EVACUATE BOTH East and West panels.'); }},
    {d:1200, a:() => log('ALERT','err','SMS → mine operator: "Multi-seam interaction failure. Both panels unsafe. Halt extraction immediately."')},
    {d:1200, a:() => log('SYS','warn','━━━ RESULT: Cross-zone cascade detected by ML spatial correlation — both panels evacuated ━━━')},
  ]);
}

function t19() {
  sI('💥 Test 19: Blast Vibration vs Subsidence',
    'Active mine blasting 500m away. Vibration spike on 6 West-panel nodes.<br><br>' +
    '<strong>ML distinguishes blast from subsidence:</strong><br>' +
    '• Blast = sharp impulse (&lt;2s), exponential decay<br>' +
    '• Subsidence = sustained trend, correlated with tilt/strain<br>' +
    '• LSTM temporal profile analysis correctly classifies as BLAST');
  sched([
    {d:1000, a:() => log('SYS','info','═══ REAL-LIFE: Blast Vibration Event ═══')},
    {d:1200, a:() => log('ENV','info','Active mining blast scheduled 500m from West panel. Charge: 200kg ANFO.')},
    {d:1200, a:() => log('ENV','info','T-0: BLAST. Shockwave propagating through rock strata at ~3500 m/s.')},
    {d:1000, a:() => { ['W1','W2','W3','W4','W5','W6'].forEach(id => { ni(id).vib=+(1.2+Math.random()*0.8).toFixed(1); }); log('WEST','warn','6 nodes vibration spike: 1.2-2.0g! Peak ground velocity: 12 mm/s.'); }},
    {d:1200, a:() => { zonePulse('W',1,'#d97706','ALERT'); log('GW-W','warn','6 anomaly-flagged packets received. Vibration anomaly across entire West zone.'); }},
    {d:1200, a:() => { ml.if=0.55; log('ML','ml','Isolation Forest: multi-node vibration outlier. Score: 0.55 — FLAGS ANOMALY.'); }},
    {d:1200, a:() => log('ML','ml','LSTM temporal analysis: Impulse signature detected. Rise time: 8ms. Decay: exponential, τ=180ms. Total duration: 1.8s.')},
    {d:1200, a:() => { ml.lstm=0.12; log('ML','ml','LSTM classification: BLAST pattern (not subsidence). Subsidence = sustained >300s. This = impulse <2s. Score: 0.12 ✓'); }},
    {d:1200, a:() => log('ML','ml','Cross-check: No tilt change on any node. No strain change. Vibration-only event. Subsidence would show tilt+strain.')},
    {d:1200, a:() => { ml.pinn=0.08; ml.ens=0.25; log('ML','ml','PINN: Knothe residual unchanged (±0.1σ). No subsidence signature. Score: 0.08 ✓'); }},
    {d:1200, a:() => log('ML','ml','Ensemble: 1/3 (IF only). 2/3 required. VERDICT: BLAST EVENT, not subsidence. Alert SUPPRESSED.')},
    {d:1200, a:() => { ['W1','W2','W3','W4','W5','W6'].forEach(id => { ni(id).vib=+(0.06+Math.random()*0.06).toFixed(2); }); log('WEST','ok','Vibration returned to baseline within 3 seconds. All nodes normal.'); }},
    {d:1000, a:() => log('ALERT','ok','No false alert generated. L0 maintained. Blast event logged for training dataset.')},
    {d:1200, a:() => log('SYS','ok','━━━ TEST 19 PASSED: ML correctly distinguished blast impulse from subsidence trend ━━━')},
  ]);
}

function t20() {
  sI('🌧️ Test 20: Monsoon Flood + 5-Node Damage',
    'Heavy flooding <strong>destroys 5 nodes</strong> simultaneously (water ingress despite IP67).<br><br>' +
    '• Affected: E1, E2, W1, W2, N1 — edge nodes in flood-prone locations<br>' +
    '• Network fragments. AODV rebuilds routes around gaps.<br>' +
    '• System degrades to <strong>15/20 nodes</strong> — still functional');
  sched([
    {d:1000, a:() => log('SYS','info','═══ REAL-LIFE: Monsoon Flash Flood + Node Destruction ═══')},
    {d:1200, a:() => log('ENV','info','Heavy rainfall: 120mm in 3 hours. Flash flood warning for low-lying mine areas.')},
    {d:1200, a:() => log('ENV','warn','Water level rising in mine drainage channels. Surface flooding in East and West entry zones.')},
    {d:1000, a:() => { ni('E1').st='offline'; ni('E1').bat=0; log('E1','err','WATER INGRESS. MCU short circuit. E1 OFFLINE.'); }},
    {d:800, a:() => { ni('E2').st='offline'; ni('E2').bat=0; log('E2','err','Submerged. E2 OFFLINE.'); }},
    {d:800, a:() => { ni('W1').st='offline'; ni('W1').bat=0; log('W1','err','Water damage. W1 OFFLINE.'); }},
    {d:800, a:() => { ni('W2').st='offline'; ni('W2').bat=0; log('W2','err','Enclosure breach. W2 OFFLINE.'); }},
    {d:800, a:() => { ni('N1').st='offline'; ni('N1').bat=0; log('N1','err','Flood debris impact. N1 OFFLINE.'); }},
    {d:1200, a:() => log('NET','err','5 simultaneous node failures detected. AODV: 5 RERR messages processing...')},
    {d:1200, a:() => log('NET','net','Route table rebuild: E3 now zone entry for East. W3 for West. N2 for North.')},
    {d:1000, a:() => { aLvl=1; log('GW','warn','Node status: East 5/7, West 5/7, North 5/6. Total: 15/20. Coverage: 75%.'); }},
    {d:1200, a:() => { zonePulse('E',0,'#059669','DATA'); log('EAST','ok','East zone: E3-E7 operational. Re-routing through E3 as entry point.'); }},
    {d:1000, a:() => { zonePulse('W',1,'#3b82f6','DATA'); log('WEST','ok','West zone: W3-W7 operational. W3 is new entry.'); }},
    {d:1200, a:() => log('ALERT','warn','L1 WATCH: 25% coverage loss. 5 replacement units requested. Dispatch when flood recedes.')},
    {d:1200, a:() => log('GW','ok','15 surviving nodes all reporting. Edge ML recalibrating baselines for reduced network.')},
    {d:1200, a:() => log('SYS','warn','━━━ TEST 20 RESULT: System degraded to 75% but fully functional — AODV re-routed ━━━')},
  ]);
}

function t21() {
  sI('🔥 Test 21: Full System Stress Test',
    '<strong>Everything fails simultaneously</strong> — worst-case scenario:<br>' +
    '• 5 nodes destroyed (flood)<br>' +
    '• 3 nodes anomalous (subsidence)<br>' +
    '• GW-North offline<br>' +
    '• All gateways lose internet<br>' +
    '• LoRa near saturation<br>' +
    '• Spoofed packet attempted<br><br>' +
    'Can the system still issue <strong>L2 Warning</strong>?');
  sched([
    {d:800, a:() => log('SYS','err','━━━ MAXIMUM STRESS TEST — ALL FAILURES SIMULTANEOUS ━━━')},
    {d:1000, a:() => { ['E1','E2','W1','W2','N1'].forEach(id => { ni(id).st='offline'; ni(id).bat=0; }); log('ENV','err','5 nodes DESTROYED by flooding: E1, E2, W1, W2, N1.'); }},
    {d:1000, a:() => { ['E4','E5','E6'].forEach(id => { ni(id).tilt=2.5; ni(id).anom=true; }); log('EAST','warn','E4-E6: Subsidence anomaly. Tilt: 2.5°.'); }},
    {d:800, a:() => { GW[2].st='offline'; log('GW-N','err','GW-North OFFLINE (power failure).'); }},
    {d:800, a:() => { GW.forEach(g => g.inet=false); log('NET','err','ALL gateways: 4G LOST (tower outage).'); }},
    {d:1000, a:() => { pph=200; log('NET','warn','LoRa load: 82%. Near saturation. Adaptive SF activated.'); }},
    {d:1000, a:() => { spawn({x:GW[0].x-60,y:GW[0].y+40},GW[0],'#dc2626','SPOOF'); log('SEC','err','Spoofed packet REJECTED (AES-128 + HMAC + seq# validation).'); }},
    {d:1200, a:() => log('NET','net','AODV rebuilding: N-zone → cross-zone via E6→E5→GW-E. 14 nodes routable.')},
    {d:1200, a:() => { ml.if=0.62; ml.lstm=0.55; ml.pinn=0.48; ml.ens=0.55; log('ML','ml','Edge ML (OFFLINE): IF=0.62⚠ LSTM=0.55⚠ PINN=0.48. Ensemble=0.55. 2/3 agree.'); }},
    {d:1200, a:() => { aLvl=2; log('ALERT','err','TARP → L2 WARNING issued OFFLINE on GW-E. Gateway siren ACTIVATED.'); }},
    {d:1200, a:() => log('ALERT','warn','SMS queued (3 messages). Will deliver immediately upon 4G restoration.')},
    {d:1200, a:() => { spawn(ni('E4'),GW[0],'#d97706','ALERT'); spawn(ni('W5'),GW[1],'#3b82f6','DATA'); log('NET','ok','Surviving nodes transmitting via re-routed paths.'); }},
    {d:1200, a:() => { log('SYS','warn','━━━ STRESS TEST RESULTS ━━━'); }},
    {d:1000, a:() => log('SYS','info','• Nodes: 15/20 active. 3 anomalous in East panel.')},
    {d:800, a:() => log('SYS','info','• Network: AODV re-routed. N-zone via East fallback. Max 4 hops.')},
    {d:800, a:() => log('SYS','info','• ML: Running OFFLINE on gateway. L2 correctly triggered.')},
    {d:800, a:() => log('SYS','info','• Alerts: Siren active locally. SMS queued for 4G restoration.')},
    {d:800, a:() => log('SYS','info','• Security: Spoofed packet blocked at all 3 validation layers.')},
    {d:1200, a:() => log('SYS','ok','• VERDICT: System DEGRADED but FUNCTIONAL under simultaneous worst-case scenario.')},
    {d:1200, a:() => log('SYS','ok','━━━ This proves the system can operate under conditions worse than any single real-world incident ━━━')},
  ]);
}
