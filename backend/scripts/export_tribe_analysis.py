#!/usr/bin/env python3
"""Export TRIBE analysis to JSON for the Brain Fresh UI (run on a GPU machine or Colab).

Usage (from repo `backend/` with venv active):
  python scripts/export_tribe_analysis.py /path/to/video.mp4 -o analysis.json --video-id a1b2c3d4

Use the same --video-id as the Brain Fresh app shows after upload (8-char id), then either:
  - POST the JSON to /api/video/import-result/{video_id} with ALLOW_ANALYSIS_IMPORT=1, or
  - Load the JSON from the UI when local processing fails.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))


async def _run(video: Path, output: Path, video_id: str | None) -> None:
    from app.services.tribe_processor import TribeProcessor

    proc = TribeProcessor.get_instance()
    await proc.load_models()
    result = await proc.process_video(str(video.resolve()))
    if video_id:
        result = result.model_copy(update={"video_id": video_id})
    output.write_text(result.model_dump_json(indent=2))
    print(f"Wrote {output} ({len(result.timeline)} timeline points)")


def main() -> None:
    p = argparse.ArgumentParser(description="Export TRIBE AnalysisResult JSON for Brain Fresh")
    p.add_argument("video", type=Path, help="Input video path")
    p.add_argument("-o", "--output", type=Path, default=Path("analysis_export.json"))
    p.add_argument(
        "--video-id",
        dest="video_id",
        default=None,
        help="Set video_id in JSON to match an uploaded clip in the app",
    )
    args = p.parse_args()
    if not args.video.is_file():
        sys.exit(f"Video not found: {args.video}")
    asyncio.run(_run(args.video, args.output, args.video_id))


if __name__ == "__main__":
    main()
