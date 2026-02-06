// ============================================================
// TPU Architecture Diagram — Interactive Tooltips
// Hover (desktop) or tap (mobile) any block to learn about it.
// ============================================================

(function () {
  "use strict";

  // ---- Component data ----
  var components = {
    "arch-dram": {
      name: "DDR3 DRAM Chips",
      specs: "8 GiB off-chip \u00b7 2\u00d7 DDR3-2133 channels \u00b7 30 GiB/s total bandwidth",
      desc: "Stores the neural network weights. The TPU reads weights through the DDR3 interface and streams them into the Weight FIFO. This is the primary bottleneck \u2014 the paper found that 4 of 6 production workloads were memory-bound.",
      compare: [
        ["", "CPU (Haswell)", "GPU (K80)", "TPU"],
        ["Memory", "256 GiB DDR4", "2\u00d712 GiB GDDR5", "8 GiB DDR3"],
        ["Bandwidth", "51 GB/s", "160 GB/s (per die)", "34 GB/s"],
        ["Purpose", "General data", "General data", "Weights only"]
      ],
      why: "The TPU used inexpensive DDR3 to save cost and power, but this limited memory bandwidth to just 34 GB/s \u2014 making most workloads memory-bound. The paper's hypothetical TPU\u2019 with GDDR5 would triple performance."
    },
    "arch-ddr": {
      name: "DDR3-2133 Interface",
      specs: "2 channels \u00b7 14 GiB/s per channel \u00b7 30 GiB/s aggregate to Weight FIFO",
      desc: "Memory controller that manages reads/writes to the off-chip DDR3 DRAM. Feeds weights to the Weight FIFO at 30 GiB/s and receives data from the host at 14 GiB/s.",
      compare: [
        ["", "CPU", "GPU", "TPU"],
        ["Controller", "Integrated DDR4", "GDDR5 (6 controllers)", "DDR3 (2 channels)"],
        ["Channels", "4", "6\u201312", "2"]
      ],
      why: "Only 2 channels were needed because the TPU\u2019s systolic array reuses data heavily \u2014 each weight is read once and used across the entire array. The CPU needs far more bandwidth because it refetches data constantly."
    },
    "arch-wfifo": {
      name: "Weight FIFO (Weight Fetcher)",
      specs: "30 GiB/s in from DDR3 \u00b7 30 GiB/s out to Matrix Unit \u00b7 FIFO buffer",
      desc: "A first-in-first-out buffer that stages weights from DRAM before they are loaded into the systolic array. Decouples memory latency from compute so the Matrix Unit can run at full speed.",
      compare: [
        ["", "CPU", "GPU", "TPU"],
        ["Weight staging", "L1/L2/L3 caches", "Shared memory + L1", "Dedicated FIFO"],
        ["Mechanism", "Cache hierarchy", "Programmer-managed", "Hardware-managed"]
      ],
      why: "Unlike CPU caches that try to be general-purpose, the Weight FIFO is a simple, deterministic queue. No cache misses, no eviction policies \u2014 just a steady stream of weights into the systolic array."
    },
    "arch-pcie": {
      name: "PCIe Gen3 \u00d716 Interface",
      specs: "14 GiB/s bidirectional \u00b7 Connects TPU to host CPU",
      desc: "The TPU sits on a PCIe bus as a coprocessor, similar to a GPU. The host CPU sends instructions and input activations over this link. Results are returned the same way.",
      compare: [
        ["", "CPU", "GPU", "TPU"],
        ["Host link", "N/A (is the host)", "PCIe Gen3 \u00d716", "PCIe Gen3 \u00d716"],
        ["Bandwidth", "\u2014", "14 GiB/s", "14 GiB/s"]
      ],
      why: "Using a standard PCIe interface meant the TPU could be deployed as a drop-in accelerator in existing servers with zero motherboard changes \u2014 critical for the 15-month development timeline."
    },
    "arch-host": {
      name: "Host Interface",
      specs: "14 GiB/s from PCIe \u00b7 10 GiB/s to Unified Buffer \u00b7 Instruction decode",
      desc: "Receives instructions and input data from the host CPU. Decodes CISC-style instructions (Read_Host_Memory, Read_Weights, MatrixMultiply/Convolve, Activate, Write_Host_Memory) and dispatches them.",
      compare: [
        ["", "CPU", "GPU", "TPU"],
        ["ISA", "x86-64 (complex)", "PTX/SASS (SIMT)", "5 CISC instructions"],
        ["Decoder", "Complex OoO pipeline", "Warp scheduler", "Simple sequencer"]
      ],
      why: "Just 5 instructions! The extreme simplicity of the ISA means almost no silicon is spent on instruction decode. Compare to the CPU\u2019s complex decoder handling thousands of x86 instructions."
    },
    "arch-ubuf": {
      name: "Unified Buffer",
      specs: "24 MiB SRAM \u00b7 167 GiB/s to systolic array \u00b7 10 GiB/s from host",
      desc: "On-chip SRAM that stores input activations and intermediate results. Acts as the main scratchpad for the datapath. Feeds activations into the Systolic Data Setup at 167 GiB/s \u2014 fast enough to keep the Matrix Unit fully utilized.",
      compare: [
        ["", "CPU", "GPU", "TPU"],
        ["On-chip memory", "20 MiB L3 cache", "4.5 MiB L2 + shared", "24 MiB Unified Buffer"],
        ["Internal BW", "~100 GB/s (L3)", "~1 TB/s (shared)", "167 GiB/s"],
        ["Management", "Hardware (cache)", "Software + HW", "Software (explicit)"]
      ],
      why: "3.5\u00d7 more on-chip memory than the GPU. By using a simple software-managed buffer instead of a hardware cache, the TPU avoids the unpredictable latency of cache misses \u2014 key for deterministic execution."
    },
    "arch-setup": {
      name: "Systolic Data Setup",
      specs: "Feeds from Unified Buffer \u00b7 Reformats data for systolic input",
      desc: "Reformats and aligns activation data from the Unified Buffer into the exact layout needed by the systolic array\u2019s input ports. Handles the staggered timing required for the diagonal wavefront.",
      compare: [
        ["", "CPU", "GPU", "TPU"],
        ["Data formatting", "Software (compiler)", "Software (CUDA)", "Dedicated hardware"]
      ],
      why: "A small, specialized hardware unit that eliminates the need for software data reshaping. It ensures the systolic array receives data in exactly the right order for maximum throughput."
    },
    "arch-mmu": {
      name: "Matrix Multiply Unit",
      specs: "256\u00d7256 systolic array \u00b7 65,536 8-bit MACs \u00b7 64K ops/cycle \u00b7 700 MHz \u00b7 92 TOPS peak",
      desc: "The heart of the TPU. A 256\u00d7256 grid of 8-bit multiply-accumulate units arranged as a systolic array. Activations flow left-to-right, weights are pre-loaded, and partial sums accumulate downward. Produces 65,536 multiply-accumulates every single cycle.",
      compare: [
        ["", "CPU (Haswell)", "GPU (K80)", "TPU"],
        ["Parallel MACs", "18 (AVX2)", "2,496 (CUDA cores)", "65,536"],
        ["Precision", "32-bit float", "32-bit float", "8-bit integer"],
        ["Peak perf", "2.6 TOPS", "2.8 TOPS", "92 TOPS"],
        ["Die area %", "~24% (ALU+FPU)", "~50% (SM cores)", "67% (datapath)"]
      ],
      why: "25\u00d7 more MACs than the GPU, 100\u00d7 more than the CPU. The key insight: 8-bit integer multiply is 6\u00d7 cheaper in silicon than 32-bit float, and neural network inference does not need high precision. This is why domain-specific design wins."
    },
    "arch-acc": {
      name: "Accumulators",
      specs: "4 MiB \u00b7 32-bit accumulators \u00b7 256\u00d74096 entries",
      desc: "Stores the 32-bit partial sums output by the Matrix Multiply Unit. Even though inputs are 8-bit, the accumulated dot products need higher precision to avoid overflow. Results are passed to the Activation unit.",
      compare: [
        ["", "CPU", "GPU", "TPU"],
        ["Accumulation", "Registers (AVX)", "Registers (RF)", "4 MiB dedicated SRAM"],
        ["Precision", "32/64-bit float", "32-bit float", "32-bit fixed"]
      ],
      why: "A large, dedicated accumulator buffer means partial results never need to spill to main memory. The CPU and GPU use small register files and must frequently move data through the memory hierarchy."
    },
    "arch-act": {
      name: "Activation Function",
      specs: "Hardware ReLU, Sigmoid, Tanh \u00b7 In-pipeline",
      desc: "Applies non-linear activation functions (ReLU, sigmoid, tanh) in hardware, directly in the data pipeline after accumulation. No need to write results back to memory and re-read them.",
      compare: [
        ["", "CPU", "GPU", "TPU"],
        ["Activation", "Software (math lib)", "CUDA kernel", "Hardwired in pipeline"],
        ["Overhead", "Memory round-trip", "Kernel launch", "Zero (pipelined)"]
      ],
      why: "Fused directly into the datapath. On CPU/GPU, activation is a separate operation requiring a memory write and read. The TPU eliminates this overhead entirely."
    },
    "arch-norm": {
      name: "Normalize / Pool",
      specs: "Batch normalization \u00b7 Max/average pooling \u00b7 In-pipeline",
      desc: "Performs normalization and pooling operations in hardware, continuing the pipeline after activation. Results flow back to the Unified Buffer for the next layer or out to the host.",
      compare: [
        ["", "CPU", "GPU", "TPU"],
        ["Norm/Pool", "Software loops", "CUDA kernels", "Dedicated hardware"],
        ["Overhead", "Cache thrashing", "Kernel launch", "Zero (pipelined)"]
      ],
      why: "These operations are fused into the same pipeline, so a complete layer (MatMul \u2192 Activation \u2192 Normalize \u2192 Pool) runs without any intermediate memory writes. This is impossible on general-purpose hardware."
    },
    "arch-ctrl": {
      name: "Control Logic",
      specs: "2% of die area \u00b7 Simple sequencer \u00b7 No branch prediction",
      desc: "Orchestrates the timing of data movement between all blocks. Extremely minimal compared to CPU/GPU \u2014 no branch predictor, no out-of-order engine, no speculation, no register renaming.",
      compare: [
        ["", "CPU (Haswell)", "GPU (K80)", "TPU"],
        ["Control % die", "~25%", "~24%", "2%"],
        ["Branch pred.", "Yes (complex)", "Warp divergence", "None"],
        ["OoO execution", "Yes", "No (but SIMT)", "No"],
        ["Speculation", "Yes", "Partial", "None"]
      ],
      why: "Just 2% of die area! By eliminating all the control complexity that CPUs need for general-purpose workloads, the TPU frees up silicon for 65,536 MACs. Neural network inference has no branches to predict and no data-dependent control flow."
    },
    "arch-instr": {
      name: "Instruction Buffer",
      specs: "CISC-style \u00b7 5 instruction types \u00b7 From host via PCIe",
      desc: "Holds the small queue of CISC instructions sent by the host CPU. The TPU\u2019s ISA has only 5 instructions: Read_Host_Memory, Read_Weights, MatrixMultiply/Convolve, Activate, Write_Host_Memory.",
      compare: [
        ["", "CPU", "GPU", "TPU"],
        ["ISA size", ">1000 instructions", "~300 (PTX)", "5 instructions"],
        ["Decode", "Complex pipeline", "Warp scheduler", "Trivial sequencer"]
      ],
      why: "Five instructions are all you need for neural network inference. This radical simplicity means almost zero silicon for decode logic, and zero possibility of instruction-decode bottlenecks."
    }
  };

  var tip = document.getElementById("archTip");
  var diagram = document.getElementById("archDiagram");
  var activeBlock = null;

  function buildTipHTML(data) {
    var html = '<div class="arch-tip-name">' + data.name + '</div>';
    html += '<div class="arch-tip-specs">' + data.specs + '</div>';
    html += '<div class="arch-tip-desc">' + data.desc + '</div>';

    if (data.compare && data.compare.length > 1) {
      html += '<table class="arch-tip-table"><thead><tr>';
      data.compare[0].forEach(function (h) {
        html += '<th>' + h + '</th>';
      });
      html += '</tr></thead><tbody>';
      for (var r = 1; r < data.compare.length; r++) {
        html += '<tr>';
        data.compare[r].forEach(function (cell, ci) {
          html += ci === 0 ? '<td class="arch-tip-label">' + cell + '</td>' : '<td>' + cell + '</td>';
        });
        html += '</tr>';
      }
      html += '</tbody></table>';
    }

    html += '<div class="arch-tip-why"><strong>Design insight:</strong> ' + data.why + '</div>';
    return html;
  }

  function showTip(blockEl) {
    var id = blockEl.id;
    var data = components[id];
    if (!data) return;

    // Highlight
    if (activeBlock) activeBlock.classList.remove("arch-block-active");
    blockEl.classList.add("arch-block-active");
    activeBlock = blockEl;

    tip.innerHTML = buildTipHTML(data);
    tip.classList.add("visible");

    // Position: try right of block, then below, then left
    var isMobile = window.innerWidth < 600;
    if (isMobile) {
      // Bottom sheet style
      tip.style.position = "fixed";
      tip.style.bottom = "0";
      tip.style.left = "0";
      tip.style.right = "0";
      tip.style.top = "auto";
      tip.style.maxHeight = "50vh";
      return;
    }

    tip.style.position = "absolute";
    tip.style.bottom = "";
    tip.style.right = "";
    tip.style.maxHeight = "";

    var dRect = diagram.getBoundingClientRect();
    var bRect = blockEl.getBoundingClientRect();
    var tW = Math.min(380, window.innerWidth - 32);
    tip.style.width = tW + "px";

    // Try right
    var leftPos = bRect.right - dRect.left + 12;
    var topPos = bRect.top - dRect.top;

    if (leftPos + tW > dRect.width + 20) {
      // Try left
      leftPos = bRect.left - dRect.left - tW - 12;
      if (leftPos < -10) {
        // Fall below
        leftPos = Math.max(0, bRect.left - dRect.left);
        topPos = bRect.bottom - dRect.top + 12;
      }
    }

    tip.style.left = leftPos + "px";
    tip.style.top = topPos + "px";
  }

  function hideTip() {
    if (activeBlock) activeBlock.classList.remove("arch-block-active");
    activeBlock = null;
    tip.classList.remove("visible");
  }

  // Wire events
  var blocks = diagram.querySelectorAll(".arch-block");
  var isTouchDevice = "ontouchstart" in window;

  blocks.forEach(function (block) {
    if (isTouchDevice) {
      block.addEventListener("click", function (e) {
        e.stopPropagation();
        if (activeBlock === block) {
          hideTip();
        } else {
          showTip(block);
        }
      });
    } else {
      block.addEventListener("mouseenter", function () { showTip(block); });
      block.addEventListener("mouseleave", function () { hideTip(); });
    }
  });

  // Tap elsewhere to close on mobile
  document.addEventListener("click", function (e) {
    if (isTouchDevice && activeBlock && !e.target.closest(".arch-block") && !e.target.closest(".arch-tip")) {
      hideTip();
    }
  });

  // ================================================================
  // SVG Data-Flow & Control Arrows (desktop only)
  // Draws directional arrows with bandwidth labels between blocks,
  // matching the reference TPU block diagram from the paper.
  // ================================================================

  var NS = "http://www.w3.org/2000/svg";
  var ARROW_COLOR = "#5c5347";
  var CTRL_COLOR  = "#c0392b";
  var LABEL_COLOR = "#5c5347";

  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function drawSvgArrows() {
    var old = diagram.querySelector(".arch-svg-arrows");
    if (old) old.remove();

    if (window.innerWidth < 600) return;

    var dRect = diagram.getBoundingClientRect();
    var W = dRect.width, H = dRect.height;
    if (W < 50 || H < 50) return;

    var svg = el("svg", {
      class: "arch-svg-arrows",
      width: W, height: H,
      viewBox: "0 0 " + W + " " + H
    });
    svg.style.position = "absolute";
    svg.style.top = "0";
    svg.style.left = "0";
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.overflow = "visible";

    // ---- Arrowhead markers ----
    var defs = el("defs", {});

    function addMarker(id, color, sz) {
      var h = sz * 0.75;
      var m = el("marker", {
        id: id, markerWidth: sz, markerHeight: h,
        refX: sz, refY: h / 2, orient: "auto", markerUnits: "userSpaceOnUse"
      });
      m.appendChild(el("path", {
        d: "M0,0 L" + sz + "," + (h / 2) + " L0," + h + " Z", fill: color
      }));
      defs.appendChild(m);
    }
    addMarker("ahD", ARROW_COLOR, 8);
    addMarker("ahC", CTRL_COLOR, 6);
    svg.appendChild(defs);
    diagram.insertBefore(svg, diagram.firstChild);

    // ---- helpers ----
    function bp(id) {
      var e = document.getElementById(id);
      if (!e) return null;
      var r = e.getBoundingClientRect();
      return {
        cx: r.left + r.width / 2 - dRect.left,
        cy: r.top + r.height / 2 - dRect.top,
        t: r.top - dRect.top, b: r.bottom - dRect.top,
        l: r.left - dRect.left, r: r.right - dRect.left,
        w: r.width, h: r.height
      };
    }

    // single arrow
    function arrow(x1, y1, x2, y2, opts) {
      opts = opts || {};
      var g = el("g", {});
      var a = { x1: x1, y1: y1, x2: x2, y2: y2,
        stroke: opts.color || ARROW_COLOR, "stroke-width": opts.sw || 2 };
      if (!opts.noHead) a["marker-end"] = "url(#" + (opts.mk || "ahD") + ")";
      g.appendChild(el("line", a));
      svg.appendChild(g);
      return g;
    }

    // label helper
    function label(x, y, txt, opts) {
      opts = opts || {};
      var tx = el("text", {
        x: x, y: y,
        "text-anchor": opts.anchor || "middle",
        fill: opts.color || LABEL_COLOR,
        "font-size": opts.size || "9",
        "font-family": "'IBM Plex Mono', monospace",
        "font-weight": "600"
      });
      tx.textContent = txt;
      svg.appendChild(tx);
    }

    // bidirectional straight arrow (two offset parallel arrows)
    function bidir(x1, y1, x2, y2, opts) {
      opts = opts || {};
      var dx = x2 - x1, dy = y2 - y1;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) return;
      var off = opts.off || 3;
      var px = -dy / len * off, py = dx / len * off;
      arrow(x1 + px, y1 + py, x2 + px, y2 + py, opts);
      arrow(x2 - px, y2 - py, x1 - px, y1 - py, opts);
      // label centered
      if (opts.label) {
        var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        var isV = Math.abs(dy) > Math.abs(dx);
        label(isV ? mx + off + 7 : mx, isV ? my : my - off - 4, opts.label);
      }
    }

    // polyline with end-arrow
    function poly(pts, opts) {
      opts = opts || {};
      var g = el("g", {});
      g.appendChild(el("polyline", {
        points: pts.map(function (p) { return p[0] + "," + p[1]; }).join(" "),
        fill: "none",
        stroke: opts.color || ARROW_COLOR,
        "stroke-width": opts.sw || 2,
        "marker-end": "url(#" + (opts.mk || "ahD") + ")"
      }));
      svg.appendChild(g);
      if (opts.label) {
        var lx = opts.lx != null ? opts.lx : (pts[0][0] + pts[1][0]) / 2;
        var ly = opts.ly != null ? opts.ly : (pts[0][1] + pts[1][1]) / 2 - 5;
        label(lx, ly, opts.label, { anchor: opts.la });
      }
    }

    // Draw a small red control box in SVG
    function ctrlBox(cx, cy, w, h) {
      w = w || 38; h = h || 16;
      var g = el("g", {});
      g.appendChild(el("rect", {
        x: cx - w / 2, y: cy - h / 2, width: w, height: h,
        rx: 3, ry: 3, fill: CTRL_COLOR, opacity: "0.9"
      }));
      var t = el("text", {
        x: cx, y: cy + 3.5,
        "text-anchor": "middle", fill: "#fff",
        "font-size": "7", "font-family": "'IBM Plex Mono', monospace",
        "font-weight": "700"
      });
      t.textContent = "CTRL";
      g.appendChild(t);
      svg.appendChild(g);
      return { cx: cx, cy: cy, t: cy - h / 2, b: cy + h / 2,
               l: cx - w / 2, r: cx + w / 2 };
    }

    // ---- block positions ----
    var dram  = bp("arch-dram");
    var ddr   = bp("arch-ddr");
    var wfifo = bp("arch-wfifo");
    var pcie  = bp("arch-pcie");
    var host  = bp("arch-host");
    var ubuf  = bp("arch-ubuf");
    var setup = bp("arch-setup");
    var mmu   = bp("arch-mmu");
    var acc   = bp("arch-acc");
    var act   = bp("arch-act");
    var norm  = bp("arch-norm");
    var ctrl  = bp("arch-ctrl");
    var instr = bp("arch-instr");

    if (!dram || !mmu || !norm || !ubuf) return;

    var gap = 5;

    // =========================================================
    //  DATA-FLOW ARROWS
    // =========================================================

    // 1. DDR3 DRAM → DDR3-2133 (30 GiB/s, one-way DOWN)
    arrow(dram.cx, dram.b + gap, ddr.cx, ddr.t - gap);
    label(dram.cx + 8, (dram.b + ddr.t) / 2 + 2, "30 GiB/s", { anchor: "start" });

    // 2. DDR3-2133 → Weight FIFO (30 GiB/s, one-way RIGHT)
    arrow(ddr.r + gap, ddr.cy, wfifo.l - gap, wfifo.cy);
    label((ddr.r + wfifo.l) / 2, ddr.cy - 6, "30 GiB/s");

    // 3. PCIe ↔ external (14 GiB/s, bidirectional LEFT outward)
    if (pcie) {
      var extX = pcie.l - 40;
      bidir(extX, pcie.cy, pcie.l - gap, pcie.cy, { label: "14 GiB/s" });
    }

    // 4. PCIe ↔ Host Interface (14 GiB/s, bidirectional)
    if (pcie && host) {
      bidir(pcie.r + gap, pcie.cy, host.l - gap, host.cy, { label: "14 GiB/s" });
    }

    // 5. Host ↔ DDR3-2133 (14 GiB/s, bidirectional, L-shaped)
    //    Route: from host top → up to ddr cy → right to ddr left
    if (host && ddr) {
      var hx1 = host.cx - 3, hx2 = host.cx + 3;
      // forward (host → ddr): go up then right
      poly([
        [hx1, host.t - gap],
        [hx1, ddr.cy - 3],
        [ddr.l - gap, ddr.cy - 3]
      ], {});
      // backward (ddr → host): go left then down
      poly([
        [ddr.l - gap, ddr.cy + 3],
        [hx2, ddr.cy + 3],
        [hx2, host.t - gap]
      ], {});
      label(hx1 - 8, (host.t + ddr.cy) / 2, "14 GiB/s", { anchor: "end" });
    }

    // 6. Host ↔ Unified Buffer (10 GiB/s, bidirectional)
    if (host && ubuf) {
      bidir(host.r + gap, host.cy, ubuf.l - gap, ubuf.cy, { label: "10 GiB/s" });
    }

    // 7. Unified Buffer → Systolic Data Setup (167 GiB/s, one-way RIGHT)
    arrow(ubuf.r + gap, ubuf.cy, setup.l - gap, setup.cy);
    label((ubuf.r + setup.l) / 2, ubuf.cy - 6, "167 GiB/s");

    // 8. Systolic Data Setup → MMU (one-way RIGHT)
    arrow(setup.r + gap, setup.cy, mmu.l - gap, mmu.cy);

    // 9. Weight FIFO → MMU (30 GiB/s, one-way DOWN)
    arrow(wfifo.cx, wfifo.b + gap, mmu.cx, mmu.t - gap);
    label(wfifo.cx + 8, (wfifo.b + mmu.t) / 2 + 2, "30 GiB/s", { anchor: "start" });

    // 10–12. MMU → Acc → Act → Norm (one-way DOWN chain)
    arrow(mmu.cx, mmu.b + gap, acc.cx, acc.t - gap);
    arrow(acc.cx, acc.b + gap, act.cx, act.t - gap);
    arrow(act.cx, act.b + gap, norm.cx, norm.t - gap);

    // 13. Normalize/Pool → Unified Buffer (167 GiB/s, L-shaped return LEFT then UP)
    var retX = ubuf.cx;
    poly([
      [norm.l - gap, norm.cy],
      [retX, norm.cy],
      [retX, ubuf.b + gap]
    ], {
      label: "167 GiB/s",
      lx: (norm.l - gap + retX) / 2,
      ly: norm.cy - 7
    });

    // =========================================================
    //  CONTROL-FLOW ARROWS  (thin red)
    // =========================================================
    var cOpts = { color: CTRL_COLOR, sw: 1.5, mk: "ahC" };

    // Place SVG control boxes at strategic locations matching reference diagram
    // C1: upper-left — between Host top and DDR row (controls memory interface)
    var c1x = (host.r + ubuf.l) / 2;
    var c1y = (ddr.b + host.t) / 2 + 2;
    var C1 = ctrlBox(c1x, c1y);

    // C2: upper-right — right of ubuf area (controls data setup & MMU feed)
    var c2x = (setup.l + setup.r) / 2;
    var c2y = c1y;
    var C2 = ctrlBox(c2x, c2y);

    // C3: lower-right — near the compute pipeline (controls acc/act/norm)
    var c3x = mmu.l - 25;
    var c3y = (acc.b + act.t) / 2;
    var C3 = ctrlBox(c3x, c3y);

    // -- Instr → Ctrl (HTML blocks, upward since instr is now below ctrl) --
    if (instr && ctrl) {
      arrow(instr.cx, instr.t - gap, ctrl.cx, ctrl.b + gap, cOpts);
    }

    // -- Ctrl → C1 (upward-left from main ctrl to upper-left ctrl) --
    if (ctrl) {
      poly([
        [ctrl.cx, ctrl.t - gap],
        [ctrl.cx, C1.cy],
        [C1.r + gap, C1.cy]
      ], cOpts);
    }

    // -- C1 → C2 (rightward, upper control bus) --
    arrow(C1.r + gap, C1.cy, C2.l - gap, C2.cy, cOpts);

    // -- C1 → Host Interface (downward to host top, control signal to host) --
    if (host) {
      arrow(C1.cx, C1.b + gap, host.cx, host.t - gap, cOpts);
    }

    // -- C2 → C3 (down along the right side, control to compute pipeline) --
    poly([
      [C2.cx, C2.b + gap],
      [C2.cx, setup.t - 4],
      [C3.cx, setup.t - 4],
      [C3.cx, C3.t - gap]
    ], cOpts);

    // -- C3 → back toward main Ctrl (leftward along bottom, completing the ring) --
    if (ctrl) {
      poly([
        [C3.l - gap, C3.cy],
        [ctrl.r + gap + 8, C3.cy],
        [ctrl.r + gap + 8, ctrl.cy],
        [ctrl.r + gap, ctrl.cy]
      ], cOpts);
    }
  }

  // Draw arrows on load and resize
  setTimeout(drawSvgArrows, 120);
  window.addEventListener("resize", function () {
    setTimeout(drawSvgArrows, 60);
  });
})();
