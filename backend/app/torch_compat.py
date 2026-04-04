"""PyTorch/macOS quirks: official Mac wheels have no NVIDIA CUDA; silence misleading CUDA-related warnings."""

from __future__ import annotations

import warnings


def apply_torch_compat() -> None:
    """Call once at process startup, before models load (e.g. from app.main)."""
    # x_transformers still uses torch.cuda.amp.autocast; on Mac that emits a loud FutureWarning
    # even though autocast is disabled on those code paths — users read it as "CUDA broken".
    warnings.filterwarnings(
        "ignore",
        message=r".*`torch\.cuda\.amp\.autocast` is deprecated.*",
        category=FutureWarning,
    )
    warnings.filterwarnings(
        "ignore",
        message=r".*torch\.cuda\.amp\.autocast.*",
        category=FutureWarning,
    )
