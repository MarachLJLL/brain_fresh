#!/usr/bin/env python3
"""
Process raw TRIBE v2 analysis export into per-modality brain activation drives.

Takes the raw analysis_export.json (with per-frame vertex activations) and the
brain modality map, then computes how strongly each modality region (visual,
audio, text) is activated at each time point.

Activation methods available:
  --method abs_percentile   (default) |mean(vertices_in_region)| normalized by 95th percentile
  --method relu_percentile  ReLU(vertices) then mean, normalized by 95th percentile
  --method sigmoid          sigmoid(mean(vertices_in_region) * gain)

Output: a processed AnalysisResult JSON ready for the frontend.
"""

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any


def load_json(path: str) -> Any:
    with open(path) as f:
        return json.load(f)


def build_vertex_modality_membership(
    modality_map: dict[str, list[int]],
    n_map: int,
    n_act: int,
) -> dict[str, list[float]]:
    """
    For each activation vertex (n_act total), compute fractional membership in
    each modality by aggregating over the full-mesh modality map (n_map total).

    The frontend maps mesh vertex i → activation vertex:
        ai = min(n_act - 1, floor((i + 0.5) / n_map * n_act))

    We reverse this: accumulate modality counts per activation vertex, then
    normalize to [0, 1].
    """
    vis_map = modality_map["visual"]
    aud_map = modality_map["audio"]
    txt_map = modality_map["text"]

    vis_acc = [0.0] * n_act
    aud_acc = [0.0] * n_act
    txt_acc = [0.0] * n_act
    counts = [0] * n_act

    for i in range(n_map):
        ai = min(n_act - 1, int((i + 0.5) / n_map * n_act))
        vis_acc[ai] += vis_map[i]
        aud_acc[ai] += aud_map[i]
        txt_acc[ai] += txt_map[i]
        counts[ai] += 1

    for j in range(n_act):
        c = max(1, counts[j])
        vis_acc[j] /= c
        aud_acc[j] /= c
        txt_acc[j] /= c

    return {"visual": vis_acc, "audio": aud_acc, "text": txt_acc}


def sigmoid(x: float, gain: float = 5.0, midpoint: float = 0.3) -> float:
    return 1.0 / (1.0 + math.exp(-gain * (x - midpoint)))


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    idx = pct / 100.0 * (len(s) - 1)
    lo = int(idx)
    hi = min(lo + 1, len(s) - 1)
    frac = idx - lo
    return s[lo] * (1 - frac) + s[hi] * frac


def compute_modality_drives(
    brain_activations: list[dict],
    membership: dict[str, list[float]],
    method: str = "abs_percentile",
) -> list[dict[str, float]]:
    """
    For each time frame, compute a drive value [0, 1] for each modality.
    Returns list of {visual, audio, text} dicts, one per frame.

    Methods:
      abs_percentile   - |mean| baseline-subtracted, percentile-normalized
      relu_percentile  - ReLU(mean) baseline-subtracted, percentile-normalized
      sigmoid          - sigmoid(weighted_mean * gain)
      signed_minmax    - signed mean, then min-max normalized across frames
    """
    n_act = len(membership["visual"])
    modalities = ("visual", "audio", "text")

    # Step 1: compute raw weighted mean per modality per frame
    raw_means: list[dict[str, float]] = []
    for frame in brain_activations:
        verts = frame["vertices"]
        n_v = len(verts)
        means: dict[str, float] = {}

        for mod in modalities:
            mask = membership[mod]
            weighted_sum = 0.0
            weight_total = 0.0

            for j in range(min(n_v, n_act)):
                w = mask[j]
                if w < 0.01:
                    continue
                weighted_sum += verts[j] * w
                weight_total += w

            means[mod] = weighted_sum / max(weight_total, 1e-9)

        raw_means.append(means)

    # Step 2: apply activation function and normalize
    if method == "sigmoid":
        result = []
        for m in raw_means:
            result.append({mod: sigmoid(m[mod], gain=6.0, midpoint=0.15) for mod in modalities})
        return result

    if method == "signed_minmax":
        result = [{} for _ in raw_means]
        for mod in modalities:
            vals = [m[mod] for m in raw_means]
            lo, hi = min(vals), max(vals)
            span = hi - lo if hi - lo > 1e-9 else 1.0
            for i, m in enumerate(raw_means):
                result[i][mod] = (m[mod] - lo) / span
        return result

    # abs_percentile / relu_percentile: subtract per-modality baseline, then
    # apply activation, then percentile-normalize
    baseline: dict[str, float] = {}
    for mod in modalities:
        vals = [m[mod] for m in raw_means]
        baseline[mod] = sum(vals) / len(vals)

    result: list[dict[str, float]] = []
    for m in raw_means:
        d: dict[str, float] = {}
        for mod in modalities:
            delta = m[mod] - baseline[mod]
            if method == "relu_percentile":
                d[mod] = max(0.0, delta)
            else:  # abs_percentile
                d[mod] = abs(delta)
        result.append(d)

    for mod in modalities:
        vals = [d[mod] for d in result]
        p95 = percentile(vals, 95)
        if p95 > 1e-9:
            for d in result:
                d[mod] = min(1.0, d[mod] / p95)

    return result


def detect_low_engagement(
    timeline: list[dict],
    threshold: float = 0.3,
    min_duration: float = 2.0,
) -> list[dict]:
    """Find contiguous sections where overall engagement is below threshold."""
    sections = []
    in_low = False
    start_t = 0.0

    for pt in timeline:
        overall = (pt["visual"] + pt["audio"] + pt["text"]) / 3.0
        if overall < threshold:
            if not in_low:
                in_low = True
                start_t = pt["time"]
        else:
            if in_low:
                end_t = pt["time"]
                if end_t - start_t >= min_duration:
                    low_pt = min(
                        timeline,
                        key=lambda p: (p["visual"] + p["audio"] + p["text"]) / 3
                        if start_t <= p["time"] <= end_t
                        else float("inf"),
                    )
                    weakest = min(
                        ("visual", "audio", "text"),
                        key=lambda m: low_pt[m],
                    )
                    score = (low_pt["visual"] + low_pt["audio"] + low_pt["text"]) / 3
                    sections.append({
                        "start_time": round(start_t, 2),
                        "end_time": round(end_t, 2),
                        "modality": weakest,
                        "score": round(score, 4),
                        "transcript": "",
                    })
                in_low = False

    if in_low:
        end_t = timeline[-1]["time"]
        if end_t - start_t >= min_duration:
            sections.append({
                "start_time": round(start_t, 2),
                "end_time": round(end_t, 2),
                "modality": "visual",
                "score": 0.1,
                "transcript": "",
            })

    return sections


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "analysis_json",
        help="Path to raw analysis_export.json",
    )
    parser.add_argument(
        "--modality-map",
        default=None,
        help="Path to brain-modality-map.json (default: ../frontend/public/brain-modality-map.json)",
    )
    parser.add_argument(
        "--method",
        choices=["abs_percentile", "relu_percentile", "sigmoid", "signed_minmax"],
        default="signed_minmax",
        help="Activation method for computing modality drives",
    )
    parser.add_argument(
        "--low-threshold",
        type=float,
        default=0.3,
        help="Threshold below which engagement is considered low",
    )
    parser.add_argument(
        "-o", "--output",
        default=None,
        help="Output path (default: <input>_processed.json)",
    )
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    if args.modality_map:
        map_path = args.modality_map
    else:
        map_path = str(script_dir.parent / "frontend" / "public" / "brain-modality-map.json")

    print(f"Loading analysis from {args.analysis_json}")
    raw = load_json(args.analysis_json)

    print(f"Loading modality map from {map_path}")
    modality_map = load_json(map_path)

    n_map = len(modality_map["visual"])
    n_act = len(raw["brain_activations"][0]["vertices"])
    print(f"Modality map: {n_map} vertices | Activation: {n_act} vertices/frame | Frames: {len(raw['brain_activations'])}")

    print(f"Building vertex→modality membership mapping...")
    membership = build_vertex_modality_membership(modality_map, n_map, n_act)

    print(f"Computing modality drives (method={args.method})...")
    drives = compute_modality_drives(raw["brain_activations"], membership, args.method)

    # Build processed timeline using computed drives
    timeline = []
    for i, frame in enumerate(raw["brain_activations"]):
        d = drives[i]
        timeline.append({
            "time": frame["time"],
            "visual": round(d["visual"], 4),
            "audio": round(d["audio"], 4),
            "text": round(d["text"], 4),
        })

    print(f"\nDrive statistics (method={args.method}):")
    for mod in ("visual", "audio", "text"):
        vals = [t[mod] for t in timeline]
        print(f"  {mod:8s}: min={min(vals):.4f}  max={max(vals):.4f}  mean={sum(vals)/len(vals):.4f}")

    # Detect low engagement sections from the computed drives
    low_sections = detect_low_engagement(timeline, threshold=args.low_threshold)
    print(f"Detected {len(low_sections)} low-engagement sections")

    # Preserve original transcript_segments and brain_activations
    output: dict[str, Any] = {
        "video_id": raw.get("video_id", "processed"),
        "duration": raw.get("duration", timeline[-1]["time"] if timeline else 0),
        "timeline": timeline,
        "brain_activations": raw["brain_activations"],
        "low_engagement_sections": low_sections if low_sections else raw.get("low_engagement_sections", []),
        "transcript_segments": raw.get("transcript_segments", []),
        "processing_meta": {
            "method": args.method,
            "n_frames": len(timeline),
            "n_vertices_per_frame": n_act,
            "modality_map_vertices": n_map,
        },
    }

    out_path = args.output or args.analysis_json.replace(".json", f"_processed.json")
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nProcessed analysis written to {out_path}")

    return out_path


if __name__ == "__main__":
    main()
