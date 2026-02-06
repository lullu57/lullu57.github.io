// ============================================================
// Performance & Efficiency Dashboard — D3.js
// ============================================================

(function () {
  "use strict";

  const chipColors = {
    cpu: "#607d8b",
    gpu: "#2e7d32",
    tpu: "#c94a1a",
    tpuPrime: "#e67e22",
  };
  const axisText = "#8a7f72";
  const axisLine = "#c8bfad";
  const gridLine = "#ece5d8";
  const monoFont = "'IBM Plex Mono', monospace";

  // 1. Relative Performance Bar Chart (Table 6)
  function drawPerfBars() {
    const container = document.getElementById("perfBarChart");
    const cW = container.clientWidth;
    if (cW < 10) return; // panel not visible yet
    container.innerHTML = "";
    const margin = { top: 20, right: 20, bottom: 40, left: 50 };
    const width = cW - margin.left - margin.right;
    const height = 240 - margin.top - margin.bottom;

    const svg = d3.select(container).append("svg")
      .attr("width", cW).attr("height", 240);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const rp = DATA.relativePerf;
    const apps = rp.apps;
    const groups = ["cpu", "gpu", "tpu"];

    const x0 = d3.scaleBand().domain(apps).range([0, width]).paddingInner(0.25).paddingOuter(0.1);
    const x1 = d3.scaleBand().domain(groups).range([0, x0.bandwidth()]).padding(0.08);
    const y = d3.scaleLog().domain([0.2, 100]).range([height, 0]).clamp(true);

    [0.5, 1, 5, 10, 50].forEach(v => {
      g.append("line").attr("x1", 0).attr("x2", width)
        .attr("y1", y(v)).attr("y2", y(v))
        .attr("stroke", gridLine).attr("stroke-width", 0.5);
    });

    apps.forEach((app, ai) => {
      groups.forEach(gk => {
        const val = rp[gk][ai];
        g.append("rect")
          .attr("x", x0(app) + x1(gk)).attr("y", y(val))
          .attr("width", x1.bandwidth())
          .attr("height", Math.max(0, height - y(val)))
          .attr("fill", chipColors[gk]).attr("rx", 2).attr("opacity", 0.85);

        if (val >= 1) {
          g.append("text")
            .attr("x", x0(app) + x1(gk) + x1.bandwidth() / 2)
            .attr("y", y(val) - 4).attr("text-anchor", "middle")
            .attr("fill", chipColors[gk]).attr("font-size", 9)
            .attr("font-family", monoFont)
            .text(val + "x");
        }
      });
    });

    g.append("g").attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x0).tickSizeOuter(0))
      .selectAll("text").attr("fill", axisText).attr("font-size", 10).attr("font-family", monoFont);
    g.selectAll(".domain, .tick line").attr("stroke", axisLine);

    g.append("g")
      .call(d3.axisLeft(y).tickValues([0.5, 1, 5, 10, 50]).tickFormat(d => d + "x").tickSizeOuter(0))
      .selectAll("text").attr("fill", axisText).attr("font-size", 9).attr("font-family", monoFont);
    g.selectAll(".domain, .tick line").attr("stroke", axisLine);

    g.append("text").attr("x", width).attr("y", -6).attr("text-anchor", "end")
      .attr("fill", axisText).attr("font-size", 9).attr("font-family", monoFont)
      .text(`GM: GPU ${rp.geoMean.gpu}x, TPU ${rp.geoMean.tpu}x | WM: GPU ${rp.weightedMean.gpu}x, TPU ${rp.weightedMean.tpu}x`);

    const legend = document.getElementById("perfLegend");
    legend.innerHTML = "";
    [{ k: "cpu", l: "Haswell CPU (baseline)" }, { k: "gpu", l: "K80 GPU" }, { k: "tpu", l: "TPU" }].forEach(d => {
      legend.innerHTML += `<div class="legend-item"><span class="legend-swatch" style="background:${chipColors[d.k]}"></span>${d.l}</div>`;
    });
  }

  // 2. Performance / Watt Bar Chart (Figure 9)
  function drawPerfWatt() {
    const container = document.getElementById("perfWattChart");
    const cW = container.clientWidth;
    if (cW < 10) return; // panel not visible yet
    container.innerHTML = "";
    const margin = { top: 20, right: 20, bottom: 40, left: 50 };
    const width = cW - margin.left - margin.right;
    const height = 240 - margin.top - margin.bottom;

    const svg = d3.select(container).append("svg")
      .attr("width", cW).attr("height", 240);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const categories = ["GM (Total)", "WM (Total)", "GM (Incr.)", "WM (Incr.)"];
    const values = {
      gpu: [DATA.perfPerWatt.total.geoMean.gpu, DATA.perfPerWatt.total.weightedMean.gpu,
            DATA.perfPerWatt.incremental.geoMean.gpu, DATA.perfPerWatt.incremental.weightedMean.gpu],
      tpu: [DATA.perfPerWatt.total.geoMean.tpu, DATA.perfPerWatt.total.weightedMean.tpu,
            DATA.perfPerWatt.incremental.geoMean.tpu, DATA.perfPerWatt.incremental.weightedMean.tpu],
      tpuPrime: [DATA.perfPerWatt.total.geoMean.tpuPrime, DATA.perfPerWatt.total.weightedMean.tpuPrime,
                 DATA.perfPerWatt.incremental.geoMean.tpuPrime, DATA.perfPerWatt.incremental.weightedMean.tpuPrime],
    };

    const groups = ["gpu", "tpu", "tpuPrime"];
    const x0 = d3.scaleBand().domain(categories).range([0, width]).paddingInner(0.2).paddingOuter(0.1);
    const x1 = d3.scaleBand().domain(groups).range([0, x0.bandwidth()]).padding(0.08);
    const yMax = d3.max(groups.flatMap(gk => values[gk]));
    const y = d3.scaleLinear().domain([0, yMax * 1.1]).range([height, 0]);

    y.ticks(5).forEach(v => {
      g.append("line").attr("x1", 0).attr("x2", width)
        .attr("y1", y(v)).attr("y2", y(v))
        .attr("stroke", gridLine).attr("stroke-width", 0.5);
    });

    categories.forEach((cat, ci) => {
      groups.forEach(gk => {
        const val = values[gk][ci];
        g.append("rect")
          .attr("x", x0(cat) + x1(gk)).attr("y", y(val))
          .attr("width", x1.bandwidth())
          .attr("height", Math.max(0, height - y(val)))
          .attr("fill", chipColors[gk]).attr("rx", 2).attr("opacity", 0.85);
        g.append("text")
          .attr("x", x0(cat) + x1(gk) + x1.bandwidth() / 2)
          .attr("y", y(val) - 4).attr("text-anchor", "middle")
          .attr("fill", chipColors[gk]).attr("font-size", 8)
          .attr("font-family", monoFont)
          .text(val + "x");
      });
    });

    g.append("g").attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x0).tickSizeOuter(0))
      .selectAll("text").attr("fill", axisText).attr("font-size", 8).attr("font-family", monoFont)
      .attr("transform", "rotate(-12)").attr("text-anchor", "end");
    g.selectAll(".domain, .tick line").attr("stroke", axisLine);

    g.append("g")
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => d + "x").tickSizeOuter(0))
      .selectAll("text").attr("fill", axisText).attr("font-size", 9).attr("font-family", monoFont);
    g.selectAll(".domain, .tick line").attr("stroke", axisLine);

    const legend = document.getElementById("wattLegend");
    legend.innerHTML = "";
    [{ k: "gpu", l: "K80 GPU" }, { k: "tpu", l: "TPU" }, { k: "tpuPrime", l: "TPU' (GDDR5)" }].forEach(d => {
      legend.innerHTML += `<div class="legend-item"><span class="legend-swatch" style="background:${chipColors[d.k]}"></span>${d.l}</div>`;
    });
  }

  // 3. Die Area Breakdown (donut charts)
  function drawDieArea() {
    const container = document.getElementById("dieAreaChart");
    if (container.clientWidth < 10) return; // panel not visible yet
    container.innerHTML = "";

    var configs = [
      { title: "TPU Die (<331 mm\u00B2)", data: DATA.dieArea.tpu },
      { title: "CPU/GPU Die (~600 mm\u00B2)", data: DATA.dieArea.cpuGpu },
    ];

    configs.forEach(function(cfg) {
      var wrap = document.createElement("div");
      wrap.style.textAlign = "center";
      wrap.style.flex = "1";
      wrap.style.minWidth = "200px";
      container.appendChild(wrap);

      var size = Math.min(220, Math.floor((container.clientWidth - 32) / 2));
      var radius = size / 2 - 10, innerR = radius * 0.45;
      var legendH = cfg.data.length * 18 + 12;
      var svgH = size + 30 + legendH;

      var svg = d3.select(wrap).append("svg")
        .attr("width", Math.max(size, 240)).attr("height", svgH);
      var gg = svg.append("g")
        .attr("transform", "translate(" + size / 2 + "," + size / 2 + ")");

      var pie = d3.pie().value(function(d) { return d.pct; }).sort(null).padAngle(0.02);
      var arc = d3.arc().innerRadius(innerR).outerRadius(radius);

      gg.selectAll("path").data(pie(cfg.data)).enter().append("path")
        .attr("d", arc).attr("fill", function(d) { return d.data.color; })
        .attr("stroke", "#fffdf8").attr("stroke-width", 1.5).attr("opacity", 0.9);

      svg.append("text").attr("x", size / 2).attr("y", size + 16)
        .attr("text-anchor", "middle").attr("fill", "#2a2520")
        .attr("font-size", 11).attr("font-weight", 600).text(cfg.title);

      var leg = svg.append("g").attr("transform", "translate(8, " + (size + 28) + ")");
      cfg.data.forEach(function(d, i) {
        var ly = i * 18;
        leg.append("rect").attr("x", 0).attr("y", ly).attr("width", 12).attr("height", 12)
          .attr("fill", d.color).attr("rx", 2);
        leg.append("text").attr("x", 18).attr("y", ly + 10)
          .attr("fill", "#5c5347").attr("font-size", 10).attr("font-family", monoFont)
          .text(d.pct + "% " + d.label);
      });
    });
  }

  // 4. Latency vs Throughput Interactive (Table 4)
  // Concept: tighter deadlines force SMALLER batch sizes, which REDUCES throughput.
  // The TPU's deterministic execution means it loses less throughput under tight deadlines.
  function drawLatency() {
    var container = document.getElementById("latencyChart");
    var cW = container.clientWidth;
    if (cW < 10) return;
    container.innerHTML = "";
    var margin = { top: 36, right: 30, bottom: 50, left: 65 };
    var width = cW - margin.left - margin.right;
    var height = 280 - margin.top - margin.bottom;

    var svg = d3.select(container).append("svg")
      .attr("width", cW).attr("height", 280);
    var g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var deadline = parseFloat(document.getElementById("latencySlider").value);
    document.getElementById("latencyVal").textContent = deadline.toFixed(1) + " ms";

    var lt = DATA.latencyThroughput;

    function getAchievable(chipType) {
      var rows = lt.filter(function(r) { return r.type === chipType; }).sort(function(a, b) { return a.batch - b.batch; });
      var best = null;
      for (var ri = 0; ri < rows.length; ri++) {
        if (rows[ri].latencyMs <= deadline) best = rows[ri];
      }
      if (!best) return { ips: 0, pctMax: 0, batch: 0, latencyMs: 0 };
      return best;
    }

    function getMax(chipType) {
      var rows = lt.filter(function(r) { return r.type === chipType; });
      return rows.reduce(function(m, r) { return r.ips > m.ips ? r : m; }, { ips: 0, batch: 0 });
    }

    var chips = ["CPU", "GPU", "TPU"];
    var results = chips.map(function(c) { return Object.assign({ chip: c }, getAchievable(c)); });
    var maxRows = {};
    chips.forEach(function(c) { maxRows[c] = getMax(c); });
    var maxIPS = maxRows["TPU"].ips;

    var x = d3.scaleBand().domain(chips).range([0, width]).padding(0.3);
    var y = d3.scaleLinear().domain([0, maxIPS * 1.2]).range([height, 0]);

    y.ticks(5).forEach(function(v) {
      g.append("line").attr("x1", 0).attr("x2", width)
        .attr("y1", y(v)).attr("y2", y(v))
        .attr("stroke", gridLine).attr("stroke-width", 0.5);
    });

    // Ghost bars + label: "max (no deadline)"
    chips.forEach(function(c) {
      var mr = maxRows[c];
      g.append("rect")
        .attr("x", x(c)).attr("y", y(mr.ips))
        .attr("width", x.bandwidth())
        .attr("height", Math.max(0, height - y(mr.ips)))
        .attr("fill", chipColors[c.toLowerCase()]).attr("opacity", 0.12).attr("rx", 3)
        .attr("stroke", chipColors[c.toLowerCase()]).attr("stroke-width", 0.5)
        .attr("stroke-dasharray", "3,2").attr("stroke-opacity", 0.4);
    });

    // Solid bars: achievable within deadline
    results.forEach(function(r) {
      var col = chipColors[r.chip.toLowerCase()];
      var mr = maxRows[r.chip];

      if (r.ips > 0) {
        g.append("rect")
          .attr("x", x(r.chip)).attr("y", y(r.ips))
          .attr("width", x.bandwidth())
          .attr("height", Math.max(0, height - y(r.ips)))
          .attr("fill", col).attr("opacity", 0.85).attr("rx", 3);

        // IPS label
        g.append("text")
          .attr("x", x(r.chip) + x.bandwidth() / 2)
          .attr("y", y(r.ips) - 18).attr("text-anchor", "middle")
          .attr("fill", col).attr("font-size", 12)
          .attr("font-family", monoFont).attr("font-weight", 700)
          .text(d3.format(",")(r.ips) + " IPS");

        // % of peak + batch size
        g.append("text")
          .attr("x", x(r.chip) + x.bandwidth() / 2)
          .attr("y", y(r.ips) - 5).attr("text-anchor", "middle")
          .attr("fill", axisText).attr("font-size", 10).attr("font-family", monoFont)
          .text(r.pctMax + "% peak  ·  batch " + r.batch);
      } else {
        g.append("text")
          .attr("x", x(r.chip) + x.bandwidth() / 2)
          .attr("y", height / 2).attr("text-anchor", "middle")
          .attr("fill", col).attr("font-size", 11).attr("font-family", monoFont)
          .text("Cannot meet deadline");
      }
    });

    // Axes
    g.append("g").attr("transform", "translate(0," + height + ")")
      .call(d3.axisBottom(x).tickSizeOuter(0))
      .selectAll("text").attr("fill", axisText).attr("font-size", 12).attr("font-family", monoFont);
    g.selectAll(".domain, .tick line").attr("stroke", axisLine);

    g.append("g")
      .call(d3.axisLeft(y).ticks(5).tickFormat(function(d) { return d >= 1000 ? d3.format(".0s")(d) : d; }).tickSizeOuter(0))
      .selectAll("text").attr("fill", axisText).attr("font-size", 10).attr("font-family", monoFont);
    g.selectAll(".domain, .tick line").attr("stroke", axisLine);

    svg.append("text").attr("transform", "rotate(-90)")
      .attr("x", -(margin.top + height / 2)).attr("y", 14)
      .attr("text-anchor", "middle").attr("fill", axisText).attr("font-size", 11).attr("font-family", monoFont)
      .text("Inferences / sec (MLP0)");

    // Top annotation line 1: legend
    g.append("text").attr("x", 0).attr("y", -18)
      .attr("fill", "#b8860b").attr("font-size", 9).attr("font-family", monoFont)
      .text("Dashed = max (no deadline)  |  Solid = achievable within " + deadline.toFixed(0) + " ms");

    // Top annotation line 2: direction hint
    g.append("text").attr("x", 0).attr("y", -6)
      .attr("fill", axisText).attr("font-size", 9).attr("font-family", monoFont).attr("opacity", 0.7)
      .text("\u2190 Tighter deadline = smaller batches = less throughput");
  }

  document.getElementById("latencySlider").addEventListener("input", drawLatency);

  function renderAll() {
    drawPerfBars();
    drawPerfWatt();
    drawDieArea();
    drawLatency();
  }

  renderAll();
  window.addEventListener("resize", renderAll);
})();
