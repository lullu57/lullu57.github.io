// ============================================================
// Pipeline Simulator — Canvas-based animation
// Compares TPU fused dataflow with two CPU modes:
// 1) Teaching baseline (serialized, no cache/SIMD reuse)
// 2) Optimized CPU (pipelined overlap + SIMD + cache hierarchy)
// ============================================================

(function () {
  "use strict";

  // ---- Configuration ----
  var NUM_LAYERS = 4;

  var TPU_STAGES = [
    { name: "Matrix\nMultiply", short: "MatMul", type: "compute" },
    { name: "Accumu-\nlators", short: "Accum", type: "buffer" },
    { name: "Activation\n(ReLU)", short: "Act", type: "compute" },
    { name: "Normalize\n/ Pool", short: "Norm", type: "compute" },
  ];

  var CPU_BASE_STAGES = [
    { name: "MatMul\nKernel", short: "MatMul", type: "compute" },
    { name: "Memory\nAccess", short: "Mem", type: "memory" },
    { name: "Activate\nKernel", short: "Act", type: "compute" },
    { name: "Memory\nAccess", short: "Mem", type: "memory" },
    { name: "Norm/Pool\nKernel", short: "Norm", type: "compute" },
  ];

  var CPU_OPT_STAGES = [
    { name: "MatMul\n(SIMD)", short: "MatMul", type: "compute" },
    { name: "Cache /\nMemory", short: "Mem", type: "memory" },
    { name: "PostOp\n(Act+Norm)", short: "Post", type: "compute" },
    { name: "Writeback", short: "Write", type: "memory" },
  ];

  var CPU_OPT = {
    cpuIssueWidth: 2,
    simdFactor: 4,
    maxInFlight: 3,
    memPenaltyByState: { L1: 0, LLC: 1, DRAM: 3 },
    matmulCycles: 3,
    postOpCycles: 2,
    writebackCycles: 2,
  };

  var TPU_N = TPU_STAGES.length;
  var TPU_FIN = NUM_LAYERS + TPU_N - 1; // 7

  // ---- Color palette ----
  var COL = {
    bg: "#f9f5ed",
    text: "#2a2520",
    muted: "#8a7f72",
    border: "#c8bfad",
    arrow: "#a09585",
    compute: { bg: "#ffe0b2", stroke: "#ffcc80", text: "#e65100" },
    buffer: { bg: "#bbdefb", stroke: "#90caf9", text: "#1565c0" },
    memory: { bg: "#ffd7d7", stroke: "#c35f5f", text: "#9f2f2f" },
    done: { bg: "#e6f5f2", stroke: "#1a7a6d", text: "#1a7a6d" },
    l1: "#1a7a6d",
    llc: "#b8860b",
    dram: "#c94a1a",
    layers: ["#c94a1a", "#1a7a6d", "#1d6fa5", "#b8860b"],
  };

  var cpuMode = "optimized";
  var modeData = {
    baseline: null,
    optimized: null,
  };

  // ---- State ----
  var cycle = 0;
  var playing = false;
  var intervalId = null;

  // ---- DOM refs ----
  var canvas = document.getElementById("canvasPipeline");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");

  var btnPlay = document.getElementById("btnPipePlay");
  var btnStep = document.getElementById("btnPipeStep");
  var btnReset = document.getElementById("btnPipeReset");
  var slider = document.getElementById("pipeSpeedSlider");
  var btnCpuBaseline = document.getElementById("btnCpuBaseline");
  var btnCpuOptimized = document.getElementById("btnCpuOptimized");
  var assumptionsEl = document.getElementById("pipelineAssumptions");
  var memoryNoteEl = document.getElementById("pipelineMemoryNote");
  var cycleEl = document.getElementById("pipeCycleNum");

  function tpuStage(c, l) {
    var s = c - l;
    return s < 0 ? -1 : s >= TPU_N ? TPU_N : s;
  }

  function getMemState(layerIdx, stageStep, mode) {
    var pattern = mode === "baseline"
      ? ["DRAM", "LLC", "DRAM", "LLC", "DRAM", "L1", "DRAM"]
      : ["L1", "L1", "LLC", "L1", "DRAM", "L1", "LLC"];
    var idx = (layerIdx * 5 + stageStep) % pattern.length;
    return pattern[idx];
  }

  function cloneCounts(c) {
    return { L1: c.L1, LLC: c.LLC, DRAM: c.DRAM };
  }

  function buildBaselineData() {
    var cpuN = CPU_BASE_STAGES.length;
    var cpuFin = NUM_LAYERS * cpuN;
    var stageTimeline = [];
    var memEventsByCycle = [];
    var recentByCycle = [];
    var memCountsByCycle = [];
    var memDelayByCycle = [];

    var counts = { L1: 0, LLC: 0, DRAM: 0 };
    var delay = 0;
    var history = [];

    for (var c = 0; c <= cpuFin; c++) {
      var stages = [];
      var events = [];

      for (var l = 0; l < NUM_LAYERS; l++) {
        var s = c - l * cpuN;
        var stage = s < 0 ? -1 : (s >= cpuN ? cpuN : s);
        stages.push(stage);

        if (c > 0 && (stage === 1 || stage === 3)) {
          var prevS = (c - 1) - l * cpuN;
          var prevStage = prevS < 0 ? -1 : (prevS >= cpuN ? cpuN : prevS);
          if (prevStage !== stage) {
            var memStep = stage === 1 ? 0 : 1;
            var state = getMemState(l, memStep, "baseline");
            var penalty = CPU_OPT.memPenaltyByState[state];
            events.push({ cycle: c, layer: l, state: state, penalty: penalty, phase: "read-path" });
            counts[state]++;
            delay += penalty;
            history.push({ cycle: c, layer: l, state: state });
          }
        }
      }

      stageTimeline.push(stages);
      memEventsByCycle.push(events);
      memCountsByCycle.push(cloneCounts(counts));
      memDelayByCycle.push(delay);
      recentByCycle.push(history.slice(-4));
    }

    return {
      key: "baseline",
      cpuStages: CPU_BASE_STAGES,
      cpuFin: cpuFin,
      subtitle: "CPU (teaching baseline)",
      assumptions: "Assumptions: single-thread, no cache reuse, no SIMD.",
      stageTimeline: stageTimeline,
      memEventsByCycle: memEventsByCycle,
      memCountsByCycle: memCountsByCycle,
      memDelayByCycle: memDelayByCycle,
      recentByCycle: recentByCycle,
    };
  }

  function buildOptimizedData() {
    var cpuN = CPU_OPT_STAGES.length;
    var maxCycles = 96;
    var layers = [];

    for (var l = 0; l < NUM_LAYERS; l++) {
      layers.push({ id: l, phase: "waiting", rem: 0, memStep: 0 });
    }

    var stageTimeline = [];
    var memEventsByCycle = [];
    var recentByCycle = [];
    var memCountsByCycle = [];
    var memDelayByCycle = [];

    var counts = { L1: 0, LLC: 0, DRAM: 0 };
    var delay = 0;
    var history = [];

    function snapshot() {
      var row = [];
      for (var i = 0; i < layers.length; i++) {
        var p = layers[i].phase;
        if (p === "waiting") row.push(-1);
        else if (p === "done") row.push(cpuN);
        else if (p === "matmul") row.push(0);
        else if (p === "memwait") row.push(1);
        else if (p === "post") row.push(2);
        else row.push(3); // write
      }
      return row;
    }

    stageTimeline.push(snapshot());
    memEventsByCycle.push([]);
    memCountsByCycle.push(cloneCounts(counts));
    memDelayByCycle.push(delay);
    recentByCycle.push([]);

    var c = 0;

    while (c < maxCycles) {
      var events = [];
      var inFlight = 0;
      var i;

      for (i = 0; i < layers.length; i++) {
        if (layers[i].phase !== "waiting" && layers[i].phase !== "done") inFlight++;
      }

      var issued = 0;
      for (i = 0; i < layers.length; i++) {
        if (layers[i].phase === "waiting" && issued < CPU_OPT.cpuIssueWidth && inFlight < CPU_OPT.maxInFlight) {
          layers[i].phase = "matmul";
          layers[i].rem = CPU_OPT.matmulCycles;
          issued++;
          inFlight++;
        }
      }

      for (i = 0; i < layers.length; i++) {
        var layer = layers[i];

        if (layer.phase === "matmul") {
          layer.rem--;
          if (layer.rem <= 0) {
            var memState = getMemState(layer.id, layer.memStep, "optimized");
            layer.memStep++;
            var penalty = CPU_OPT.memPenaltyByState[memState];
            events.push({ cycle: c + 1, layer: layer.id, state: memState, penalty: penalty, phase: "read-path" });
            counts[memState]++;
            delay += penalty;
            history.push({ cycle: c + 1, layer: layer.id, state: memState });
            if (penalty > 0) {
              layer.phase = "memwait";
              layer.rem = penalty;
            } else {
              layer.phase = "post";
              layer.rem = CPU_OPT.postOpCycles;
            }
          }
        } else if (layer.phase === "memwait") {
          layer.rem--;
          if (layer.rem <= 0) {
            layer.phase = "post";
            layer.rem = CPU_OPT.postOpCycles;
          }
        } else if (layer.phase === "post") {
          layer.rem--;
          if (layer.rem <= 0) {
            layer.phase = "write";
            layer.rem = CPU_OPT.writebackCycles;
          }
        } else if (layer.phase === "write") {
          layer.rem--;
          if (layer.rem <= 0) {
            layer.phase = "done";
            layer.rem = 0;
          }
        }
      }

      c++;
      stageTimeline.push(snapshot());
      memEventsByCycle.push(events);
      memCountsByCycle.push(cloneCounts(counts));
      memDelayByCycle.push(delay);
      recentByCycle.push(history.slice(-4));

      var doneCount = 0;
      for (i = 0; i < layers.length; i++) if (layers[i].phase === "done") doneCount++;
      if (doneCount === NUM_LAYERS) break;
    }

    return {
      key: "optimized",
      cpuStages: CPU_OPT_STAGES,
      cpuFin: c,
      subtitle: "CPU (pipelined + SIMD + cache)",
      assumptions: "Assumptions: 3-way overlap, SIMD lanes, cache hierarchy.",
      stageTimeline: stageTimeline,
      memEventsByCycle: memEventsByCycle,
      memCountsByCycle: memCountsByCycle,
      memDelayByCycle: memDelayByCycle,
      recentByCycle: recentByCycle,
    };
  }

  function currentModeData() {
    return modeData[cpuMode] || modeData.optimized;
  }

  function getMaxCycle() {
    var mode = currentModeData();
    return Math.max(TPU_FIN, mode.cpuFin);
  }

  function safeCycle(mode, c) {
    return Math.max(0, Math.min(c, mode.stageTimeline.length - 1));
  }

  function updateUI() {
    var mode = currentModeData();
    if (cycleEl) cycleEl.textContent = cycle;
    if (assumptionsEl) assumptionsEl.textContent = mode.assumptions;
    if (memoryNoteEl) {
      memoryNoteEl.innerHTML = mode.key === "optimized"
        ? "Note: L1/L2 hits add <strong>0-cycle stall</strong>, so a layer can move past Cache/Memory quickly. Writeback is a separate output-store stage with fixed cost."
        : "Note: In baseline mode, memory stages are explicit and serialized, so layers do not bypass memory with zero-stall cache hits.";
    }
    if (btnCpuBaseline) btnCpuBaseline.classList.toggle("active", cpuMode === "baseline");
    if (btnCpuOptimized) btnCpuOptimized.classList.toggle("active", cpuMode === "optimized");
  }

  function resetState() {
    cycle = 0;
    updateUI();
  }

  function roundRect(ctx2, x, y, w, h, r) {
    ctx2.beginPath();
    ctx2.moveTo(x + r, y);
    ctx2.lineTo(x + w - r, y);
    ctx2.arcTo(x + w, y, x + w, y + r, r);
    ctx2.lineTo(x + w, y + h - r);
    ctx2.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx2.lineTo(x + r, y + h);
    ctx2.arcTo(x, y + h, x, y + h - r, r);
    ctx2.lineTo(x, y + r);
    ctx2.arcTo(x, y, x + r, y, r);
    ctx2.closePath();
  }

  function drawArrow(ctx2, x, y, len, color) {
    var hl = 5;
    ctx2.strokeStyle = color;
    ctx2.lineWidth = 1.5;
    ctx2.beginPath();
    ctx2.moveTo(x, y);
    ctx2.lineTo(x + len - hl, y);
    ctx2.stroke();
    ctx2.fillStyle = color;
    ctx2.beginPath();
    ctx2.moveTo(x + len, y);
    ctx2.lineTo(x + len - hl, y - 3.5);
    ctx2.lineTo(x + len - hl, y + 3.5);
    ctx2.closePath();
    ctx2.fill();
  }

  function drawToken(ctx2, cx, cy, r, layerIdx) {
    ctx2.beginPath();
    ctx2.arc(cx, cy, r, 0, Math.PI * 2);
    ctx2.fillStyle = COL.layers[layerIdx];
    ctx2.fill();
    ctx2.strokeStyle = "rgba(255,255,255,0.6)";
    ctx2.lineWidth = 1.5;
    ctx2.stroke();
    ctx2.fillStyle = "#fff";
    ctx2.font = "bold " + Math.max(8, r * 0.85) + "px 'IBM Plex Mono', monospace";
    ctx2.textAlign = "center";
    ctx2.textBaseline = "middle";
    ctx2.fillText("L" + (layerIdx + 1), cx, cy + 0.5);
  }

  function drawStageTokens(ctx2, layers, sx, sy, sw, sh, tokR) {
    if (!layers || !layers.length) return;
    var cols = layers.length > 2 ? 2 : layers.length;
    var rows = Math.ceil(layers.length / cols);
    var xSpread = cols === 1 ? 0 : Math.min(sw * 0.44, tokR * 2.5);
    var ySpread = rows === 1 ? 0 : Math.min(sh * 0.36, tokR * 2.4);

    for (var i = 0; i < layers.length; i++) {
      var col = cols === 1 ? 0 : (i % cols);
      var row = Math.floor(i / cols);
      var ox = cols === 1 ? 0 : (col === 0 ? -xSpread / 2 : xSpread / 2);
      var oy = rows === 1 ? 0 : (row === 0 ? -ySpread / 2 : ySpread / 2);
      drawToken(ctx2, sx + sw / 2 + ox, sy + sh / 2 + oy, tokR, layers[i]);
    }
  }

  function memColor(state) {
    if (state === "L1") return COL.l1;
    if (state === "LLC") return COL.llc;
    return COL.dram;
  }

  function memLabel(state) {
    if (state === "L1") return "L1/L2 hit";
    if (state === "LLC") return "LLC hit";
    return "DRAM miss";
  }

  function drawMemoryPanel(ctx2, mode, panelX, panelY, panelW, panelH, sc, fs) {
    roundRect(ctx2, panelX, panelY, panelW, panelH, 4);
    ctx2.fillStyle = "#fffdf8";
    ctx2.fill();
    ctx2.strokeStyle = COL.border;
    ctx2.lineWidth = 1;
    ctx2.stroke();

    var counts = mode.memCountsByCycle[sc] || { L1: 0, LLC: 0, DRAM: 0 };
    var delay = mode.memDelayByCycle[sc] || 0;
    var recent = mode.recentByCycle[sc] || [];
    var nowEvents = mode.memEventsByCycle[sc] || [];
    var writebackIdx = mode.key === "optimized" ? mode.cpuStages.length - 1 : -1;
    var writebackActive = 0;
    var rowState = mode.stageTimeline[sc] || [];
    for (var wi = 0; wi < rowState.length; wi++) {
      if (writebackIdx >= 0 && rowState[wi] === writebackIdx) writebackActive++;
    }
    var total = counts.L1 + counts.LLC + counts.DRAM;

    var x = panelX + 8;
    var y = panelY + 12;

    ctx2.fillStyle = COL.text;
    ctx2.font = "bold " + Math.max(8, 9 * fs) + "px 'IBM Plex Mono', monospace";
    ctx2.textAlign = "left";
    ctx2.textBaseline = "middle";
    ctx2.fillText("CPU MEMORY", x, y);

    y += 13;
    ctx2.fillStyle = COL.muted;
    ctx2.font = Math.max(7, 7.4 * fs) + "px 'IBM Plex Mono', monospace";
    if (mode.key === "optimized") {
      ctx2.fillText("Read path classifies cache", x, y);
      y += 9;
      ctx2.fillText("Writeback is fixed output store", x, y);
      y += 9;
      ctx2.fillText("Writeback active layers: " + writebackActive, x, y);
    } else {
      ctx2.fillText("Both memory stages classify", x, y);
      y += 9;
      ctx2.fillText("No zero-stall bypass", x, y);
    }

    y += 11;
    ctx2.fillStyle = COL.muted;
    ctx2.font = Math.max(7, 8 * fs) + "px 'IBM Plex Mono', monospace";
    ctx2.fillText("This cycle", x, y);

    y += 11;
    if (nowEvents.length) {
      for (var e = 0; e < Math.min(3, nowEvents.length); e++) {
        var evt = nowEvents[e];
        ctx2.fillStyle = memColor(evt.state);
        ctx2.fillRect(x, y - 3, 7, 7);
        ctx2.strokeStyle = COL.border;
        ctx2.strokeRect(x, y - 3, 7, 7);
        ctx2.fillStyle = COL.text;
        ctx2.font = Math.max(7, 7.4 * fs) + "px 'IBM Plex Mono', monospace";
        var extra = evt.penalty > 0 ? " (+" + evt.penalty + ")" : "";
        var tag = evt.phase === "read-path" ? "read" : "write";
        ctx2.fillText("L" + (evt.layer + 1) + " " + tag + " \u2192 " + memLabel(evt.state) + extra, x + 11, y + 0.5);
        y += 10;
      }
    } else {
      ctx2.fillStyle = COL.muted;
      ctx2.font = Math.max(7, 7.4 * fs) + "px 'IBM Plex Mono', monospace";
      ctx2.fillText("No new memory event", x, y);
      y += 10;
    }

    y += 2;
    ctx2.fillStyle = COL.muted;
    ctx2.font = Math.max(7, 8 * fs) + "px 'IBM Plex Mono', monospace";
    ctx2.fillText("Recent accesses", x, y);

    y += 11;
    var shown = recent.slice(-4);
    for (var i = 0; i < shown.length; i++) {
      var ev = shown[shown.length - 1 - i];
      ctx2.fillStyle = memColor(ev.state);
      ctx2.fillRect(x, y - 3, 7, 7);
      ctx2.strokeStyle = COL.border;
      ctx2.strokeRect(x, y - 3, 7, 7);
      ctx2.fillStyle = COL.text;
      ctx2.font = Math.max(7, 7.5 * fs) + "px 'IBM Plex Mono', monospace";
      var evTag = ev.phase === "read-path" ? "read" : "write";
      ctx2.fillText("L" + (ev.layer + 1) + " " + evTag + " \u2192 " + memLabel(ev.state), x + 11, y + 0.5);
      y += 10;
    }
    if (shown.length === 0) {
      ctx2.fillStyle = COL.muted;
      ctx2.fillText("No accesses yet", x, y);
      y += 10;
    }

    y += 4;
    var barW = panelW - 16;
    var rows = [
      { key: "L1", label: "L1/L2", color: COL.l1, value: counts.L1 },
      { key: "LLC", label: "LLC", color: COL.llc, value: counts.LLC },
      { key: "DRAM", label: "DRAM", color: COL.dram, value: counts.DRAM },
    ];

    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      ctx2.fillStyle = COL.muted;
      ctx2.font = Math.max(7, 7.5 * fs) + "px 'IBM Plex Mono', monospace";
      ctx2.fillText(row.label + " " + row.value, x, y);
      y += 7;
      ctx2.fillStyle = "#f2ece0";
      ctx2.fillRect(x, y, barW, 5);
      var fill = total > 0 ? Math.round((row.value / total) * barW) : 0;
      ctx2.fillStyle = row.color;
      ctx2.fillRect(x, y, fill, 5);
      ctx2.strokeStyle = COL.border;
      ctx2.lineWidth = 0.8;
      ctx2.strokeRect(x, y, barW, 5);
      y += 10;
    }

    y += 2;
    ctx2.fillStyle = COL.muted;
    ctx2.font = Math.max(7, 7.5 * fs) + "px 'IBM Plex Mono', monospace";
    ctx2.fillText("Delay cycles: " + delay, x, y);
  }

  function draw(ctx2, W, H) {
    var mode = currentModeData();
    var sc = safeCycle(mode, cycle);
    var tpuCycle = Math.max(0, Math.min(cycle, TPU_FIN));
    var mob = W < 520;
    var fs = mob ? 0.84 : 1;

    ctx2.clearRect(0, 0, W, H);
    ctx2.fillStyle = COL.bg;
    ctx2.fillRect(0, 0, W, H);

    var padL = 14;
    var padR = 14;
    var labelW = mob ? 90 : 118;
    var doneW = mob ? 44 : 62;
    var memPanelW = mob ? 146 : 214;
    var panelGap = mob ? 6 : 10;
    var arwW = mob ? 8 : 14;
    var stgH = mob ? 38 : 52;
    var tokR = mob ? 8 : 11;
    var rowGap = mob ? 16 : 24;
    var tpuSectionPad = mob ? 10 : 14;
    var titleH = Math.round(16 * fs);

    var tpuY = 6 + titleH;
    var divY = tpuY + stgH + Math.round(rowGap * 0.6) + tpuSectionPad;
    var cpuY = divY + 6 + titleH;
    var startX = padL + labelW;

    var reserved = labelW + doneW + memPanelW + panelGap + 24;
    var availW = W - padL - padR - reserved;
    if (availW < 240) {
      memPanelW = mob ? 132 : 178;
      reserved = labelW + doneW + memPanelW + panelGap + 24;
      availW = W - padL - padR - reserved;
    }

    // ===== TPU row =====
    var tpuSW = (availW - (TPU_N - 1) * arwW) / TPU_N;

    ctx2.fillStyle = COL.text;
    ctx2.font = "bold " + Math.max(10, 12 * fs) + "px 'IBM Plex Mono', monospace";
    ctx2.textAlign = "left";
    ctx2.textBaseline = "middle";
    ctx2.fillText("TPU", padL, tpuY + stgH / 2 - 7 * fs);
    ctx2.fillStyle = COL.muted;
    ctx2.font = Math.max(7, 9 * fs) + "px 'IBM Plex Sans', sans-serif";
    ctx2.fillText("Fused HW dataflow", padL, tpuY + stgH / 2 + 7 * fs);

    var tpuAct = 0;
    for (var l = 0; l < NUM_LAYERS; l++) {
      var ts = tpuStage(tpuCycle, l);
      if (ts >= 0 && ts < TPU_N) tpuAct++;
    }
    ctx2.fillStyle = tpuAct === TPU_N ? COL.done.text : COL.muted;
    ctx2.font = "bold " + Math.max(7, 9 * fs) + "px 'IBM Plex Mono', monospace";
    ctx2.fillText(tpuAct + "/" + TPU_N + " active", padL, tpuY + stgH / 2 + 19 * fs);

    for (var si = 0; si < TPU_N; si++) {
      var sx = startX + si * (tpuSW + arwW);
      var tStg = TPU_STAGES[si];
      var tCol = tStg.type === "buffer" ? COL.buffer : COL.compute;

      roundRect(ctx2, sx, tpuY, tpuSW, stgH, 4);
      ctx2.fillStyle = tCol.bg;
      ctx2.fill();
      ctx2.strokeStyle = tCol.stroke;
      ctx2.lineWidth = 1.4;
      ctx2.stroke();

      ctx2.fillStyle = tCol.text;
      ctx2.font = "bold " + Math.max(7, 9.5 * fs) + "px 'IBM Plex Mono', monospace";
      ctx2.textAlign = "center";
      ctx2.textBaseline = "middle";
      var tLines = (mob ? tStg.short : tStg.name).split("\n");
      var tLH = 11 * fs;
      for (var li = 0; li < tLines.length; li++) {
        ctx2.fillText(tLines[li], sx + tpuSW / 2, tpuY + stgH / 2 + (li - (tLines.length - 1) / 2) * tLH);
      }

      if (si < TPU_N - 1) drawArrow(ctx2, sx + tpuSW + 2, tpuY + stgH / 2, arwW - 4, COL.arrow);

      var tLayers = [];
      for (l = 0; l < NUM_LAYERS; l++) {
        if (tpuStage(tpuCycle, l) === si) tLayers.push(l);
      }
      drawStageTokens(ctx2, tLayers, sx, tpuY, tpuSW, stgH, tokR);
    }

    var tDoneX = startX + availW + 8;
    var tLastX = startX + TPU_N * tpuSW + (TPU_N - 1) * arwW;
    drawArrow(ctx2, tLastX + 2, tpuY + stgH / 2, arwW - 4, COL.arrow);

    ctx2.fillStyle = COL.muted;
    ctx2.font = Math.max(7, 9 * fs) + "px 'IBM Plex Mono', monospace";
    ctx2.textAlign = "center";
    ctx2.fillText("DONE", tDoneX + doneW / 2, tpuY - 2);

    var tDone = 0;
    for (l = 0; l < NUM_LAYERS; l++) {
      if (tpuStage(tpuCycle, l) >= TPU_N) {
        var tdx = tDoneX + (tDone % 2) * (tokR * 2 + 4) + tokR + 2;
        var tdy = tpuY + Math.floor(tDone / 2) * (tokR * 2 + 4) + tokR + 2;
        drawToken(ctx2, tdx, tdy, tokR, l);
        tDone++;
      }
    }
    if (tDone === NUM_LAYERS) {
      ctx2.fillStyle = COL.done.text;
      ctx2.font = "bold " + Math.max(9, 11 * fs) + "px 'IBM Plex Mono', monospace";
      ctx2.fillText(TPU_FIN + " cyc", tDoneX + doneW / 2, tpuY + stgH + 12);
    }

    // ===== Divider =====
    ctx2.save();
    ctx2.setLineDash([4, 4]);
    ctx2.strokeStyle = COL.border;
    ctx2.lineWidth = 1;
    ctx2.beginPath();
    ctx2.moveTo(padL, divY);
    ctx2.lineTo(W - padR, divY);
    ctx2.stroke();
    ctx2.restore();

    // ===== CPU row =====
    var cpuStages = mode.cpuStages;
    var cpuN = cpuStages.length;
    var cpuSW = (availW - (cpuN - 1) * arwW) / cpuN;

    ctx2.fillStyle = COL.text;
    ctx2.font = "bold " + Math.max(10, 12 * fs) + "px 'IBM Plex Mono', monospace";
    ctx2.textAlign = "left";
    ctx2.textBaseline = "middle";
    ctx2.fillText("CPU", padL, cpuY + stgH / 2 - 7 * fs);
    ctx2.fillStyle = COL.muted;
    ctx2.font = Math.max(7, 9 * fs) + "px 'IBM Plex Sans', sans-serif";
    ctx2.fillText(mode.subtitle.replace("CPU ", ""), padL, cpuY + stgH / 2 + 7 * fs);

    var cpuAct = 0;
    for (l = 0; l < NUM_LAYERS; l++) {
      var cst = mode.stageTimeline[sc][l];
      if (cst >= 0 && cst < cpuN) cpuAct++;
    }
    ctx2.fillStyle = COL.muted;
    ctx2.font = "bold " + Math.max(7, 9 * fs) + "px 'IBM Plex Mono', monospace";
    ctx2.fillText(cpuAct + "/" + cpuN + " active", padL, cpuY + stgH / 2 + 19 * fs);

    for (si = 0; si < cpuN; si++) {
      sx = startX + si * (cpuSW + arwW);
      var cStage = cpuStages[si];
      var cCol = cStage.type === "memory" ? COL.memory : COL.compute;

      roundRect(ctx2, sx, cpuY, cpuSW, stgH, 4);
      ctx2.fillStyle = cCol.bg;
      ctx2.fill();
      if (cStage.type === "memory") {
        ctx2.save();
        ctx2.setLineDash([3, 3]);
        ctx2.strokeStyle = cCol.stroke;
        ctx2.lineWidth = 1.4;
        ctx2.stroke();
        ctx2.restore();
      } else {
        ctx2.strokeStyle = cCol.stroke;
        ctx2.lineWidth = 1.4;
        ctx2.stroke();
      }

      ctx2.fillStyle = cCol.text;
      ctx2.font = "bold " + Math.max(7, 9 * fs) + "px 'IBM Plex Mono', monospace";
      ctx2.textAlign = "center";
      ctx2.textBaseline = "middle";
      var cLines = (mob ? cStage.short : cStage.name).split("\n");
      var cLH = 11 * fs;
      for (li = 0; li < cLines.length; li++) {
        ctx2.fillText(cLines[li], sx + cpuSW / 2, cpuY + stgH / 2 + (li - (cLines.length - 1) / 2) * cLH);
      }

      if (si < cpuN - 1) drawArrow(ctx2, sx + cpuSW + 2, cpuY + stgH / 2, arwW - 4, COL.arrow);

      var cLayers = [];
      for (l = 0; l < NUM_LAYERS; l++) {
        if (mode.stageTimeline[sc][l] === si) cLayers.push(l);
      }
      drawStageTokens(ctx2, cLayers, sx, cpuY, cpuSW, stgH, tokR);
    }

    var cDoneX = startX + availW + 8;
    var cLastX = startX + cpuN * cpuSW + (cpuN - 1) * arwW;
    drawArrow(ctx2, cLastX + 2, cpuY + stgH / 2, arwW - 4, COL.arrow);

    ctx2.fillStyle = COL.muted;
    ctx2.font = Math.max(7, 9 * fs) + "px 'IBM Plex Mono', monospace";
    ctx2.textAlign = "center";
    ctx2.fillText("DONE", cDoneX + doneW / 2, cpuY - 2);

    var cDone = 0;
    for (l = 0; l < NUM_LAYERS; l++) {
      if (mode.stageTimeline[sc][l] >= cpuN) {
        var cdx = cDoneX + (cDone % 2) * (tokR * 2 + 4) + tokR + 2;
        var cdy = cpuY + Math.floor(cDone / 2) * (tokR * 2 + 4) + tokR + 2;
        drawToken(ctx2, cdx, cdy, tokR, l);
        cDone++;
      }
    }
    if (cDone === NUM_LAYERS) {
      ctx2.fillStyle = COL.memory.text;
      ctx2.font = "bold " + Math.max(9, 11 * fs) + "px 'IBM Plex Mono', monospace";
      ctx2.fillText(mode.cpuFin + " cyc", cDoneX + doneW / 2, cpuY + stgH + 12);
    }

    // ===== Memory panel =====
    var panelX = cDoneX + doneW + panelGap;
    var panelY = tpuY;
    var panelH = cpuY + stgH + (mob ? 44 : 58) - tpuY;
    drawMemoryPanel(ctx2, mode, panelX, panelY, memPanelW, panelH, sc, fs);

    // ===== Legend =====
    var legGap = mob ? 20 : 32;
    var legY = cpuY + stgH + legGap;
    var legItems = [
      { bg: COL.compute.bg, str: COL.compute.stroke, label: "Compute", dash: false },
      { bg: COL.buffer.bg, str: COL.buffer.stroke, label: "Buffer", dash: false },
      { bg: COL.memory.bg, str: COL.memory.stroke, label: "Memory stage", dash: true },
    ];
    var swW = 12;
    var swH = 10;
    ctx2.font = Math.max(7, 9 * fs) + "px 'IBM Plex Mono', monospace";
    var legGapPx = mob ? 10 : 16;
    var legTotalW = 0;
    for (var i2 = 0; i2 < legItems.length; i2++) {
      legTotalW += swW + 5 + ctx2.measureText(legItems[i2].label).width + (i2 < legItems.length - 1 ? legGapPx : 0);
    }
    var legX = Math.max(padL, (startX + availW + doneW - legTotalW) / 2);
    ctx2.textAlign = "left";
    ctx2.textBaseline = "middle";
    for (i2 = 0; i2 < legItems.length; i2++) {
      var item = legItems[i2];
      ctx2.fillStyle = item.bg;
      ctx2.fillRect(legX, legY - swH / 2, swW, swH);
      if (item.dash) {
        ctx2.save();
        ctx2.setLineDash([2, 2]);
        ctx2.strokeStyle = item.str;
        ctx2.lineWidth = 1;
        ctx2.strokeRect(legX, legY - swH / 2, swW, swH);
        ctx2.restore();
      } else {
        ctx2.strokeStyle = item.str;
        ctx2.lineWidth = 1;
        ctx2.strokeRect(legX, legY - swH / 2, swW, swH);
      }
      ctx2.fillStyle = COL.muted;
      ctx2.fillText(item.label, legX + swW + 5, legY);
      legX += swW + 5 + ctx2.measureText(item.label).width + legGapPx;
    }

    // ===== Status =====
    var statY = legY + 16;
    var maxCyc = getMaxCycle();
    var ratio = (mode.cpuFin / TPU_FIN).toFixed(1);
    ctx2.textAlign = "center";
    ctx2.textBaseline = "middle";

    if (cycle >= maxCyc) {
      ctx2.fillStyle = COL.done.text;
      ctx2.font = "bold " + Math.max(8, 10.5 * fs) + "px 'IBM Plex Sans', sans-serif";
      ctx2.fillText(
        "Complete in this simulation — TPU: " + TPU_FIN + " cyc vs CPU(" + mode.key + "): " + mode.cpuFin + " cyc (" + ratio + "x)",
        W / 2,
        statY
      );
    } else if (tpuCycle >= TPU_FIN) {
      ctx2.fillStyle = COL.done.text;
      ctx2.font = Math.max(8, 10 * fs) + "px 'IBM Plex Sans', sans-serif";
      ctx2.fillText(
        "TPU done in " + TPU_FIN + " cycles — CPU(" + mode.key + ") still processing (cycle " + sc + "/" + mode.cpuFin + ")",
        W / 2,
        statY
      );
    } else {
      ctx2.fillStyle = COL.muted;
      ctx2.font = Math.max(8, 10 * fs) + "px 'IBM Plex Sans', sans-serif";
      ctx2.fillText(
        "Cycle " + sc + " — " + NUM_LAYERS + " layers in flight (CPU mode: " + mode.key + ")",
        W / 2,
        statY
      );
    }
  }

  function getMinHeight(w) {
    var mob = w < 520;
    var fs = mob ? 0.84 : 1;
    var titleH = Math.round(16 * fs);
    var rowGap = mob ? 16 : 24;
    var tpuSectionPad = mob ? 10 : 14;
    var stgH = mob ? 38 : 52;
    var tpuY = 6 + titleH;
    var divY = tpuY + stgH + Math.round(rowGap * 0.6) + tpuSectionPad;
    var cpuY = divY + 6 + titleH;
    var legGap = mob ? 20 : 32;
    var legY = cpuY + stgH + legGap;
    var legendBottom = legY + 8;
    var panelExtra = mob ? 44 : 58;
    var panelBottom = cpuY + stgH + panelExtra;
    var statusLineH = 18;
    return Math.max(panelBottom + 10, legendBottom + statusLineH + 10);
  }

  function resize() {
    var parent = canvas.parentElement;
    var style = getComputedStyle(parent);
    var px = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    var w = parent.clientWidth - px;
    if (w < 10) return;

    var minH = getMinHeight(w);
    var h = Math.max(minH, Math.min(w * 0.33, 250));

    canvas.width = w * devicePixelRatio;
    canvas.height = h * devicePixelRatio;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  function render() {
    var w = canvas.width / devicePixelRatio;
    var h = canvas.height / devicePixelRatio;
    if (w < 10) return;
    draw(ctx, w, h);
  }

  function step() {
    var maxCyc = getMaxCycle();
    if (cycle >= maxCyc) return;
    cycle++;
    updateUI();
    render();
  }

  function play() {
    if (playing) return;
    playing = true;
    if (btnPlay) btnPlay.textContent = "Pause";
    var speed = slider ? parseInt(slider.value, 10) : 4;
    var ms = Math.max(100, 700 - speed * 65);
    intervalId = setInterval(function () {
      if (cycle >= getMaxCycle()) {
        pause();
        return;
      }
      step();
    }, ms);
  }

  function pause() {
    playing = false;
    if (btnPlay) btnPlay.textContent = "Play";
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function reset() {
    pause();
    resetState();
    render();
  }

  function setCpuMode(nextMode) {
    if (nextMode !== "baseline" && nextMode !== "optimized") return;
    if (cpuMode === nextMode) return;
    pause();
    cpuMode = nextMode;
    resetState();
    render();
  }

  // ---- Wire controls ----
  if (btnPlay) btnPlay.addEventListener("click", function () { playing ? pause() : play(); });
  if (btnStep) btnStep.addEventListener("click", function () { pause(); step(); });
  if (btnReset) btnReset.addEventListener("click", reset);
  if (slider) slider.addEventListener("input", function () { if (playing) { pause(); play(); } });
  if (btnCpuBaseline) btnCpuBaseline.addEventListener("click", function () { setCpuMode("baseline"); });
  if (btnCpuOptimized) btnCpuOptimized.addEventListener("click", function () { setCpuMode("optimized"); });

  // ---- Init ----
  modeData.baseline = buildBaselineData();
  modeData.optimized = buildOptimizedData();

  resetState();
  resize();
  render();

  window.addEventListener("resize", function () {
    resize();
    render();
  });
})();
