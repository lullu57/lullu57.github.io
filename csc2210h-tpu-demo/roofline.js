// ============================================================
// Interactive Roofline Model — D3.js
// Log-log plot with three processor rooflines overlaid,
// six NN application dots, memory-bandwidth slider for TPU'.
// ============================================================

(function () {
  "use strict";

  const container = document.getElementById("rooflineChart");
  const tip = document.getElementById("rooflineTip");

  // ---- Dimensions ----
  const margin = { top: 30, right: 30, bottom: 55, left: 65 };
  let width, height;

  const svg = d3.select(container).append("svg");
  const g = svg.append("g");

  // ---- Scales (log-log) ----
  const xScale = d3.scaleLog();
  const yScale = d3.scaleLog();

  // ---- Axis generators ----
  const xAxis = d3.axisBottom(xScale)
    .ticks(8, ".0f")
    .tickSizeOuter(0);
  const yAxis = d3.axisLeft(yScale)
    .ticks(6, ".1f")
    .tickSizeOuter(0);

  const gX = g.append("g").attr("class", "x-axis");
  const gY = g.append("g").attr("class", "y-axis");

  // Axis labels
  const xLabel = svg.append("text")
    .attr("text-anchor", "middle")
    .attr("fill", "#5c5347")
    .attr("font-size", 11)
    .attr("font-family", "'IBM Plex Mono', monospace");
  const yLabel = svg.append("text")
    .attr("text-anchor", "middle")
    .attr("fill", "#5c5347")
    .attr("font-size", 11)
    .attr("font-family", "'IBM Plex Mono', monospace")
    .attr("transform", "rotate(-90)");

  // ---- Chip data (light retro-hardware palette) ----
  const chips = [
    { key: "cpu", name: "Haswell CPU", peakTOPS: 2.6,  memBw: 51,  color: "#607d8b", togId: "togCPU" },
    { key: "gpu", name: "K80 GPU",     peakTOPS: 2.8,  memBw: 160, color: "#2e7d32", togId: "togGPU" },
    { key: "tpu", name: "TPU",         peakTOPS: 92,   memBw: 34,  color: "#c94a1a", togId: "togTPU" },
  ];

  // The applications with their operational intensity (ops/byte) and measured TOPS per chip
  const apps = DATA.applications.map(a => ({
    name: a.name,
    type: a.type,
    opsPerByte: a.opsPerByte,
    color: a.color,
    tpu: DATA.measuredTOPS.tpu[a.name],
    gpu: DATA.measuredTOPS.gpu[a.name],
    cpu: DATA.measuredTOPS.cpu[a.name],
  }));

  // ---- Build roofline path for a chip ----
  function rooflinePath(peakTOPS, memBw, xS, yS) {
    // Roofline: min(peak, memBw * opsPerByte)
    const xMin = xS.domain()[0];
    const xMax = xS.domain()[1];
    const ridge = peakTOPS / memBw * 1e3; // ops/byte at knee  (TOPS / (GB/s) = 1e3 ops/byte)
    // Actually: TOPS = peakTOPS when opsPerByte >= ridge
    //           TOPS = memBw * opsPerByte / 1e3 when opsPerByte < ridge
    // But memBw is in GB/s and TOPS is Tera-ops/s, opsPerByte is ops/byte
    // TOPS_achievable = memBw_GB/s * opsPerByte * 1e9 / 1e12 = memBw * opsPerByte / 1e3
    const points = [];
    const nPts = 200;
    for (let i = 0; i <= nPts; i++) {
      const logX = Math.log10(xMin) + (Math.log10(xMax) - Math.log10(xMin)) * i / nPts;
      const x = Math.pow(10, logX);
      const y = Math.min(peakTOPS, memBw * x / 1e3);
      points.push([xS(x), yS(Math.max(y, yS.domain()[0]))]);
    }
    return d3.line()(points);
  }

  // ---- Groups for roofline paths and dots ----
  const rooflineGroup = g.append("g");
  const dotsGroup = g.append("g");
  const labelsGroup = g.append("g");

  // Ridge-point annotation group
  const ridgeGroup = g.append("g");

  // ---- Render ----
  function render() {
    const containerW = container.clientWidth;
    if (containerW < 10) return; // panel not visible yet
    width = containerW - margin.left - margin.right;
    height = Math.min(420, containerW * 0.5) - margin.top - margin.bottom;

    svg.attr("width", width + margin.left + margin.right)
       .attr("height", height + margin.top + margin.bottom);
    g.attr("transform", `translate(${margin.left},${margin.top})`);

    // Domains
    xScale.domain([5, 5000]).range([0, width]);
    yScale.domain([0.05, 150]).range([height, 0]);

    // Axes
    gX.attr("transform", `translate(0,${height})`).call(xAxis);
    gY.call(yAxis);

    // Style axes
    svg.selectAll(".x-axis text, .y-axis text")
      .attr("fill", "#8a7f72").attr("font-size", 10).attr("font-family", "'IBM Plex Mono', monospace");
    svg.selectAll(".x-axis line, .y-axis line, .x-axis path, .y-axis path")
      .attr("stroke", "#c8bfad");

    // Axis labels
    xLabel
      .attr("x", margin.left + width / 2)
      .attr("y", margin.top + height + 44)
      .text("Operational Intensity (ops / weight byte)");
    yLabel
      .attr("x", -(margin.top + height / 2))
      .attr("y", 16)
      .text("Performance (TOPS)");

    // Grid lines
    g.selectAll(".gridline").remove();
    yScale.ticks(6).forEach(t => {
      g.append("line").attr("class", "gridline")
        .attr("x1", 0).attr("x2", width)
        .attr("y1", yScale(t)).attr("y2", yScale(t))
        .attr("stroke", "#ddd6c8").attr("stroke-width", 0.5);
    });

    // ---- TPU memory bandwidth from slider ----
    const tpuMemBw = parseInt(document.getElementById("memBwSlider").value);

    // Update chips[2] (TPU) memBw for drawing
    chips[2].memBw = tpuMemBw;

    // ---- Draw rooflines ----
    rooflineGroup.selectAll("*").remove();
    ridgeGroup.selectAll("*").remove();

    chips.forEach(chip => {
      const visible = document.getElementById(chip.togId).checked;
      if (!visible) return;

      // Roofline path
      rooflineGroup.append("path")
        .attr("d", rooflinePath(chip.peakTOPS, chip.memBw, xScale, yScale))
        .attr("fill", "none")
        .attr("stroke", chip.color)
        .attr("stroke-width", chip.key === "tpu" ? 2.5 : 1.8)
        .attr("stroke-dasharray", chip.key === "tpu" && tpuMemBw !== 34 ? "6,3" : "none")
        .attr("opacity", 0.85);

      // Ridge point annotation
      const ridge = chip.peakTOPS / chip.memBw * 1e3;
      if (ridge >= xScale.domain()[0] && ridge <= xScale.domain()[1]) {
        ridgeGroup.append("circle")
          .attr("cx", xScale(ridge))
          .attr("cy", yScale(chip.peakTOPS))
          .attr("r", 3)
          .attr("fill", chip.color)
          .attr("opacity", 0.6);

        ridgeGroup.append("text")
          .attr("x", xScale(ridge))
          .attr("y", yScale(chip.peakTOPS) - 8)
          .attr("text-anchor", "middle")
          .attr("fill", chip.color)
          .attr("font-size", 9)
          .attr("opacity", 0.7)
          .text(`${chip.name} (ridge: ${Math.round(ridge)})`);
      }

      // Peak label on the right
      const peakY = yScale(chip.peakTOPS);
      if (peakY > 5) {
        rooflineGroup.append("text")
          .attr("x", width - 4)
          .attr("y", peakY - 5)
          .attr("text-anchor", "end")
          .attr("fill", chip.color)
          .attr("font-size", 9)
          .attr("opacity", 0.7)
          .text(`${chip.peakTOPS} TOPS`);
      }
    });

    // ---- Draw application dots ----
    dotsGroup.selectAll("*").remove();
    labelsGroup.selectAll("*").remove();

    apps.forEach(app => {
      // For each visible chip, draw a dot for this app
      chips.forEach(chip => {
        const visible = document.getElementById(chip.togId).checked;
        if (!visible) return;

        let measuredTOPS;
        if (chip.key === "tpu") {
          // If memory BW changed, scale the memory-bound apps
          const origMemBw = 34;
          const origTOPS = app.tpu;
          const ridgeOrig = 92 / origMemBw * 1e3; // ~2706
          if (app.opsPerByte < ridgeOrig) {
            // Memory bound: performance scales with memory BW
            measuredTOPS = Math.min(92, origTOPS * (tpuMemBw / origMemBw));
          } else {
            measuredTOPS = origTOPS;
          }
        } else {
          measuredTOPS = app[chip.key];
        }

        const cx = xScale(app.opsPerByte);
        const cy = yScale(measuredTOPS);

        const shape = chip.key === "tpu" ? "star" : chip.key === "gpu" ? "triangle" : "circle";

        if (shape === "star") {
          dotsGroup.append("path")
            .attr("d", d3.symbol().type(d3.symbolStar).size(120)())
            .attr("transform", `translate(${cx},${cy})`)
            .attr("fill", app.color)
            .attr("stroke", "#fffdf8")
            .attr("stroke-width", 1)
            .attr("cursor", "pointer")
            .on("mouseenter", (e) => showTip(e, app, chip, measuredTOPS))
            .on("mouseleave", hideTip);
        } else if (shape === "triangle") {
          dotsGroup.append("path")
            .attr("d", d3.symbol().type(d3.symbolTriangle).size(100)())
            .attr("transform", `translate(${cx},${cy})`)
            .attr("fill", app.color)
            .attr("stroke", "#fffdf8")
            .attr("stroke-width", 1)
            .attr("cursor", "pointer")
            .on("mouseenter", (e) => showTip(e, app, chip, measuredTOPS))
            .on("mouseleave", hideTip);
        } else {
          dotsGroup.append("circle")
            .attr("cx", cx).attr("cy", cy).attr("r", 5)
            .attr("fill", app.color)
            .attr("stroke", "#fffdf8")
            .attr("stroke-width", 1)
            .attr("cursor", "pointer")
            .on("mouseenter", (e) => showTip(e, app, chip, measuredTOPS))
            .on("mouseleave", hideTip);
        }

        // Label (only for TPU to avoid clutter)
        if (chip.key === "tpu") {
          labelsGroup.append("text")
            .attr("x", cx + 8)
            .attr("y", cy - 6)
            .attr("fill", app.color)
            .attr("font-size", 10)
            .attr("font-weight", 500)
            .text(app.name);
        }
      });
    });

    // Legend for shapes
    const legendData = [
      { label: "TPU (star)", shape: d3.symbolStar, color: "#c94a1a" },
      { label: "GPU (triangle)", shape: d3.symbolTriangle, color: "#2e7d32" },
      { label: "CPU (circle)", shape: d3.symbolCircle, color: "#607d8b" },
    ];
    const legendG = g.selectAll(".roofline-legend").data([0]);
    const legEnter = legendG.enter().append("g").attr("class", "roofline-legend");
    legEnter.merge(legendG).attr("transform", `translate(${width - 180}, 10)`);
    const leg = legEnter.merge(legendG);
    leg.selectAll("*").remove();

    legendData.forEach((d, i) => {
      const ly = i * 18;
      leg.append("path")
        .attr("d", d3.symbol().type(d.shape).size(60)())
        .attr("transform", `translate(6,${ly})`)
        .attr("fill", d.color);
      leg.append("text")
        .attr("x", 18).attr("y", ly + 4)
        .attr("fill", "#8a7f72")
        .attr("font-size", 10)
        .attr("font-family", "'IBM Plex Mono', monospace")
        .text(d.label);
    });

    // Memory-bound / Compute-bound region labels
    if (document.getElementById("togTPU").checked) {
      const tpuRidge = chips[2].peakTOPS / chips[2].memBw * 1e3;
      if (tpuRidge > xScale.domain()[0] && tpuRidge < xScale.domain()[1]) {
        labelsGroup.append("text")
          .attr("x", xScale(Math.sqrt(xScale.domain()[0] * tpuRidge)))
          .attr("y", height - 8)
          .attr("text-anchor", "middle")
          .attr("fill", "#c94a1a")
          .attr("font-size", 9)
          .attr("font-family", "'IBM Plex Mono', monospace")
          .attr("opacity", 0.5)
          .text("MEMORY-BOUND");
        labelsGroup.append("text")
          .attr("x", xScale(Math.sqrt(tpuRidge * xScale.domain()[1])))
          .attr("y", height - 8)
          .attr("text-anchor", "middle")
          .attr("fill", "#c94a1a")
          .attr("font-size", 9)
          .attr("font-family", "'IBM Plex Mono', monospace")
          .attr("opacity", 0.5)
          .text("COMPUTE-BOUND");
      }
    }
  }

  // ---- Tooltip ----
  function showTip(event, app, chip, tops) {
    const rect = container.getBoundingClientRect();
    tip.innerHTML = `
      <div class="tt-label">${app.name} on ${chip.name}</div>
      <div class="tt-row">Type: <span class="tt-val">${app.type}</span></div>
      <div class="tt-row">Op intensity: <span class="tt-val">${app.opsPerByte} ops/byte</span></div>
      <div class="tt-row">Measured: <span class="tt-val">${tops.toFixed(1)} TOPS</span></div>
      <div class="tt-row">Peak: <span class="tt-val">${chip.peakTOPS} TOPS</span></div>
      <div class="tt-row">Utilization: <span class="tt-val">${(tops / chip.peakTOPS * 100).toFixed(1)}%</span></div>
    `;
    tip.style.left = (event.clientX - rect.left + 14) + "px";
    tip.style.top = (event.clientY - rect.top - 10) + "px";
    tip.classList.add("visible");
  }

  function hideTip() {
    tip.classList.remove("visible");
  }

  // ---- Wire controls ----
  document.getElementById("memBwSlider").addEventListener("input", (e) => {
    document.getElementById("memBwVal").textContent = e.target.value + " GB/s";
    render();
  });
  ["togCPU", "togGPU", "togTPU"].forEach(id => {
    document.getElementById(id).addEventListener("change", render);
  });

  // ---- Init & resize ----
  render();
  window.addEventListener("resize", render);
})();
