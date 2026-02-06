// ============================================================
// TPU Paper Data — extracted from Tables 1–6, Figures 5–9
// Jouppi et al., "In-Datacenter Performance Analysis of a
// Tensor Processing Unit", ISCA '17
// ============================================================

const DATA = {

  // ----------------------------------------------------------
  // Table 1: Six NN benchmark applications
  // ----------------------------------------------------------
  applications: [
    { name: "MLP0",  type: "MLP",  loc: 100,  layers: 5,  nonlinear: "ReLU",          weights: "20M",  opsPerByte: 200,  batchSize: 200, deployPct: 61, color: "#1565c0" },
    { name: "MLP1",  type: "MLP",  loc: 1000, layers: 4,  nonlinear: "ReLU",          weights: "5M",   opsPerByte: 168,  batchSize: 168, deployPct: 61, color: "#5e35b1" },
    { name: "LSTM0", type: "LSTM", loc: 1000, layers: 58, nonlinear: "sigmoid, tanh", weights: "52M",  opsPerByte: 64,   batchSize: 64,  deployPct: 29, color: "#c94a1a" },
    { name: "LSTM1", type: "LSTM", loc: 1500, layers: 56, nonlinear: "sigmoid, tanh", weights: "34M",  opsPerByte: 96,   batchSize: 96,  deployPct: 29, color: "#ad1457" },
    { name: "CNN0",  type: "CNN",  loc: 1000, layers: 16, nonlinear: "ReLU",          weights: "8M",   opsPerByte: 2888, batchSize: 8,   deployPct: 5,  color: "#2e7d32" },
    { name: "CNN1",  type: "CNN",  loc: 1000, layers: 89, nonlinear: "ReLU",          weights: "100M", opsPerByte: 1750, batchSize: 32,  deployPct: 5,  color: "#00838f" },
  ],

  // ----------------------------------------------------------
  // Table 2: Platform specifications (per die)
  // ----------------------------------------------------------
  platforms: {
    cpu: {
      name: "Haswell CPU",
      shortName: "CPU",
      dieMm2: 662,
      nm: 22,
      mhz: 2300,
      tdpW: 145,
      peakTOPS: 2.6,     // 8-bit equivalent (paper uses FP TOPS 1.3)
      peakFPTOPS: 1.3,
      memBwGBs: 51,
      onChipMiB: 51,
      color: "#78909c",
      diesPerServer: 2,
      serverIdleW: 159,
      serverBusyW: 455,
    },
    gpu: {
      name: "NVIDIA K80 GPU",
      shortName: "GPU",
      dieMm2: 561,
      nm: 28,
      mhz: 560,
      tdpW: 150,
      peakTOPS: 2.8,     // FP TOPS (no 8-bit mode)
      peakFPTOPS: 2.8,
      memBwGBs: 160,
      onChipMiB: 8,
      color: "#66bb6a",
      diesPerServer: 8,
      serverIdleW: 357,
      serverBusyW: 991,
    },
    tpu: {
      name: "Google TPU",
      shortName: "TPU",
      dieMm2: 331,
      nm: 28,
      mhz: 700,
      tdpW: 75,
      peakTOPS: 92,      // 8-bit INT TOPS
      peakFPTOPS: null,
      memBwGBs: 34,
      onChipMiB: 28,
      color: "#ef5350",
      diesPerServer: 4,
      serverIdleW: 290,
      serverBusyW: 384,
    },
  },

  // ----------------------------------------------------------
  // Table 3: TPU performance counter breakdown (%)
  // ----------------------------------------------------------
  tpuCounters: {
    labels: ["MLP0","MLP1","LSTM0","LSTM1","CNN0","CNN1"],
    arrayActive:   [12.7, 10.6, 8.2,  10.5, 78.2, 46.2],
    usefulMACs:    [12.5,  9.4, 8.2,   6.3, 78.2, 22.5],
    unusedMACs:    [ 0.3,  1.2, 0.0,   4.2,  0.0, 23.7],
    weightStall:   [53.9, 44.2, 58.1, 62.1,  0.0, 28.1],
    weightShift:   [15.9, 13.4, 15.8, 17.1,  0.0,  7.0],
    nonMatrix:     [17.5, 31.9, 17.9, 10.3, 21.8, 18.7],
    rawStalls:     [ 3.3,  8.4, 14.6, 10.6,  3.5, 22.8],
    inputStalls:   [ 6.1,  8.8,  5.1,  2.4,  3.4,  0.6],
    teraOps:       [12.3,  9.7,  3.7,  2.8, 86.0, 14.1],
  },

  // ----------------------------------------------------------
  // Table 4: MLP0 latency vs throughput
  // ----------------------------------------------------------
  latencyThroughput: [
    { type: "CPU", batch: 16,  latencyMs: 7.2,  ips: 5482,   pctMax: 42 },
    { type: "CPU", batch: 64,  latencyMs: 21.3, ips: 13194,  pctMax: 100 },
    { type: "GPU", batch: 16,  latencyMs: 6.7,  ips: 13461,  pctMax: 37 },
    { type: "GPU", batch: 64,  latencyMs: 8.3,  ips: 36465,  pctMax: 100 },
    { type: "TPU", batch: 200, latencyMs: 7.0,  ips: 225000, pctMax: 80 },
    { type: "TPU", batch: 250, latencyMs: 10.0, ips: 280000, pctMax: 100 },
  ],

  // ----------------------------------------------------------
  // Table 6: Relative performance per die (vs CPU = 1.0)
  // ----------------------------------------------------------
  relativePerf: {
    apps: ["MLP0","MLP1","LSTM0","LSTM1","CNN0","CNN1"],
    cpu:  [1.0,   1.0,   1.0,    1.0,    1.0,   1.0  ],
    gpu:  [2.5,   0.3,   0.4,    1.2,    1.6,   2.7  ],
    tpu:  [41.0, 18.5,   3.5,    1.2,   40.3,  71.0  ],
    geoMean:      { gpu: 1.1,  tpu: 14.5 },
    weightedMean: { gpu: 1.9,  tpu: 29.2 },
  },

  // ----------------------------------------------------------
  // Figure 9: Performance / Watt relative to CPU
  // ----------------------------------------------------------
  perfPerWatt: {
    // Total (includes host server power)
    total: {
      geoMean:      { gpu: 1.2,  tpu: 17,  tpuPrime: 31 },
      weightedMean: { gpu: 2.1,  tpu: 34,  tpuPrime: 86 },
    },
    // Incremental (excludes host server power)
    incremental: {
      geoMean:      { gpu: 1.7,  tpu: 41,  tpuPrime: 69  },
      weightedMean: { gpu: 2.9,  tpu: 83,  tpuPrime: 196 },
    },
  },

  // ----------------------------------------------------------
  // Die area breakdown (Figure 2) — approximate percentages
  // ----------------------------------------------------------
  dieArea: {
    tpu: [
      { label: "Matrix Multiply Unit", pct: 24, color: "#c94a1a" },
      { label: "Unified Buffer (24 MiB)", pct: 29, color: "#1565c0" },
      { label: "Accumulators (4 MiB)", pct: 6, color: "#2e7d32" },
      { label: "Activation / Pool", pct: 4, color: "#7b1fa2" },
      { label: "Weight FIFO + Mem", pct: 4, color: "#c62828" },
      { label: "I/O (PCIe, etc.)", pct: 10, color: "#00838f" },
      { label: "Control", pct: 2, color: "#e65100" },
      { label: "Other datapath", pct: 21, color: "#607d8b" },
    ],
    cpuGpu: [
      { label: "Compute (ALUs / SMs)", pct: 30, color: "#2e7d32" },
      { label: "Cache hierarchy", pct: 25, color: "#1565c0" },
      { label: "Control (branch pred, OoO)", pct: 25, color: "#c94a1a" },
      { label: "I/O & Memory", pct: 10, color: "#00838f" },
      { label: "Other", pct: 10, color: "#607d8b" },
    ],
  },

  // ----------------------------------------------------------
  // Roofline model: measured TOPS per die for each app
  // ----------------------------------------------------------
  measuredTOPS: {
    tpu: { MLP0: 12.3, MLP1: 9.7, LSTM0: 3.7, LSTM1: 2.8, CNN0: 86.0, CNN1: 14.1 },
    // GPU and CPU measured from the relative perf + known TPU TOPS
    // We approximate using roofline positions from the paper figures
    gpu: { MLP0: 0.75, MLP1: 0.16, LSTM0: 0.42, LSTM1: 0.70, CNN0: 2.15, CNN1: 0.54 },
    cpu: { MLP0: 0.30, MLP1: 0.52, LSTM0: 1.06, LSTM1: 0.58, CNN0: 1.34, CNN1: 0.20 },
  },

  // ----------------------------------------------------------
  // Roofline ridge points (ops per byte at knee)
  // ----------------------------------------------------------
  ridgePoints: {
    cpu: 51,    // peakTOPS / memBw ≈ 2600/51 ≈ 51 — paper says ~13 MAC ops/byte
    gpu: 18,    // 2800/160 ≈ 17.5
    tpu: 1350,  // 92000/34 ≈ 2706 — paper says 1350 (MAC pairs count)
  },
};
