from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np


def _flatten(values: np.ndarray) -> list[float]:
    return np.asarray(values, dtype=np.float32).reshape(-1).tolist()


def _flatten_indices(values: np.ndarray) -> list[int]:
    return np.asarray(values, dtype=np.uint32).reshape(-1).tolist()


def _load_fsaverage(mesh: str):
    try:
        from nilearn.datasets import fetch_surf_fsaverage
        from nilearn.surface import load_surf_data, load_surf_mesh
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "nilearn is required to export TRIBE brain surfaces. "
            "Install backend dependencies again so the new plotting packages are available."
        ) from exc

    fsaverage = fetch_surf_fsaverage(mesh=mesh)
    pial_left_coords, pial_left_faces = load_surf_mesh(fsaverage["pial_left"])
    pial_right_coords, pial_right_faces = load_surf_mesh(fsaverage["pial_right"])
    infl_left_coords, _ = load_surf_mesh(fsaverage["infl_left"])
    infl_right_coords, _ = load_surf_mesh(fsaverage["infl_right"])
    sulc_left = load_surf_data(fsaverage["sulc_left"])
    sulc_right = load_surf_data(fsaverage["sulc_right"])

    return {
        "pial_left_coords": pial_left_coords,
        "pial_right_coords": pial_right_coords,
        "pial_left_faces": pial_left_faces,
        "pial_right_faces": pial_right_faces,
        "infl_left_coords": infl_left_coords,
        "infl_right_coords": infl_right_coords,
        "sulc_left": sulc_left,
        "sulc_right": sulc_right,
    }


def export_surfaces(output_path: Path, mesh: str = "fsaverage5") -> Path:
    surface = _load_fsaverage(mesh)
    pial_left = surface["pial_left_coords"]
    pial_right = surface["pial_right_coords"]
    infl_left = surface["infl_left_coords"]
    infl_right = surface["infl_right_coords"]
    sulc_left = surface["sulc_left"]
    sulc_right = surface["sulc_right"]
    faces_left = surface["pial_left_faces"]
    faces_right = surface["pial_right_faces"] + len(pial_left)

    payload = {
        "mesh": mesh,
        "vertexCount": int(len(pial_left) + len(pial_right)),
        "lhCount": int(len(pial_left)),
        "pialVertices": _flatten(np.concatenate([pial_left, pial_right], axis=0)),
        "inflatedVertices": _flatten(np.concatenate([infl_left, infl_right], axis=0)),
        "indices": _flatten_indices(np.concatenate([faces_left, faces_right], axis=0)),
        "sulc": _flatten(np.concatenate([sulc_left, sulc_right], axis=0)),
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload))
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Export fsaverage cortical surfaces for the frontend brain viewer. "
            "The asset layout matches TRIBE v2's fsaverage5 plotting conventions."
        )
    )
    parser.add_argument(
        "--mesh",
        default="fsaverage5",
        help="fsaverage mesh name, for example fsaverage5.",
    )
    parser.add_argument(
        "--output",
        default="../../frontend/public/brain-surfaces.json",
        help="Output JSON path, relative to backend/scripts.",
    )
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    output_path = (script_dir / args.output).resolve()
    written = export_surfaces(output_path=output_path, mesh=args.mesh)
    print(f"Wrote {written}")


if __name__ == "__main__":
    main()
