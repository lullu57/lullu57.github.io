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
})();
