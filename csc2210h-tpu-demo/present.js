// ============================================================
// Presentation Mode — Tour-style guided walkthrough
// Floating modal with arrow pointing to relevant page section.
// Arrow keys / click to navigate, Esc to exit.
// ============================================================

(function () {
  "use strict";

  // ---- Presentation Steps ----
  // target: CSS selector of the element to point at (scrolled into view)
  // position: preferred side for the modal ("bottom" | "top" | "right" | "left")
  //           The algorithm will fall back to another side if the modal would
  //           cover the target element.
  // Total steps count is computed dynamically
  const steps = [
    // ---- Architecture overview (new) ----
    {
      tab: "arch",
      target: "#panel-arch .panel-header",
      position: "bottom",
      title: "The Problem",
      notes: "In 2013 Google projected that voice search using DNNs would <strong>double datacenter compute demand</strong>. CPUs were too slow, GPUs too power-hungry. They needed 10\u00d7 cost-performance improvement \u2014 so they built a custom ASIC in just <strong>15 months</strong>: the Tensor Processing Unit.",
    },
    {
      tab: "arch",
      target: "#arch-mmu",
      position: "left",
      title: "TPU Architecture Overview",
      notes: "This block diagram shows the TPU's data path. <strong>Hover any block</strong> to see what it does and how it compares to CPU/GPU. Key takeaway: 67% of die area goes to the <strong>Matrix Multiply Unit</strong> (orange) \u2014 65,536 8-bit MACs. Only 2% is control logic. The CPU spends 25% on control.",
    },
    // ---- Systolic array ----
    {
      tab: "systolic",
      target: "#canvasSystolic",
      position: "left",
      title: "Systolic Array: The Heart of the TPU",
      notes: "The TPU's core is a <strong>256\u00d7256 systolic array</strong> of 8-bit MAC units. Activations flow left-to-right, weights are pre-loaded. Each cell computes a partial sum and passes it down. Press <strong>Play</strong> to see the diagonal wavefront propagate.",
      action: function () { document.getElementById("btnReset").click(); }
    },
    {
      tab: "systolic",
      target: ".stat-row",
      position: "top",
      title: "Data Reuse: TPU vs CPU",
      notes: "Watch the <strong>memory read counters</strong>. The TPU loads each value <em>once</em> and reuses it across the array. The CPU fetches both operands for <em>every single MAC</em>. For N\u00d7N: <strong>O(N\u00b2) vs O(N\u00b3)</strong> memory reads \u2014 the key to fitting 65,536 MACs on a small die.",
      action: function () { document.getElementById("btnPlayPause").click(); }
    },
    // ---- Roofline ----
    {
      tab: "roofline",
      target: "#rooflineChart",
      position: "left",
      title: "Roofline Model Overview",
      notes: "The Roofline model plots attainable <strong>TOPS</strong> (y) vs <strong>operational intensity</strong> ops/byte (x). Slanted region = <em>memory-bound</em>. Flat ceiling = <em>compute-bound</em>. Three rooflines: CPU (gray), GPU (green), TPU (orange).",
    },
    {
      tab: "roofline",
      target: "#rooflineChart",
      position: "left",
      title: "Memory-Bound Workloads",
      notes: "4 of 6 production apps (MLPs + LSTMs) sit under the <strong>slanted part</strong> — memory-bound, not compute-bound. Only the CNNs hit the flat ceiling. Yet architects focus on CNNs, which are just <strong>5% of Google's datacenter NN workload</strong>.",
    },
    {
      tab: "roofline",
      target: "#memBwSlider",
      position: "top",
      title: "TPU': What If Better Memory?",
      notes: "Drag the slider to ~170 GB/s (GDDR5). The ridge point shifts left and memory-bound apps <strong>triple</strong> in performance. Upgrading memory alone makes the TPU <strong>30–50\u00d7 faster</strong> than CPU/GPU. The bottleneck was memory, not compute.",
      action: function () {
        document.getElementById("memBwSlider").value = 34;
        document.getElementById("memBwSlider").dispatchEvent(new Event("input"));
      }
    },
    {
      tab: "performance",
      target: "#perfBarChart",
      position: "right",
      title: "Relative Performance",
      notes: "TPU is <strong>14.5\u00d7 faster</strong> (geo-mean) to <strong>29.2\u00d7</strong> (weighted) vs CPU. The K80 GPU is barely faster than CPU for inference — just 1.1\u00d7. The GPU's throughput-oriented arch struggles with strict latency requirements.",
    },
    {
      tab: "performance",
      target: "#perfWattChart",
      position: "right",
      title: "Performance per Watt",
      notes: "TPU delivers <strong>30–80\u00d7</strong> better perf/Watt than CPU, <strong>14–29\u00d7</strong> better than GPU. The hypothetical TPU' with GDDR5 reaches <strong>196\u00d7</strong>. Power = dominant cost in datacenters, so this metric justified the custom ASIC.",
    },
    {
      tab: "performance",
      target: "#dieAreaChart",
      position: "right",
      title: "Die Area: Minimalism as Virtue",
      notes: "TPU: <strong>67% datapath</strong>, <strong>2% control</strong>. CPUs/GPUs: ~25% control (branch prediction, OoO, caches). The TPU drops all of that — no caches, no speculation. Fits <strong>25\u00d7 more MACs</strong> in <strong>half the die area</strong>.",
    },
    {
      tab: "performance",
      target: "#latencyChart",
      position: "right",
      title: "Latency Constraints",
      notes: "Set deadline to 7 ms. TPU retains <strong>80% of peak</strong>. CPU → 42%, GPU → 37%. Tighter deadlines force smaller batches. The TPU's <strong>deterministic execution</strong> handles small batches efficiently — no thread scheduling or cache miss overhead.",
      action: function () {
        document.getElementById("latencySlider").value = 7;
        document.getElementById("latencySlider").dispatchEvent(new Event("input"));
      }
    },
    {
      tab: "performance",
      target: ".insight",
      position: "top",
      title: "Conclusion",
      notes: "The TPU made the right trade-offs: <strong>domain-specific design</strong>, 8-bit systolic arrays, large on-chip memory, deterministic execution. Order-of-magnitude improvements — rare in computer architecture. Sacrificing generality for targeted specialization yields <strong>massive gains</strong>.",
    },
  ];

  let currentStep = -1;
  let active = false;

  // ---- Create overlay elements ----
  // Scrim: very subtle tint, NO blur — content stays fully readable
  const scrim = document.createElement("div");
  scrim.id = "tourScrim";
  document.body.appendChild(scrim);

  // Modal card
  const modal = document.createElement("div");
  modal.id = "tourModal";
  modal.innerHTML = [
    '<div id="tourArrow"></div>',
    '<div id="tourHeader">',
    '  <span id="tourTitle"></span>',
    '  <button id="tourClose" title="Exit (Esc)">\u2715</button>',
    '</div>',
    '<div id="tourNotes"></div>',
    '<div id="tourFooter">',
    '  <div id="tourProgress"><div id="tourProgressFill"></div></div>',
    '  <div id="tourNav">',
    '    <button id="tourPrev">\u2190 Prev</button>',
    '    <button id="tourNext">Next \u2192</button>',
    '  </div>',
    '</div>',
  ].join("\n");
  document.body.appendChild(modal);

  // ---- Inject styles ----
  const css = document.createElement("style");
  css.textContent = `
    #tourScrim {
      display: none;
      position: fixed; inset: 0; z-index: 8000;
      background: rgba(244,239,230,0.15);
      pointer-events: none;
    }
    #tourScrim.active { display: block; }

    #tourModal {
      display: none;
      position: absolute; z-index: 8500;
      width: 340px; max-width: calc(100vw - 32px);
      background: #fffdf8;
      border: 2px solid #c94a1a;
      border-radius: 6px;
      box-shadow: 4px 4px 0 rgba(201,74,26,0.15), 0 8px 32px rgba(42,37,32,0.18);
      font-family: 'IBM Plex Sans', sans-serif;
      pointer-events: auto;
      opacity: 0;
      transform: translateY(6px);
      transition: opacity 0.25s ease, transform 0.25s ease;
    }
    #tourModal.active { display: block; }
    #tourModal.visible { opacity: 1; transform: translateY(0); }

    #tourArrow {
      position: absolute;
      width: 14px; height: 14px;
      background: #fffdf8;
      border: 2px solid #c94a1a;
      transform: rotate(45deg);
      z-index: -1;
      transition: top 0.15s, left 0.15s, right 0.15s, bottom 0.15s;
    }
    /* Arrow classes: named for which side of the MODAL the arrow sits on */
    #tourArrow.arrow-top    { top: -8px; left: 32px; border-right: none; border-bottom: none; }
    #tourArrow.arrow-bottom { bottom: -8px; left: 32px; border-left: none; border-top: none; }
    #tourArrow.arrow-left   { left: -8px; top: 24px; border-top: none; border-right: none; }
    #tourArrow.arrow-right  { right: -8px; top: 24px; border-bottom: none; border-left: none; }

    #tourHeader {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0.55rem 0.8rem;
      background: #c94a1a;
      color: #fff;
      border-radius: 4px 4px 0 0;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    #tourClose {
      background: none; border: none; color: #fff;
      font-size: 1rem; cursor: pointer; padding: 0 0.2rem;
      opacity: 0.8; transition: opacity 0.15s;
    }
    #tourClose:hover { opacity: 1; }

    #tourNotes {
      padding: 0.7rem 0.8rem;
      font-size: 0.78rem;
      line-height: 1.55;
      color: #2a2520;
    }
    #tourNotes strong { color: #c94a1a; }
    #tourNotes em { color: #1a7a6d; font-style: italic; }

    #tourFooter {
      padding: 0 0.8rem 0.5rem;
    }
    #tourProgress {
      height: 3px; background: #ece5d8; border-radius: 2px;
      margin-bottom: 0.4rem;
    }
    #tourProgressFill {
      height: 100%; background: #c94a1a; border-radius: 2px;
      transition: width 0.3s ease;
    }
    #tourNav {
      display: flex; gap: 0.4rem; justify-content: flex-end;
    }
    #tourNav button {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.65rem; font-weight: 600;
      padding: 0.25rem 0.6rem;
      border: 1px solid #c8bfad; border-radius: 3px;
      background: #f4efe6; color: #2a2520;
      cursor: pointer; text-transform: uppercase; letter-spacing: 0.04em;
      transition: background 0.15s;
    }
    #tourNav button:hover { background: #ece5d8; }

    /* Mobile: bottom-sheet style */
    @media (max-width: 600px) {
      #tourModal {
        position: fixed !important;
        bottom: 0 !important;
        left: 0 !important;
        top: auto !important;
        right: 0 !important;
        width: 100%;
        max-width: 100%;
        border-radius: 10px 10px 0 0;
        border-bottom: none;
        box-shadow: 0 -4px 24px rgba(42,37,32,0.2);
        max-height: 45vh;
        overflow-y: auto;
      }
      #tourModal.visible { transform: translateY(0); }
      #tourArrow { display: none; }
      #tourNotes { font-size: 0.76rem; padding: 0.6rem; }
      #tourHeader { font-size: 0.65rem; padding: 0.5rem 0.7rem; }
      #tourNav button { font-size: 0.62rem; padding: 0.25rem 0.55rem; }
    }
  `;
  document.head.appendChild(css);

  // ---- Position the modal so it does NOT overlap the target ----
  function positionModal(step) {
    var el = document.querySelector(step.target);
    if (!el) return;

    var mobMode = window.innerWidth < 600;

    // On mobile, just scroll target into view (top half) — modal is a fixed bottom sheet
    el.scrollIntoView({ behavior: "smooth", block: mobMode ? "start" : "nearest" });
    if (mobMode) return; // CSS handles fixed bottom positioning

    var arrow = document.getElementById("tourArrow");
    arrow.className = "";

    // Wait for scroll + reflow
    setTimeout(function () {
      var rect = el.getBoundingClientRect();
      var mW = modal.offsetWidth || 340;
      var mH = modal.offsetHeight || 260;
      var scrollY = window.scrollY;
      var scrollX = window.scrollX;
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      var gap = 16; // space between target and modal

      // Try each side. Pick the preferred one if it fits; otherwise cycle through.
      var sides = [step.position || "right", "right", "left", "bottom", "top"];
      var chosen = null;

      for (var si = 0; si < sides.length; si++) {
        var s = sides[si];
        var t, l;

        if (s === "right") {
          l = rect.right + gap;
          t = rect.top + Math.min(0, rect.height / 2 - mH / 2);
          if (l + mW <= vw - 8) { chosen = { top: t, left: l, arrow: "arrow-left" }; break; }
        } else if (s === "left") {
          l = rect.left - mW - gap;
          t = rect.top + Math.min(0, rect.height / 2 - mH / 2);
          if (l >= 8) { chosen = { top: t, left: l, arrow: "arrow-right" }; break; }
        } else if (s === "bottom") {
          t = rect.bottom + gap;
          l = rect.left + Math.min(20, rect.width / 2 - mW / 2);
          if (t + mH <= vh - 8) { chosen = { top: t, left: l, arrow: "arrow-top" }; break; }
        } else if (s === "top") {
          t = rect.top - mH - gap;
          l = rect.left + Math.min(20, rect.width / 2 - mW / 2);
          if (t >= 8) { chosen = { top: t, left: l, arrow: "arrow-bottom" }; break; }
        }
      }

      // Fallback: just place to the right, clamped
      if (!chosen) {
        chosen = { top: rect.top, left: rect.right + gap, arrow: "arrow-left" };
      }

      // Clamp to viewport (using viewport coords, then add scroll)
      chosen.left = Math.max(8, Math.min(chosen.left, vw - mW - 8));
      chosen.top = Math.max(8, Math.min(chosen.top, vh - mH - 8));

      // Convert to absolute (document) coords
      modal.style.top = (chosen.top + scrollY) + "px";
      modal.style.left = (chosen.left + scrollX) + "px";
      arrow.className = chosen.arrow;
    }, 350);
  }

  var transitioning = false;

  function show(idx) {
    if (idx < 0 || idx >= steps.length || transitioning) return;
    transitioning = true;

    var s = steps[idx];
    var isFirstStep = currentStep < 0; // entering fresh
    currentStep = idx;

    // Step 1: fade the modal out (skip on first show — it's already invisible)
    if (!isFirstStep) {
      modal.classList.remove("visible");
    }

    var fadeOutMs = isFirstStep ? 0 : 220;

    setTimeout(function () {
      // Step 2: switch tab + update content while invisible
      if (typeof switchTab === "function") {
        switchTab(s.tab);
      }

      document.getElementById("tourTitle").textContent = (idx + 1) + "/" + steps.length + " \u2014 " + s.title;
      document.getElementById("tourNotes").innerHTML = s.notes;
      document.getElementById("tourProgressFill").style.width = ((idx + 1) / steps.length * 100) + "%";

      // Run action
      if (s.action) {
        setTimeout(s.action, 100);
      }

      // Step 3: reposition, then fade in after layout settles
      setTimeout(function () {
        positionModal(s);
        // Step 4: fade in after positioning
        setTimeout(function () {
          modal.classList.add("visible");
          transitioning = false;
        }, 380); // after positionModal's internal 350ms timeout + margin
      }, 50);
    }, fadeOutMs);
  }

  function enter() {
    active = true;
    currentStep = -1; // mark as fresh entry
    scrim.classList.add("active");
    modal.classList.add("active");
    modal.classList.remove("visible");
    show(0);
  }

  function exit() {
    active = false;
    transitioning = false;
    modal.classList.remove("visible");
    // Wait for fade-out, then hide
    setTimeout(function () {
      scrim.classList.remove("active");
      modal.classList.remove("active");
    }, 250);
  }

  function next() { if (currentStep < steps.length - 1) show(currentStep + 1); }
  function prev() { if (currentStep > 0) show(currentStep - 1); }

  // ---- Wire controls ----
  document.getElementById("btnPresent").addEventListener("click", enter);
  document.getElementById("tourClose").addEventListener("click", exit);
  document.getElementById("tourNext").addEventListener("click", next);
  document.getElementById("tourPrev").addEventListener("click", prev);

  document.addEventListener("keydown", function (e) {
    if (!active) return;
    if (e.key === "Escape") { exit(); e.preventDefault(); }
    if (e.key === "ArrowRight" || e.key === " ") { next(); e.preventDefault(); }
    if (e.key === "ArrowLeft") { prev(); e.preventDefault(); }
  });

  // Reposition on window resize while active
  window.addEventListener("resize", function () {
    if (active && currentStep >= 0) {
      positionModal(steps[currentStep]);
    }
  });
})();
