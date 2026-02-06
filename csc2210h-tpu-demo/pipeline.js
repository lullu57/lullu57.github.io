// ============================================================
// VPU Pipeline Simulator — Canvas-based animation
// Shows TPU's fused hardware pipeline vs CPU's sequential
// kernel approach for processing neural network layers.
// Inspired by Tiny TPU's VPU pipeline concept (tinytpu.com).
// ============================================================

(function () {
  "use strict";

  // ---- Configuration ----
  var NUM_LAYERS = 4;

  // TPU: fused in hardware — no memory round-trips between stages
  var TPU_STAGES = [
    { name: "Matrix\nMultiply", short: "MatMul", type: "compute" },
    { name: "Accumu-\nlators",  short: "Accum",  type: "buffer"  },
    { name: "Activation\n(ReLU)", short: "Act",   type: "compute" },
    { name: "Normalize\n/ Pool",  short: "Norm",  type: "compute" },
  ];

  // CPU: separate kernel launches with memory round-trips
  var CPU_STAGES = [
    { name: "MatMul\nKernel",     short: "MatMul", type: "compute" },
    { name: "Memory\nWrite/Read", short: "Mem",    type: "memory"  },
    { name: "Activate\nKernel",   short: "Act",    type: "compute" },
    { name: "Memory\nWrite/Read", short: "Mem",    type: "memory"  },
    { name: "Norm/Pool\nKernel",  short: "Norm",   type: "compute" },
  ];

  var TPU_N   = TPU_STAGES.length;                    // 4
  var CPU_N   = CPU_STAGES.length;                    // 5
  var TPU_FIN = NUM_LAYERS + TPU_N - 1;               // 7
  var CPU_FIN = NUM_LAYERS * CPU_N;                    // 20
  var MAX_CYC = CPU_FIN;

  // ---- Colour palette (matches retro-futurist light theme) ----
  var COL = {
    bg:      "#f9f5ed",
    text:    "#2a2520",
    muted:   "#8a7f72",
    border:  "#c8bfad",
    arrow:   "#a09585",
    compute: { bg: "#ffe0b2", stroke: "#ffcc80", text: "#e65100" },
    buffer:  { bg: "#bbdefb", stroke: "#90caf9", text: "#1565c0" },
    memory:  { bg: "#ffcdd2", stroke: "#ef9a9a", text: "#b71c1c" },
    done:    { bg: "#e6f5f2", stroke: "#1a7a6d", text: "#1a7a6d" },
    layers:  ["#c94a1a", "#1a7a6d", "#1d6fa5", "#b8860b"],
  };

  // ---- State ----
  var cycle     = 0;
  var playing   = false;
  var intervalId = null;

  // ---- Helpers: which stage is layer l at on cycle c? ----
  function tpuStage(c, l) {
    var s = c - l;
    return s < 0 ? -1 : s >= TPU_N ? TPU_N : s;
  }
  function cpuStage(c, l) {
    var s = c - l * CPU_N;
    return s < 0 ? -1 : s >= CPU_N ? CPU_N : s;
  }

  function resetState() { cycle = 0; updateUI(); }

  function updateUI() {
    var el = document.getElementById("pipeCycleNum");
    if (el) el.textContent = cycle;
  }

  // ---- Drawing primitives ----
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function drawArrow(ctx, x, y, len, color) {
    var hl = 5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len - hl, y);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + len, y);
    ctx.lineTo(x + len - hl, y - 3.5);
    ctx.lineTo(x + len - hl, y + 3.5);
    ctx.closePath();
    ctx.fill();
  }

  function drawToken(ctx, cx, cy, r, layerIdx) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = COL.layers[layerIdx];
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold " + Math.max(8, r * 0.85) + "px 'IBM Plex Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("L" + (layerIdx + 1), cx, cy + 0.5);
  }

  // ---- Main draw ----
  function draw(ctx, W, H) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, W, H);

    var mob    = W < 450;
    var fs     = mob ? 0.8 : 1;
    var padL   = 16;
    var padR   = 16;
    var labelW = mob ? 52 : 82;
    var doneW  = mob ? 52 : 78;
    var arwW   = mob ? 8 : 14;
    var stgH   = mob ? 40 : 52;
    var tokR   = mob ? 9 : 12;
    var rowGap = mob ? 18 : 26;
    var titleH = Math.round(16 * fs);

    var tpuY  = 6 + titleH;
    var divY  = tpuY + stgH + Math.round(rowGap * 0.6);
    var cpuY  = divY + 6 + titleH;
    var startX = padL + labelW;
    var availW = W - padL - padR - labelW - doneW;

    // ===== TPU Row =====
    var tpuSW = (availW - (TPU_N - 1) * arwW) / TPU_N;

    // Row label
    ctx.fillStyle = COL.text;
    ctx.font = "bold " + Math.max(10, 12 * fs) + "px 'IBM Plex Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("TPU", padL, tpuY + stgH / 2 - 7 * fs);
    ctx.fillStyle = COL.muted;
    ctx.font = Math.max(7, 9 * fs) + "px 'IBM Plex Sans', sans-serif";
    ctx.fillText("Fused HW", padL, tpuY + stgH / 2 + 7 * fs);

    // Active-stage count
    var tpuAct = 0;
    for (var l = 0; l < NUM_LAYERS; l++) {
      var st = tpuStage(cycle, l);
      if (st >= 0 && st < TPU_N) tpuAct++;
    }
    ctx.fillStyle = tpuAct === TPU_N ? COL.done.text : COL.muted;
    ctx.font = "bold " + Math.max(7, 9 * fs) + "px 'IBM Plex Mono', monospace";
    ctx.fillText(tpuAct + "/" + TPU_N + " active", padL, tpuY + stgH / 2 + 19 * fs);

    // Stages + tokens
    for (var si = 0; si < TPU_N; si++) {
      var sx  = startX + si * (tpuSW + arwW);
      var stg = TPU_STAGES[si];
      var col = stg.type === "buffer" ? COL.buffer : COL.compute;

      roundRect(ctx, sx, tpuY, tpuSW, stgH, 4);
      ctx.fillStyle = col.bg; ctx.fill();
      ctx.strokeStyle = col.stroke; ctx.lineWidth = 1.5; ctx.stroke();

      // Label
      ctx.fillStyle = col.text;
      ctx.font = "bold " + Math.max(7, 9.5 * fs) + "px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      var lines = (mob ? stg.short : stg.name).split("\n");
      var lh = 11 * fs;
      for (var li = 0; li < lines.length; li++) {
        ctx.fillText(lines[li], sx + tpuSW / 2,
          tpuY + stgH / 2 + (li - (lines.length - 1) / 2) * lh);
      }

      if (si < TPU_N - 1) drawArrow(ctx, sx + tpuSW + 2, tpuY + stgH / 2, arwW - 4, COL.arrow);

      // Token
      for (var l = 0; l < NUM_LAYERS; l++) {
        if (tpuStage(cycle, l) === si) {
          drawToken(ctx, sx + tpuSW / 2, tpuY + stgH / 2, tokR, l);
        }
      }
    }

    // Arrow to Done
    var lastTpuX = startX + TPU_N * tpuSW + (TPU_N - 1) * arwW;
    drawArrow(ctx, lastTpuX + 2, tpuY + stgH / 2, arwW - 4, COL.arrow);

    // Done area
    var doneX = startX + availW + 8;
    ctx.fillStyle = COL.muted;
    ctx.font = Math.max(7, 9 * fs) + "px 'IBM Plex Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText("DONE", doneX + doneW / 2, tpuY - 2);

    var tpuDn = 0;
    for (var l = 0; l < NUM_LAYERS; l++) {
      if (tpuStage(cycle, l) >= TPU_N) {
        var dx = doneX + (tpuDn % 2) * (tokR * 2 + 4) + tokR + 2;
        var dy = tpuY + Math.floor(tpuDn / 2) * (tokR * 2 + 4) + tokR + 2;
        drawToken(ctx, dx, dy, tokR, l);
        tpuDn++;
      }
    }
    if (tpuDn === NUM_LAYERS) {
      ctx.fillStyle = COL.done.text;
      ctx.font = "bold " + Math.max(9, 11 * fs) + "px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(TPU_FIN + " cyc", doneX + doneW / 2, tpuY + stgH + 12);
    }

    // ===== Divider =====
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = COL.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, divY); ctx.lineTo(W - padR, divY); ctx.stroke();
    ctx.restore();

    // ===== CPU Row =====
    var cpuSW = (availW - (CPU_N - 1) * arwW) / CPU_N;

    ctx.fillStyle = COL.text;
    ctx.font = "bold " + Math.max(10, 12 * fs) + "px 'IBM Plex Mono', monospace";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText("CPU", padL, cpuY + stgH / 2 - 7 * fs);
    ctx.fillStyle = COL.muted;
    ctx.font = Math.max(7, 9 * fs) + "px 'IBM Plex Sans', sans-serif";
    ctx.fillText("Sequential", padL, cpuY + stgH / 2 + 7 * fs);

    var cpuAct = 0;
    for (var l = 0; l < NUM_LAYERS; l++) {
      var st = cpuStage(cycle, l);
      if (st >= 0 && st < CPU_N) cpuAct++;
    }
    ctx.fillStyle = COL.muted;
    ctx.font = "bold " + Math.max(7, 9 * fs) + "px 'IBM Plex Mono', monospace";
    ctx.fillText(cpuAct + "/" + CPU_N + " active", padL, cpuY + stgH / 2 + 19 * fs);

    for (var si = 0; si < CPU_N; si++) {
      var sx  = startX + si * (cpuSW + arwW);
      var stg = CPU_STAGES[si];
      var col = stg.type === "memory" ? COL.memory : COL.compute;

      roundRect(ctx, sx, cpuY, cpuSW, stgH, 4);
      ctx.fillStyle = col.bg; ctx.fill();
      if (stg.type === "memory") {
        ctx.save(); ctx.setLineDash([3, 3]);
        ctx.strokeStyle = col.stroke; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
      } else {
        ctx.strokeStyle = col.stroke; ctx.lineWidth = 1.5; ctx.stroke();
      }

      ctx.fillStyle = col.text;
      ctx.font = "bold " + Math.max(7, 9 * fs) + "px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      var lines = (mob ? stg.short : stg.name).split("\n");
      var lh = 11 * fs;
      for (var li = 0; li < lines.length; li++) {
        ctx.fillText(lines[li], sx + cpuSW / 2,
          cpuY + stgH / 2 + (li - (lines.length - 1) / 2) * lh);
      }

      if (si < CPU_N - 1) drawArrow(ctx, sx + cpuSW + 2, cpuY + stgH / 2, arwW - 4, COL.arrow);

      for (var l = 0; l < NUM_LAYERS; l++) {
        if (cpuStage(cycle, l) === si) {
          drawToken(ctx, sx + cpuSW / 2, cpuY + stgH / 2, tokR, l);
        }
      }
    }

    // Arrow to Done
    var lastCpuX = startX + CPU_N * cpuSW + (CPU_N - 1) * arwW;
    drawArrow(ctx, lastCpuX + 2, cpuY + stgH / 2, arwW - 4, COL.arrow);

    ctx.fillStyle = COL.muted;
    ctx.font = Math.max(7, 9 * fs) + "px 'IBM Plex Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText("DONE", doneX + doneW / 2, cpuY - 2);

    var cpuDn = 0;
    for (var l = 0; l < NUM_LAYERS; l++) {
      if (cpuStage(cycle, l) >= CPU_N) {
        var dx = doneX + (cpuDn % 2) * (tokR * 2 + 4) + tokR + 2;
        var dy = cpuY + Math.floor(cpuDn / 2) * (tokR * 2 + 4) + tokR + 2;
        drawToken(ctx, dx, dy, tokR, l);
        cpuDn++;
      }
    }
    if (cpuDn === NUM_LAYERS) {
      ctx.fillStyle = COL.memory.text;
      ctx.font = "bold " + Math.max(9, 11 * fs) + "px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(CPU_FIN + " cyc", doneX + doneW / 2, cpuY + stgH + 12);
    }

    // ===== Legend bar =====
    var legY = cpuY + stgH + 28;
    var legItems = [
      { bg: COL.compute.bg, str: COL.compute.stroke, label: "Compute", dash: false },
      { bg: COL.buffer.bg,  str: COL.buffer.stroke,  label: "Buffer",  dash: false },
      { bg: COL.memory.bg,  str: COL.memory.stroke,  label: "Mem overhead", dash: true },
    ];
    var legX = padL + labelW;
    ctx.textAlign = "left";
    for (var i = 0; i < legItems.length; i++) {
      var it = legItems[i];
      var swW = 12, swH = 10;
      ctx.fillStyle = it.bg;
      ctx.fillRect(legX, legY - swH / 2, swW, swH);
      if (it.dash) {
        ctx.save(); ctx.setLineDash([2, 2]);
        ctx.strokeStyle = it.str; ctx.lineWidth = 1;
        ctx.strokeRect(legX, legY - swH / 2, swW, swH);
        ctx.restore();
      } else {
        ctx.strokeStyle = it.str; ctx.lineWidth = 1;
        ctx.strokeRect(legX, legY - swH / 2, swW, swH);
      }
      ctx.fillStyle = COL.muted;
      ctx.font = Math.max(7, 9 * fs) + "px 'IBM Plex Mono', monospace";
      ctx.textBaseline = "middle";
      ctx.fillText(it.label, legX + swW + 5, legY);
      legX += swW + 5 + ctx.measureText(it.label).width + (mob ? 10 : 18);
    }

    // ===== Status bar =====
    var statY = H - 8;
    ctx.textAlign = "left";
    if (cycle >= MAX_CYC) {
      ctx.fillStyle = COL.done.text;
      ctx.font = "bold " + Math.max(9, 11 * fs) + "px 'IBM Plex Sans', sans-serif";
      var msg = mob
        ? "TPU: " + TPU_FIN + " cyc  vs  CPU: " + CPU_FIN + " cyc  (" + (CPU_FIN / TPU_FIN).toFixed(1) + "\u00d7)"
        : "Complete \u2014 TPU: " + TPU_FIN + " cycles  vs  CPU: " + CPU_FIN + " cycles  (" + (CPU_FIN / TPU_FIN).toFixed(1) + "\u00d7 speedup)  \u2014  2 of 5 CPU stages are memory overhead";
      ctx.fillText(msg, padL, statY);
    } else if (cycle >= TPU_FIN) {
      ctx.fillStyle = COL.done.text;
      ctx.font = Math.max(9, 11 * fs) + "px 'IBM Plex Sans', sans-serif";
      ctx.fillText("TPU done in " + TPU_FIN + " cycles \u2014 CPU still processing (cycle " + cycle + "/" + CPU_FIN + ")", padL, statY);
    } else {
      ctx.fillStyle = COL.muted;
      ctx.font = Math.max(9, 11 * fs) + "px 'IBM Plex Sans', sans-serif";
      ctx.fillText("Cycle " + cycle + " \u2014 " + NUM_LAYERS + " layers flowing through pipeline", padL, statY);
    }
  }

  // ============================================================
  // Canvas setup & rendering
  // ============================================================
  var canvas = document.getElementById("canvasPipeline");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");

  function resize() {
    var parent = canvas.parentElement;
    var style  = getComputedStyle(parent);
    var px = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    var w  = parent.clientWidth - px;
    if (w < 10) return;
    var h = Math.max(210, Math.min(w * 0.4, 300));
    canvas.width  = w * devicePixelRatio;
    canvas.height = h * devicePixelRatio;
    canvas.style.width  = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  function render() {
    var w = canvas.width  / devicePixelRatio;
    var h = canvas.height / devicePixelRatio;
    if (w < 10) return;
    draw(ctx, w, h);
  }

  function step() {
    if (cycle >= MAX_CYC) return;
    cycle++;
    updateUI();
    render();
  }

  function play() {
    if (playing) return;
    playing = true;
    var btn = document.getElementById("btnPipePlay");
    if (btn) btn.textContent = "Pause";
    var speed = 4;
    var sl = document.getElementById("pipeSpeedSlider");
    if (sl) speed = parseInt(sl.value);
    var ms = Math.max(100, 700 - speed * 65);
    intervalId = setInterval(function () {
      if (cycle >= MAX_CYC) { pause(); return; }
      step();
    }, ms);
  }

  function pause() {
    playing = false;
    var btn = document.getElementById("btnPipePlay");
    if (btn) btn.textContent = "Play";
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
  }

  function reset() { pause(); resetState(); render(); }

  // ---- Wire controls ----
  var btnPlay  = document.getElementById("btnPipePlay");
  var btnStep  = document.getElementById("btnPipeStep");
  var btnReset = document.getElementById("btnPipeReset");
  var slider   = document.getElementById("pipeSpeedSlider");

  if (btnPlay)  btnPlay.addEventListener("click",  function () { playing ? pause() : play(); });
  if (btnStep)  btnStep.addEventListener("click",  function () { pause(); step(); });
  if (btnReset) btnReset.addEventListener("click", reset);
  if (slider)   slider.addEventListener("input",   function () { if (playing) { pause(); play(); } });

  // ---- Init ----
  resetState();
  resize();
  render();
  window.addEventListener("resize", function () { resize(); render(); });
})();
