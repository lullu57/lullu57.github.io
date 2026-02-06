// ============================================================
// Presentation Mode — Tour-style guided walkthrough
// Floating modal with arrow pointing to relevant page section.
// Arrow keys / click to navigate, Esc to exit.
// ============================================================

(function () {
  "use strict";

  // ---- Presentation Steps ----
  // target: CSS selector of the element to point at (scrolled into view)
  // position: where the modal appears relative to target ("bottom" | "top" | "right" | "left")
  const steps = [
    {
      tab: "systolic",
      target: ".panel-header",
      position: "bottom",
      title: "1/11 — The Problem",
      notes: "In 2013 Google projected that voice search using DNNs would <strong>double datacenter compute demand</strong>. CPUs were too slow, GPUs too power-hungry. They needed 10x cost-performance improvement — so they built a custom ASIC in just <strong>15 months</strong>: the Tensor Processing Unit.",
    },
    {
      tab: "systolic",
      target: "#canvasSystolic",
      position: "right",
      title: "2/11 — Systolic Array: The Heart of the TPU",
      notes: "The TPU's core is a <strong>256×256 systolic array</strong> of 8-bit MAC units. Activations flow left-to-right, weights are pre-loaded. Each cell computes a partial sum and passes it down. Press <strong>Play</strong> to see the diagonal wavefront propagate.",
      action: function () { document.getElementById("btnReset").click(); }
    },
    {
      tab: "systolic",
      target: ".stat-row",
      position: "top",
      title: "3/11 — Data Reuse: TPU vs CPU",
      notes: "Watch the <strong>memory read counters</strong>. The TPU loads each value <em>once</em> and reuses it across the array. The CPU fetches both operands for <em>every single MAC</em>. For N×N: that's <strong>O(N²) vs O(N³)</strong> memory reads — the key to fitting 65,536 MACs on a small die.",
      action: function () { document.getElementById("btnPlayPause").click(); }
    },
    {
      tab: "roofline",
      target: "#rooflineChart",
      position: "bottom",
      title: "4/11 — Roofline Model Overview",
      notes: "The Roofline model plots attainable <strong>TOPS</strong> (y-axis) vs <strong>operational intensity</strong> in ops/byte (x-axis). The slanted region = <em>memory-bound</em>. The flat ceiling = <em>compute-bound</em>. Three rooflines overlaid: CPU (gray), GPU (green), TPU (orange).",
    },
    {
      tab: "roofline",
      target: "#rooflineChart",
      position: "bottom",
      title: "5/11 — Memory-Bound Workloads",
      notes: "4 of 6 production apps (MLPs + LSTMs) sit under the <strong>slanted part</strong> — they are memory-bound, not compute-bound. Only the CNNs hit the flat ceiling. Yet architects focus on CNNs, which are just <strong>5% of Google's datacenter NN workload</strong>.",
    },
    {
      tab: "roofline",
      target: "#memBwSlider",
      position: "bottom",
      title: "6/11 — TPU': What If Better Memory?",
      notes: "Drag the slider to ~170 GB/s (GDDR5). The ridge point shifts left and memory-bound apps <strong>triple</strong> in performance. The paper shows that upgrading memory alone would make the TPU <strong>30–50x faster</strong> than CPU/GPU. The bottleneck was memory, not compute.",
      action: function () {
        document.getElementById("memBwSlider").value = 34;
        document.getElementById("memBwSlider").dispatchEvent(new Event("input"));
      }
    },
    {
      tab: "performance",
      target: "#perfBarChart",
      position: "bottom",
      title: "7/11 — Relative Performance",
      notes: "TPU is <strong>14.5x faster</strong> (geometric mean) to <strong>29.2x</strong> (weighted by workload mix) vs CPU. The K80 GPU is barely faster than CPU for inference — just 1.1x. The GPU's throughput-oriented architecture struggles with the strict latency requirements of inference.",
    },
    {
      tab: "performance",
      target: "#perfWattChart",
      position: "bottom",
      title: "8/11 — Performance per Watt",
      notes: "TPU delivers <strong>30–80x</strong> better perf/Watt than CPU, <strong>14–29x</strong> better than GPU. The hypothetical TPU' with GDDR5 (orange bars) reaches <strong>196x</strong>. This efficiency is what justified building a custom ASIC — power correlates with total cost of ownership.",
    },
    {
      tab: "performance",
      target: "#dieAreaChart",
      position: "top",
      title: "9/11 — Die Area: Minimalism as Virtue",
      notes: "The TPU dedicates <strong>67% to datapath</strong> and just <strong>2% to control</strong>. CPUs/GPUs spend ~25% on control (branch prediction, OoO, caches). The TPU drops all of that — no caches, no speculation. This is why it fits <strong>25x more MACs</strong> in <strong>half the die area</strong>.",
    },
    {
      tab: "performance",
      target: "#latencyChart",
      position: "top",
      title: "10/11 — Latency Constraints",
      notes: "Set the deadline to 7 ms. The TPU retains <strong>80% of peak</strong> throughput. CPU drops to 42%, GPU to 37%. Why? Tighter deadlines force smaller batch sizes. The TPU's <strong>deterministic execution</strong> handles small batches efficiently — no time wasted on thread scheduling or cache misses.",
      action: function () {
        document.getElementById("latencySlider").value = 7;
        document.getElementById("latencySlider").dispatchEvent(new Event("input"));
      }
    },
    {
      tab: "performance",
      target: ".insight",
      position: "top",
      title: "11/11 — Conclusion",
      notes: "The TPU succeeded by making the right trade-offs: <strong>domain-specific design</strong>, 8-bit integer systolic arrays, large on-chip memory, deterministic execution. Order-of-magnitude improvements — rare in computer architecture. The lesson: sacrificing generality for the right specializations yields <strong>massive gains</strong>.",
    },
  ];

  let currentStep = -1;
  let active = false;

  // ---- Create overlay elements ----
  // Scrim: subtle semi-transparent backdrop (no full darkening)
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
    '  <button id="tourClose" title="Exit (Esc)">✕</button>',
    '</div>',
    '<div id="tourNotes"></div>',
    '<div id="tourFooter">',
    '  <div id="tourProgress"><div id="tourProgressFill"></div></div>',
    '  <div id="tourNav">',
    '    <button id="tourPrev">← Prev</button>',
    '    <button id="tourNext">Next →</button>',
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
      background: rgba(244,239,230,0.35);
      backdrop-filter: blur(1px);
      pointer-events: none;
    }
    #tourScrim.active { display: block; }

    #tourModal {
      display: none;
      position: absolute; z-index: 8500;
      width: 380px; max-width: calc(100vw - 32px);
      background: #fffdf8;
      border: 2px solid #c94a1a;
      border-radius: 6px;
      box-shadow: 4px 4px 0 rgba(201,74,26,0.15), 0 8px 32px rgba(42,37,32,0.18);
      font-family: 'IBM Plex Sans', sans-serif;
      pointer-events: auto;
    }
    #tourModal.active { display: block; }

    #tourArrow {
      position: absolute;
      width: 14px; height: 14px;
      background: #fffdf8;
      border: 2px solid #c94a1a;
      transform: rotate(45deg);
      z-index: -1;
    }
    #tourArrow.arrow-top    { top: -8px; left: 32px; border-right: none; border-bottom: none; }
    #tourArrow.arrow-bottom { bottom: -8px; left: 32px; border-left: none; border-top: none; }
    #tourArrow.arrow-left   { left: -8px; top: 20px; border-top: none; border-right: none; }
    #tourArrow.arrow-right  { right: -8px; top: 20px; border-bottom: none; border-left: none; }

    #tourHeader {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0.6rem 0.8rem;
      background: #c94a1a;
      color: #fff;
      border-radius: 4px 4px 0 0;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.72rem;
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
      padding: 0.8rem;
      font-size: 0.82rem;
      line-height: 1.6;
      color: #2a2520;
    }
    #tourNotes strong { color: #c94a1a; }
    #tourNotes em { color: #1a7a6d; font-style: italic; }

    #tourFooter {
      padding: 0 0.8rem 0.6rem;
    }
    #tourProgress {
      height: 3px; background: #ece5d8; border-radius: 2px;
      margin-bottom: 0.5rem;
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
      font-size: 0.68rem; font-weight: 600;
      padding: 0.3rem 0.7rem;
      border: 1px solid #c8bfad; border-radius: 3px;
      background: #f4efe6; color: #2a2520;
      cursor: pointer; text-transform: uppercase; letter-spacing: 0.04em;
      transition: background 0.15s;
    }
    #tourNav button:hover { background: #ece5d8; }
  `;
  document.head.appendChild(css);

  // ---- Position the modal relative to target ----
  function positionModal(step) {
    var el = document.querySelector(step.target);
    if (!el) return;

    // Scroll target into view
    el.scrollIntoView({ behavior: "smooth", block: "center" });

    var arrow = document.getElementById("tourArrow");
    arrow.className = ""; // reset

    // Wait for scroll to settle, then position
    setTimeout(function () {
      var rect = el.getBoundingClientRect();
      var mW = modal.offsetWidth;
      var mH = modal.offsetHeight;
      var scrollY = window.scrollY;
      var scrollX = window.scrollX;
      var vw = window.innerWidth;
      var vh = window.innerHeight;

      var top, left;
      var pos = step.position || "bottom";

      // If target is very wide (e.g. full-width chart), place below/above centered
      if (pos === "bottom") {
        top = rect.bottom + scrollY + 14;
        left = rect.left + scrollX + Math.min(20, rect.width / 2 - mW / 2);
        arrow.className = "arrow-top";
      } else if (pos === "top") {
        top = rect.top + scrollY - mH - 14;
        left = rect.left + scrollX + Math.min(20, rect.width / 2 - mW / 2);
        arrow.className = "arrow-bottom";
      } else if (pos === "right") {
        top = rect.top + scrollY + rect.height / 2 - mH / 2;
        left = rect.right + scrollX + 14;
        arrow.className = "arrow-left";
      } else { // left
        top = rect.top + scrollY + rect.height / 2 - mH / 2;
        left = rect.left + scrollX - mW - 14;
        arrow.className = "arrow-right";
      }

      // Clamp to viewport
      left = Math.max(8 + scrollX, Math.min(left, scrollX + vw - mW - 8));
      top = Math.max(8 + scrollY, Math.min(top, scrollY + vh - mH - 8));

      modal.style.top = top + "px";
      modal.style.left = left + "px";
    }, 350);
  }

  function show(idx) {
    if (idx < 0 || idx >= steps.length) return;
    currentStep = idx;
    var s = steps[idx];

    // Switch tab
    if (typeof switchTab === "function") {
      switchTab(s.tab);
    }

    document.getElementById("tourTitle").textContent = s.title;
    document.getElementById("tourNotes").innerHTML = s.notes;
    document.getElementById("tourProgressFill").style.width = ((idx + 1) / steps.length * 100) + "%";

    // Run action
    if (s.action) {
      setTimeout(s.action, 200);
    }

    // Position after tab switch + render
    setTimeout(function () { positionModal(s); }, 250);
  }

  function enter() {
    active = true;
    scrim.classList.add("active");
    modal.classList.add("active");
    show(0);
  }

  function exit() {
    active = false;
    scrim.classList.remove("active");
    modal.classList.remove("active");
  }

  function next() { if (currentStep < steps.length - 1) show(currentStep + 1); }
  function prev() { if (currentStep > 0) show(currentStep - 1); }

  // ---- Wire controls ----
  document.getElementById("btnPresent").addEventListener("click", enter);
  document.getElementById("tourClose").addEventListener("click", exit);
  document.getElementById("tourNext").addEventListener("click", next);
  document.getElementById("tourPrev").addEventListener("click", prev);

  // Click through scrim to interact with the page
  scrim.addEventListener("click", function (e) { e.stopPropagation(); });

  document.addEventListener("keydown", function (e) {
    if (!active) return;
    if (e.key === "Escape") { exit(); e.preventDefault(); }
    if (e.key === "ArrowRight" || e.key === " ") { next(); e.preventDefault(); }
    if (e.key === "ArrowLeft") { prev(); e.preventDefault(); }
  });
})();
