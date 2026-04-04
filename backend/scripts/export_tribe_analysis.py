#!/usr/bin/env python3
"""Export TRIBE analysis to JSON for the Brain Fresh UI (run on a GPU machine or Colab).

Usage (from repo `backend/` with venv active):
  python scripts/export_tribe_analysis.py /path/to/video.mp4 -o analysis.json --video-id a1b2c3d4
  python scripts/export_tribe_analysis.py /path/to/video.mp4 --progress   # tqdm bar (nice in Colab)

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


async def _run(video: Path, output: Path, video_id: str | None, *, show_progress: bool) -> None:
    from app.services.tribe_processor import TribeProcessor

    proc = TribeProcessor.get_instance()

    if show_progress:
        try:
            from tqdm.auto import tqdm
        except ImportError:
            show_progress = False

    if show_progress:
        pbar = tqdm(total=100, desc="Starting…", dynamic_ncols=True, mininterval=0.5)

        async def progress_callback(_status: str, prog: float, message: str) -> None:
            pbar.set_description_str(message[:72], refresh=False)
            pbar.n = min(100, max(0, int(prog)))
            pbar.refresh()

        try:
            await proc.load_models(progress_callback)
            result = await proc.process_video(str(video.resolve()), progress_callback)
        finally:
            pbar.n = 100
            pbar.set_description_str("Done")
            pbar.refresh()
            pbar.close()
    else:
        await proc.load_models()
        result = await proc.process_video(str(video.resolve()))

    if video_id:
        result = result.model_copy(update={"video_id": video_id})
    output.write_text(result.model_dump_json(indent=2))
    print(f"Wrote {output} ({len(result.timeline)} timeline points)")


def main() -> None:
    import traceback

    p = argparse.ArgumentParser(description="Export TRIBE AnalysisResult JSON for Brain Fresh")
    p.add_argument("video", type=Path, help="Input video path")
    p.add_argument("-o", "--output", type=Path, default=Path("analysis_export.json"))
    p.add_argument(
        "--video-id",
        dest="video_id",
        default=None,
        help="Set video_id in JSON to match an uploaded clip in the app",
    )
    p.add_argument(
        "--progress",
        "-p",
        action="store_true",
        help="Show a tqdm progress bar (recommended in Google Colab)",
    )
    args = p.parse_args()
    video = args.video.expanduser().resolve()
    if not video.is_file():
        print(f"ERROR: Video not found or not a file:\n  {video}", file=sys.stderr)
        sys.exit(1)
    try:
        asyncio.run(_run(video, args.output, args.video_id, show_progress=args.progress))
    except KeyboardInterrupt:
        raise
    except Exception:
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
