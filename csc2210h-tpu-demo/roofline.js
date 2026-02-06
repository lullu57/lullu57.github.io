// ============================================================
// Interactive Roofline Model — D3.js
// Log-log plot with three processor rooflines overlaid,
// six NN application dots, memory-bandwidth slider for TPU'.
// ============================================================

(function () {
  "use strict";

  const container = document.getElementById("rooflineChart");
  const tip = document.getElementById("rooflineTip");

  // ---- Dimensions (responsive) ----
  let margin, width, height;

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
    { key: "cpu", name: "Haswell CPU", peakTOPS: 1.3,  memBw: 51,  color: "#607d8b", togId: "togCPU" },
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
    // X-axis is "MAC Ops / weight byte" (paper Figures 5-7).
    // 1 MAC = 2 Ops (multiply + accumulate), so:
    //   Ridge point (MACs/Byte) = Peak_Ops / (2 * memBw)
    //   Achievable TOPS = min(Peak, 2 * memBw * X / 1e3)
    // memBw in GB/s, peakTOPS in Tera-ops/s, X in MACs/byte.
    const xMin = xS.domain()[0];
    const xMax = xS.domain()[1];
    const points = [];
    const nPts = 200;
    for (let i = 0; i <= nPts; i++) {
      const logX = Math.log10(xMin) + (Math.log10(xMax) - Math.log10(xMin)) * i / nPts;
      const x = Math.pow(10, logX);
      // 2 * memBw * x converts MACs/byte → achievable TOPS via bandwidth
      const y = Math.min(peakTOPS, 2 * memBw * x / 1e3);
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

    // Responsive margins and sizing
    const isMobile = containerW < 500;
    const isSmall  = containerW < 700;
    margin = {
      top:    isMobile ? 20 : 30,
      right:  isMobile ? 12 : 30,
      bottom: isMobile ? 45 : 55,
      left:   isMobile ? 40 : 65
    };
    width = containerW - margin.left - margin.right;
    // Give more relative height on mobile so the chart doesn't get squished
    const heightRatio = isMobile ? 0.7 : (isSmall ? 0.55 : 0.5);
    height = Math.min(420, containerW * heightRatio) - margin.top - margin.bottom;

    svg.attr("width", width + margin.left + margin.right)
       .attr("height", height + margin.top + margin.bottom);
    g.attr("transform", `translate(${margin.left},${margin.top})`);

    // Domains
    xScale.domain([5, 5000]).range([0, width]);
    yScale.domain([0.05, 150]).range([height, 0]);

    // Axes
    gX.attr("transform", `translate(0,${height})`).call(xAxis);
    gY.call(yAxis);

    // Responsive font sizes
    var tickFont  = isMobile ? 8 : 10;
    var labelFont = isMobile ? 9 : 11;
    var dotFont   = isMobile ? 8 : 10;
    var annoFont  = isMobile ? 7 : 9;

    // Style axes
    svg.selectAll(".x-axis text, .y-axis text")
      .attr("fill", "#8a7f72").attr("font-size", tickFont).attr("font-family", "'IBM Plex Mono', monospace");
    svg.selectAll(".x-axis line, .y-axis line, .x-axis path, .y-axis path")
      .attr("stroke", "#c8bfad");

    // Axis labels
    xLabel
      .attr("x", margin.left + width / 2)
      .attr("y", margin.top + height + (isMobile ? 36 : 44))
      .attr("font-size", labelFont)
      .text(isMobile ? "Ops / weight byte" : "Operational Intensity (ops / weight byte)");
    yLabel
      .attr("x", -(margin.top + height / 2))
      .attr("y", isMobile ? 10 : 16)
      .attr("font-size", labelFont)
      .text(isMobile ? "TOPS" : "Performance (TOPS)");

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

      // Ridge point annotation (MACs/byte = Peak_Ops / (2 * memBw) * 1e3)
      const ridge = chip.peakTOPS / (2 * chip.memBw) * 1e3;
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
          .attr("font-size", annoFont)
          .attr("opacity", 0.7)
          .text(isMobile ? `${chip.key.toUpperCase()} (${Math.round(ridge)})` : `${chip.name} (ridge: ${Math.round(ridge)})`);
      }

      // Peak label on the right
      const peakY = yScale(chip.peakTOPS);
      if (peakY > 5) {
        rooflineGroup.append("text")
          .attr("x", width - 4)
          .attr("y", peakY - 5)
          .attr("text-anchor", "end")
          .attr("fill", chip.color)
          .attr("font-size", annoFont)
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
          const ridgeOrig = 92 / (2 * origMemBw) * 1e3; // ~1353 MACs/byte
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

        var dotSize = isMobile ? 70 : 120;
        var dotSizeSmall = isMobile ? 55 : 100;
        var dotR = isMobile ? 3.5 : 5;

        if (shape === "star") {
          dotsGroup.append("path")
            .attr("d", d3.symbol().type(d3.symbolStar).size(dotSize)())
            .attr("transform", `translate(${cx},${cy})`)
            .attr("fill", app.color)
            .attr("stroke", "#fffdf8")
            .attr("stroke-width", 1)
            .attr("cursor", "pointer")
            .on("mouseenter", (e) => showTip(e, app, chip, measuredTOPS))
            .on("mouseleave", hideTip);
        } else if (shape === "triangle") {
          dotsGroup.append("path")
            .attr("d", d3.symbol().type(d3.symbolTriangle).size(dotSizeSmall)())
            .attr("transform", `translate(${cx},${cy})`)
            .attr("fill", app.color)
            .attr("stroke", "#fffdf8")
            .attr("stroke-width", 1)
            .attr("cursor", "pointer")
            .on("mouseenter", (e) => showTip(e, app, chip, measuredTOPS))
            .on("mouseleave", hideTip);
        } else {
          dotsGroup.append("circle")
            .attr("cx", cx).attr("cy", cy).attr("r", dotR)
            .attr("fill", app.color)
            .attr("stroke", "#fffdf8")
            .attr("stroke-width", 1)
            .attr("cursor", "pointer")
            .on("mouseenter", (e) => showTip(e, app, chip, measuredTOPS))
            .on("mouseleave", hideTip);
        }

        // Label (only for TPU to avoid clutter; hide on very small screens)
        if (chip.key === "tpu" && !isMobile) {
          labelsGroup.append("text")
            .attr("x", cx + 8)
            .attr("y", cy - 6)
            .attr("fill", app.color)
            .attr("font-size", dotFont)
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
    var legX = isMobile ? width - 120 : width - 180;
    legEnter.merge(legendG).attr("transform", `translate(${legX}, 4)`);
    const leg = legEnter.merge(legendG);
    leg.selectAll("*").remove();

    var legSpacing = isMobile ? 14 : 18;
    var legFont = isMobile ? 8 : 10;
    legendData.forEach((d, i) => {
      const ly = i * legSpacing;
      leg.append("path")
        .attr("d", d3.symbol().type(d.shape).size(isMobile ? 40 : 60)())
        .attr("transform", `translate(6,${ly})`)
        .attr("fill", d.color);
      leg.append("text")
        .attr("x", 16).attr("y", ly + 3)
        .attr("fill", "#8a7f72")
        .attr("font-size", legFont)
        .attr("font-family", "'IBM Plex Mono', monospace")
        .text(d.label);
    });

    // Memory-bound / Compute-bound region labels
    if (document.getElementById("togTPU").checked) {
      const tpuRidge = chips[2].peakTOPS / (2 * chips[2].memBw) * 1e3;
      if (tpuRidge > xScale.domain()[0] && tpuRidge < xScale.domain()[1]) {
        labelsGroup.append("text")
          .attr("x", xScale(Math.sqrt(xScale.domain()[0] * tpuRidge)))
          .attr("y", height - 6)
          .attr("text-anchor", "middle")
          .attr("fill", "#c94a1a")
          .attr("font-size", isMobile ? 7 : 9)
          .attr("font-family", "'IBM Plex Mono', monospace")
          .attr("opacity", 0.5)
          .text(isMobile ? "MEM-BOUND" : "MEMORY-BOUND");
        labelsGroup.append("text")
          .attr("x", xScale(Math.sqrt(tpuRidge * xScale.domain()[1])))
          .attr("y", height - 6)
          .attr("text-anchor", "middle")
          .attr("fill", "#c94a1a")
          .attr("font-size", isMobile ? 7 : 9)
          .attr("font-family", "'IBM Plex Mono', monospace")
          .attr("opacity", 0.5)
          .text(isMobile ? "COMPUTE" : "COMPUTE-BOUND");
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
