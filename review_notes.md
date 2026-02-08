# Review Notes: TPU Architecture Demo Website

## Overview
The website is a high-quality interactive visualization of the TPU architecture described in Jouppi et al. (ISCA '17). It effectively uses the data from the paper to demonstrate the performance differences between CPU, GPU, and TPU. The implementation of the systolic array and pipeline animations is conceptually sound.

However, a deeper review has identified **critical mathematical errors** in the Roofline Model and **data discrepancies** in the CPU comparisons that significantly alter the scientific accuracy of the visualization.

## Critical Issues

### 1. Roofline Model Calculation Error (Logic Bug)
**Location:** `roofline.js` line 52 (`rooflinePath` function) and `data.js`.
**Issue:** The formula used to calculate the roofline's slanted region and ridge point fails to account for the "2 Operations per MAC" factor.
*   **Paper Definition:** The X-axis in the paper (Figures 5-7) is **"Operational Intensity: MAC Ops/weight byte"**.
*   **Demo Calculation:** The code calculates `Peak_Ops / Bandwidth` (approx. `92T / 34G ≈ 2706`).
*   **Paper Ridge Point:** The paper explicitly states the ridge point is at **1350** (Figure 5 caption).
*   **The Error:** The demo is plotting "Total Operations" (Ops) against an X-axis of "MACs". Since 1 MAC = 2 Ops (multiply + add), the calculated ridge point is exactly **2x** too high.
*   **Visual Impact:** The slanted "memory-bound" roofline is drawn 2x lower than reality for the given X-axis. This causes valid performance data points (like MLP0) to float **above** the roofline, which implies performance exceeding the theoretical hardware limit.

**Fix:** Update the formula in `roofline.js`:
```javascript
// Ridge point (in MACs/Byte) = Peak_Ops / (Bandwidth * 2)
const ridge = peakTOPS / (2 * memBw) * 1e3;
// Slanted line Y (Ops/s) = X (MACs/Byte) * Bandwidth * 2
const y = Math.min(peakTOPS, 2 * memBw * x / 1e3);
```

### 2. CPU Peak Performance Discrepancy
**Location:** `data.js` (`platforms.cpu.peakTOPS`).
**Issue:** The dataset uses **2.6 TOPS** (theoretical 8-bit peak) for the Haswell CPU.
*   **Paper Context:** Section 8 explicitly states: *"We originally had 8-bit results for just one DNN on the CPU... It was less confusing... to present all CPU results in floating point"*.
*   **Evidence:** Figure 6 in the paper shows the Haswell roofline ceiling at **~1.3 TOPS** (FP32 peak), not 2.6.
*   **Impact:** The demo's CPU roofline is **2x higher** than the paper's comparison charts, unfairly inflating the CPU's visual performance relative to the TPU in this context.

**Recommendation:** Change `platforms.cpu.peakTOPS` in `data.js` from `2.6` to **1.3**.

## Data Inconsistencies

### 3. Die Area Breakdown (Activation Pipeline)
**Location:** `data.js` (`dieArea.tpu`).
**Issue:** The demo lists "Activation / Pool" area as **4%**.
**Paper Evidence:** Figure 2 explicitly labels "Activation Pipeline" as **6%**.
**Recommendation:** Update `data.js` to change `pct: 4` to `pct: 6` for the Activation/Pool component.

### 4. Memory Bandwidth Units
**Location:** `arch.js` vs `data.js`.
**Issue:**
*   `arch.js` diagram labels use **30 GiB/s**.
*   `data.js` and paper Table 2 use **34 GB/s**.
**Analysis:** This reflects an inconsistency in the paper itself (Figure 1 labels vs Table 2 specs).
**Recommendation:** No code change needed, but be aware that users may ask why the numbers differ. The 34 GB/s figure is the correct one for performance calculations (DDR3-2133 theoretical max).

## Verification Checks (Pass)
*   **Pipeline Logic:** `pipeline.js` correctly implements the "fused" stages described in Section 2 (MatMul -> Accum -> Activate -> Norm/Pool) without memory round-trips.
*   **Systolic Simulation:** `systolic.js` correctly visualizes the O(N^2) vs O(N^3) memory access difference, which is the paper's key insight for the matrix unit.
*   **Workload Data:** Table 1 values (Batch size, Weights, Ops/Byte) in `data.js` match the paper exactly.

## Summary of Action Items
1.  **Modify `roofline.js`**: Apply the `/ (2 * memBw)` fix to the ridge point calculation.
2.  **Modify `data.js`**: Change CPU peak TOPS to `1.3`.
3.  **Modify `data.js`**: Change TPU Activation Die Area to `6%`.