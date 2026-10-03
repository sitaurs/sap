"""Read generated images and write integration metadata. Does not edit images."""

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).parent
STATES = {
    "idle": {
        "file": "sapa-idle-blink-sheet.png",
        "durations_ms": [4000, 220, 50, 70, 50, 220, 1600, 1790],
        "loop": True,
        "trigger": "No active interaction or pending request.",
    },
    "wave": {
        "file": "sapa-wave-sheet.png",
        "durations_ms": [100, 90, 90, 100, 100, 100, 90, 130],
        "loop": False,
        "trigger": "Opening the SAPA chat.",
    },
    "curious": {
        "file": "sapa-curious-sheet.png",
        "durations_ms": [100, 90, 90, 100, 90, 90, 90, 150],
        "loop": False,
        "trigger": "Pointer hover or keyboard focus, with a cooldown.",
    },
    "thinking": {
        "file": "sapa-thinking-sheet.png",
        "durations_ms": [240, 180, 160, 180, 120, 240, 240, 240],
        "loop": True,
        "trigger": "A real AI request remains pending.",
    },
    "success": {
        "file": "sapa-success-jump-sheet.png",
        "durations_ms": [90, 70, 60, 90, 60, 80, 80, 110],
        "loop": False,
        "trigger": "A real operation returns success.",
        "flight_lift_fraction": [0, 0, 0.05, 0.10, 0.05, 0, 0, 0],
    },
    "error": {
        "file": "sapa-helpful-error-sheet.png",
        "durations_ms": [120, 100, 110, 130, 90, 100, 100, 150],
        "loop": False,
        "trigger": "A request fails; retain the textual error message.",
    },
}


def file_info(filename):
    path = ROOT / filename
    with Image.open(path) as image:
        pixels = np.asarray(image.convert("RGBA"))
        alpha = pixels[:, :, 3]
        info = {
            "file": filename,
            "width": image.width,
            "height": image.height,
            "mode": image.mode,
            "has_alpha": "A" in image.getbands(),
            "fully_transparent_fraction": round(float(np.mean(alpha == 0)), 6),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        }
    return info, pixels


def anchor_estimate(tile):
    pixels = tile.astype(np.int16)
    red, green, blue, alpha = [pixels[:, :, index] for index in range(4)]
    mask = (alpha > 192) & (green > red + 10) & (green > blue + 4) & (green > 40)
    mask[:int(tile.shape[0] * 0.66), :] = False
    ys, xs = np.where(mask)
    if not len(ys):
        return None
    bottom = int(ys.max())
    foot_band = mask[max(0, bottom - 18):bottom + 1, :]
    _, foot_xs = np.where(foot_band)
    return {"x": round(float(np.median(foot_xs)), 3), "y": bottom}


manifest = {
    "version": 1,
    "created_at": "2026-10-02",
    "status": "Generated pose artwork; playback and registration require integration preview.",
    "tool": "Built-in image_gen.imagegen",
    "grid": {"columns": 4, "rows": 2, "frame_count_per_sheet": 8, "order": "row-major"},
    "timing_status": "Proposed durations, not measured source FPS or completed playback.",
    "registration": {
        "target_anchor_fraction": {"x": 0.5, "y": 0.95},
        "method": "Approximate foot anchor from opaque green pixels in the lower third of each cell.",
        "notes": [
            "Use normalized source rectangles or fractional pixel coordinates.",
            "Offsets are measured suggestions; inspect rendered movement at actual display size.",
            "Success intentionally retains a vertical flight lift.",
            "Do not center each silhouette independently.",
        ],
    },
    "master": file_info("sapa-master.png")[0],
    "states": {},
}

for state_name, spec in STATES.items():
    info, pixels = file_info(spec["file"])
    width, height = info["width"], info["height"]
    cell_width, cell_height = width / 4, height / 2
    frames = []
    for index, duration in enumerate(spec["durations_ms"]):
        column, row = index % 4, index // 4
        x, y = column * cell_width, row * cell_height
        x0, x1 = round(x), round(x + cell_width)
        y0, y1 = round(y), round(y + cell_height)
        anchor = anchor_estimate(pixels[y0:y1, x0:x1])
        lift = spec.get("flight_lift_fraction", [0] * 8)[index]
        offset = None
        if anchor is not None:
            offset = {
                "x": round(cell_width * 0.5 - (x0 - x + anchor["x"]), 3),
                "y": round(cell_height * (0.95 - lift) - (y0 - y + anchor["y"]), 3),
            }
        frames.append({
            "index": index,
            "duration_ms": duration,
            "source_rect_pixels": {"x": x, "y": y, "width": cell_width, "height": cell_height},
            "source_rect_normalized": {"x": column / 4, "y": row / 2, "width": 0.25, "height": 0.5},
            "estimated_foot_anchor_in_rounded_crop_pixels": anchor,
            "suggested_draw_offset_source_pixels": offset,
            "intentional_flight_lift_fraction": lift,
        })
    manifest["states"][state_name] = {
        **info,
        "loop": spec["loop"],
        "trigger": spec["trigger"],
        "cycle_duration_ms": sum(spec["durations_ms"]),
        "frames": frames,
    }

(ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(json.dumps({
    "master": manifest["master"]["file"],
    "sheets": len(STATES),
    "poses": len(STATES) * 8,
    "all_selected_pngs_have_alpha": all(s["has_alpha"] for s in manifest["states"].values()) and manifest["master"]["has_alpha"],
    "manifest": str(ROOT / "manifest.json"),
}, indent=2))
