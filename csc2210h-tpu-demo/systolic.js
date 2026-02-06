// ============================================================
// Systolic Array Simulator — Canvas-based animation
// Visualises an NxN systolic array doing matrix multiply
// C = A × B  where weights B are pre-loaded, activations A
// flow left→right, partial sums accumulate downward.
// ============================================================

(function () {
  "use strict";

  const N = 6; // matrix dimension (keep small for visibility)

  // ---- Colour palette (light retro-hardware) ----
  const C = {
    bg:        "#f9f5ed",
    grid:      "#d4ccbc",
    cell:      "#fffdf8",
    cellActive:"#fef3e0",
    cellDone:  "#e6f5f2",   // light teal tint for completed cells
    weight:    "#b8860b",
    data:      "#1d6fa5",
    partial:   "#c94a1a",
    result:    "#1a7a6d",
    text:      "#2a2520",
    muted:     "#8a7f72",
    arrow:     "#a09585",
    memRead:   "#c94a1a",
    white:     "#2a2520",
  };

  // ---- Generate small integer matrices ----
  function randMat() {
    const m = [];
    for (let i = 0; i < N; i++) {
      m[i] = [];
      for (let j = 0; j < N; j++) m[i][j] = Math.floor(Math.random() * 5) + 1;
    }
    return m;
  }

  let A = randMat(); // activations  (rows feed from left)
  let B = randMat(); // weights      (columns pre-loaded top→bottom)

  // ---- State ----
  let cycle = 0;
  let playing = false;
  let intervalId = null;
  let tpuReads = 0;
  let tpuMacs = 0;
  let cpuReads = 0;
  let cpuMacs = 0;

  // Systolic cells: partial[i][j] accumulates over cycles
  let partial; // NxN accumulator
  let dataInFlight; // tracks which data value is at each cell this cycle

  // CPU state
  let cpuI = 0, cpuJ = 0, cpuK = 0;
  let cpuResult;
  let cpuDone = false;

  // Cell (i,j) is active from cycle i+j to i+j+N-1.
  // The last cell (N-1,N-1) finishes at cycle 2(N-1)+(N-1) = 3(N-1).
  // Total cycles needed = 3(N-1) + 1 = 3N - 2.
  const totalCycles = 3 * N - 2;
  const totalCpuSteps = N * N * N;

  function resetState() {
    A = randMat();
    B = randMat();
    cycle = 0;
    tpuReads = 0;
    tpuMacs = 0;
    cpuReads = 0;
    cpuMacs = 0;
    partial = Array.from({ length: N }, () => new Array(N).fill(0));
    dataInFlight = Array.from({ length: N }, () => new Array(N).fill(null));
    cpuI = 0; cpuJ = 0; cpuK = 0;
    cpuResult = Array.from({ length: N }, () => new Array(N).fill(0));
    cpuDone = false;
    updateCounters();
  }

  // ---- Advance systolic one cycle ----
  function systolicStep() {
    if (cycle >= totalCycles) return;

    const newData = Array.from({ length: N }, () => new Array(N).fill(null));

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        // A cell (i,j) is active at cycle t if t - i - j >= 0 && t - i - j < N
        const k = cycle - i - j;
        if (k >= 0 && k < N) {
          // Activation A[i][k] arrives at cell (i,j) at this cycle
          // Weight B[k][j] is pre-loaded
          partial[i][j] += A[i][k] * B[k][j];
          newData[i][j] = { a: A[i][k], b: B[k][j] };
          tpuMacs++;
          // Count memory reads: activation read once per entry into row
          if (j === 0) tpuReads++; // activation enters from left
          if (i === 0 && cycle === j) tpuReads++; // weight loaded once per column at start (simplified)
        }
      }
    }

    dataInFlight = newData;
    cycle++;
    // Immediately clear cells whose computation just finished so they
    // flip to green on the very next render (not one frame late).
    // Cell (i,j)'s last active cycle is i+j+N-1. Once cycle > that, it's done.
    for (let ci = 0; ci < N; ci++) {
      for (let cj = 0; cj < N; cj++) {
        if (cycle > ci + cj + N - 1) {
          dataInFlight[ci][cj] = null;
        }
      }
    }
    updateCounters();
  }

  // ---- Advance CPU one MAC step ----
  function cpuStep() {
    if (cpuDone) return;
    // CPU reads A[i][k] and B[k][j] each time
    cpuResult[cpuI][cpuJ] += A[cpuI][cpuK] * B[cpuK][cpuJ];
    cpuReads += 2; // one read for A, one for B
    cpuMacs++;

    cpuK++;
    if (cpuK >= N) {
      cpuK = 0;
      cpuJ++;
      if (cpuJ >= N) {
        cpuJ = 0;
        cpuI++;
        if (cpuI >= N) cpuDone = true;
      }
    }
    updateCounters();
  }

  function updateCounters() {
    document.getElementById("cycleNum").textContent = cycle;
    document.getElementById("tpuReads").textContent = tpuReads;
    document.getElementById("tpuMacs").textContent = tpuMacs;
    document.getElementById("cpuReads").textContent = cpuReads;
    document.getElementById("cpuMacs").textContent = cpuMacs;
  }

  // ============================================================
  // Drawing — TPU systolic canvas
  // ============================================================
  function drawSystolic(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);

    const pad = 44;
    const cellSize = Math.min((w - pad * 2) / (N + 2), (h - pad * 2) / (N + 2));
    const gridX = pad + cellSize * 1.5;
    const gridY = pad + cellSize * 1.15;

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);

    // ---- Draw input activations (left side) ----
    ctx.font = `bold ${Math.max(10, cellSize * 0.28)}px 'IBM Plex Mono', monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Label — centered in canvas
    ctx.fillStyle = C.data;
    ctx.font = `bold ${Math.max(10, cellSize * 0.24)}px 'IBM Plex Sans', sans-serif`;
    ctx.fillText("Activations (A)", w / 2, pad * 0.4);

    // Left column: activation values flowing in
    for (let i = 0; i < N; i++) {
      const y = gridY + i * cellSize + cellSize / 2;
      // Show which value is entering this row at current cycle
      const k = cycle - i; // for column 0
      if (k >= 0 && k < N) {
        const x = gridX - cellSize * 0.7;
        ctx.fillStyle = C.data;
        ctx.font = `bold ${Math.max(10, cellSize * 0.3)}px 'IBM Plex Mono', monospace`;
        ctx.fillText(A[i][k], x, y);
        // Arrow
        drawArrow(ctx, x + cellSize * 0.25, y, gridX - 2, y, C.data);
      }
      // Row label
      ctx.fillStyle = C.muted;
      ctx.font = `${Math.max(9, cellSize * 0.2)}px 'IBM Plex Sans', sans-serif`;
      ctx.fillText(`Row ${i}`, gridX - cellSize * 1.2, y);
    }

    // ---- Draw weight labels (top) — centered in canvas ----
    ctx.fillStyle = C.weight;
    ctx.font = `bold ${Math.max(10, cellSize * 0.24)}px 'IBM Plex Sans', sans-serif`;
    ctx.fillText("Weights (B) pre-loaded", w / 2, gridY - cellSize * 0.6);

    // ---- Draw grid cells ----
    // A cell (i,j) is "done" once cycle > i+j+N-1 (its last active k = N-1 occurs at cycle i+j+N-1)
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = gridX + j * cellSize;
        const y = gridY + i * cellSize;

        const d = dataInFlight[i][j];
        const isActive = d !== null;
        const isDone = !isActive && partial[i][j] > 0 && cycle > i + j + N - 1;

        // Cell background
        ctx.fillStyle = isDone ? C.cellDone : (isActive ? C.cellActive : C.cell);
        ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);

        // Cell border
        ctx.strokeStyle = isDone ? C.result : (isActive ? C.partial : C.grid);
        ctx.lineWidth = (isActive || isDone) ? 1.5 : 0.5;
        ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);

        // Weight value (top-left) while active
        const k = cycle - i - j;
        if (k >= 0 && k < N) {
          ctx.fillStyle = C.weight;
          ctx.font = `${Math.max(8, cellSize * 0.18)}px 'IBM Plex Mono', monospace`;
          ctx.fillText(`w=${B[k][j]}`, x + cellSize * 0.28, y + cellSize * 0.22);
        }

        if (isActive) {
          // Show multiply: a × b
          ctx.fillStyle = C.data;
          ctx.font = `bold ${Math.max(9, cellSize * 0.22)}px 'IBM Plex Mono', monospace`;
          ctx.fillText(`${d.a}×${d.b}`, x + cellSize / 2, y + cellSize * 0.48);
          // Show running partial sum
          ctx.fillStyle = C.partial;
          ctx.font = `${Math.max(8, cellSize * 0.18)}px 'IBM Plex Mono', monospace`;
          ctx.fillText(`Σ=${partial[i][j]}`, x + cellSize / 2, y + cellSize * 0.76);
        } else if (isDone) {
          // Cell finished — show final value in green immediately
          ctx.fillStyle = C.result;
          ctx.font = `bold ${Math.max(10, cellSize * 0.28)}px 'IBM Plex Mono', monospace`;
          ctx.fillText(partial[i][j], x + cellSize / 2, y + cellSize / 2);
        }
      }
    }

    // Wavefront indicator line
    if (cycle > 0 && cycle <= totalCycles) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = C.partial;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      // Diagonal line from top-right to bottom-left of active wave
      const startJ = Math.min(cycle, N) - 1;
      const startI = cycle - startJ - 1;
      const endI = Math.min(cycle, N) - 1;
      const endJ = cycle - endI - 1;
      if (startI >= 0 && startJ >= 0 && endI >= 0 && endJ >= 0) {
        ctx.moveTo(gridX + startJ * cellSize + cellSize, gridY + startI * cellSize);
        ctx.lineTo(gridX + endJ * cellSize, gridY + endI * cellSize + cellSize);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Status — centered in canvas, bottom-aligned
    ctx.font = `${Math.max(9, cellSize * 0.19)}px 'IBM Plex Sans', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    if (cycle >= totalCycles) {
      ctx.fillStyle = C.result;
      const extra = cpuDone ? "" : "  (CPU still computing...)";
      ctx.fillText("Done in " + totalCycles + " cycles — C = A \u00D7 B" + extra, w / 2, h - 12);
    } else {
      ctx.fillStyle = C.muted;
      ctx.fillText(`Diagonal wavefront propagating (cycle ${cycle}/${totalCycles})`, w / 2, h - 12);
    }
  }

  // ============================================================
  // Drawing — CPU sequential canvas
  // ============================================================
  function drawCPU(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);

    const pad = 44;
    const cellSize = Math.min((w - pad * 2) / (N + 2), (h - pad * 2) / (N + 2));
    const gridX = (w - N * cellSize) / 2;
    const gridY = pad + cellSize * 1.15;

    // Title — centered in canvas (same top space as TPU so matrices align)
    ctx.fillStyle = C.muted;
    ctx.font = `bold ${Math.max(10, cellSize * 0.24)}px 'IBM Plex Sans', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Result Matrix C (sequential computation)", w / 2, pad * 0.4);

    // Draw result grid
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = gridX + j * cellSize;
        const y = gridY + i * cellSize;

        const isCurrent = !cpuDone && i === cpuI && j === cpuJ;
        const isComplete = (i < cpuI) || (i === cpuI && j < cpuJ) || cpuDone;

        ctx.fillStyle = isCurrent ? C.cellActive : C.cell;
        ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);

        ctx.strokeStyle = isCurrent ? C.memRead : (isComplete ? C.result : C.grid);
        ctx.lineWidth = isCurrent ? 2 : 0.5;
        ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);

        if (isCurrent) {
          // Show current dot-product progress
          ctx.fillStyle = C.memRead;
          ctx.font = `bold ${Math.max(9, cellSize * 0.2)}px 'IBM Plex Mono', monospace`;
          ctx.fillText(`k=${cpuK}/${N}`, x + cellSize / 2, y + cellSize * 0.35);
          ctx.fillStyle = C.data;
          ctx.font = `${Math.max(8, cellSize * 0.18)}px 'IBM Plex Mono', monospace`;
          ctx.fillText(`Σ=${cpuResult[i][j]}`, x + cellSize / 2, y + cellSize * 0.65);

          // Highlight: show memory fetches
          ctx.fillStyle = C.memRead;
          ctx.font = `bold ${Math.max(8, cellSize * 0.16)}px 'IBM Plex Mono', monospace`;
          ctx.fillText(`fetch A[${i}][${cpuK}], B[${cpuK}][${j}]`, x + cellSize / 2, y + cellSize * 0.88);
        } else if (isComplete) {
          ctx.fillStyle = C.result;
          ctx.font = `bold ${Math.max(10, cellSize * 0.28)}px 'IBM Plex Mono', monospace`;
          ctx.fillText(cpuResult[i][j], x + cellSize / 2, y + cellSize / 2);
        }
      }
    }

    // Memory access visualization — centered in canvas
    if (!cpuDone) {
      const infoY = gridY + N * cellSize + cellSize * 0.8;
      ctx.fillStyle = C.memRead;
      ctx.font = `bold ${Math.max(10, cellSize * 0.22)}px 'IBM Plex Sans', sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(`Computing C[${cpuI}][${cpuJ}] — inner product step ${cpuK}`, w / 2, infoY);

      ctx.fillStyle = C.muted;
      ctx.font = `${Math.max(9, cellSize * 0.18)}px 'IBM Plex Sans', sans-serif`;
      ctx.fillText(
        `Every MAC requires 2 memory reads (no data reuse across cells)`,
        w / 2, infoY + cellSize * 0.45
      );
    } else {
      ctx.fillStyle = C.result;
      ctx.font = `${Math.max(9, cellSize * 0.19)}px 'IBM Plex Sans', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("Complete — same result, but far more memory reads", w / 2, h - 12);
    }
  }

  function drawArrow(ctx, x1, y1, x2, y2, color) {
    const headLen = 6;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  // ============================================================
  // Main loop
  // ============================================================
  const canvasTPU = document.getElementById("canvasSystolic");
  const canvasCPU_el = document.getElementById("canvasCPU");
  const ctxTPU = canvasTPU.getContext("2d");
  const ctxCPU = canvasCPU_el.getContext("2d");

  function resizeCanvases() {
    const parent = canvasTPU.parentElement;
    const style = getComputedStyle(parent);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const w = parent.clientWidth - padX;
    if (w < 10) return;
    const h = Math.min(w, 500); // keep roughly square, cap height
    canvasTPU.width = w * devicePixelRatio;
    canvasTPU.height = h * devicePixelRatio;
    canvasTPU.style.width = w + "px";
    canvasTPU.style.height = h + "px";
    ctxTPU.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    const parentCPU = canvasCPU_el.parentElement;
    const styleCPU = getComputedStyle(parentCPU);
    const padXc = parseFloat(styleCPU.paddingLeft) + parseFloat(styleCPU.paddingRight);
    const wc = parentCPU.clientWidth - padXc;
    if (wc < 10) return;
    const hc = Math.min(wc, 500);
    canvasCPU_el.width = wc * devicePixelRatio;
    canvasCPU_el.height = hc * devicePixelRatio;
    canvasCPU_el.style.width = wc + "px";
    canvasCPU_el.style.height = hc + "px";
    ctxCPU.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  function render() {
    const wTPU = canvasTPU.width / devicePixelRatio;
    const hTPU = canvasTPU.height / devicePixelRatio;
    drawSystolic(ctxTPU, wTPU, hTPU);

    const wCPU = canvasCPU_el.width / devicePixelRatio;
    const hCPU = canvasCPU_el.height / devicePixelRatio;
    drawCPU(ctxCPU, wCPU, hCPU);
  }

  function step() {
    // Advance TPU one cycle (if not done)
    if (cycle < totalCycles) {
      systolicStep();
    }
    // Advance CPU one MAC so "inner product step k" updates visibly each frame
    cpuStep();
    render();
  }

  function play() {
    if (playing) return;
    playing = true;
    document.getElementById("btnPlayPause").textContent = "Pause";
    const speed = parseInt(document.getElementById("speedSlider").value);
    const ms = Math.max(80, 600 - speed * 55);
    intervalId = setInterval(() => {
      if (cycle >= totalCycles && cpuDone) {
        pause();
        return;
      }
      step();
    }, ms);
  }

  function pause() {
    playing = false;
    document.getElementById("btnPlayPause").textContent = "Play";
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
  }

  function reset() {
    pause();
    resetState();
    render();
  }

  // ---- Wire controls ----
  document.getElementById("btnPlayPause").addEventListener("click", () => playing ? pause() : play());
  document.getElementById("btnStep").addEventListener("click", () => { pause(); step(); });
  document.getElementById("btnReset").addEventListener("click", reset);
  document.getElementById("speedSlider").addEventListener("input", () => {
    if (playing) { pause(); play(); }
  });

  // ---- Init ----
  resetState();
  resizeCanvases();
  render();

  window.addEventListener("resize", () => { resizeCanvases(); render(); });
})();
