"""Read original sheets and export playback metadata; never modifies artwork."""
from pathlib import Path
import json
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parent
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
states = {}
for name, state in manifest["states"].items():
    pixels = np.array(Image.open(root / state["file"]).convert("RGBA"))
    height, width = pixels.shape[:2]
    anchors = []
    for index in range(8):
        sx, sy = (index % 4) * width / 4, (index // 4) * height / 2
        x0, y0 = round(sx), round(sy)
        crop = pixels[y0:round(sy + height / 2), x0:round(sx + width / 4)]
        rgb = crop[:, :, :3].astype(int)
        green = (crop[:, :, 3] > 192) & (rgb[:, :, 1] > rgb[:, :, 0] + 10) & (rgb[:, :, 1] > rgb[:, :, 2] + 4)
        green[:int(crop.shape[0] * .66)] = False
        ys, xs = np.where(green)
        bottom = int(ys.max())
        band = xs[ys >= bottom - 17]
        # Both feet define a stable ground center; the median favored one foot.
        center = (float(np.percentile(band, 2)) + float(np.percentile(band, 98))) / 2
        anchors.append([round(x0 - sx + center, 2), round(y0 - sy + bottom, 2)])
    states[name] = {
        "file": state["file"],
        "loop": state["loop"],
        "durations": [frame["duration_ms"] for frame in state["frames"]],
        "anchors": anchors,
    }
target = root.parents[1] / "apps/web/components/sapa-motion-data.ts"
definitions = []
for name, state in states.items():
    definitions.append(
        f'  {name}: {{\n'
        f'    file: "{state["file"]}", loop: {str(state["loop"]).lower()},\n'
        f'    durations: {json.dumps(state["durations"])},\n'
        f'    anchors: {json.dumps(state["anchors"])},\n'
        '  },'
    )
target.write_text(
    "// Generated from approved, unchanged PNGs by design/sapa-animation-v1/build-playback-data.py.\n"
    "// Anchors register both feet. Source cells retain fractional dimensions.\n"
    "export const SAPA_MOTIONS = {\n" + "\n".join(definitions) + "\n} as const;\n\n"
    "export type SapaMotion = keyof typeof SAPA_MOTIONS;\n"
    'export type SapaActivityPhase = "idle" | "thinking" | "success" | "error";\n'
    "export type SapaActivity = { id: number; phase: SapaActivityPhase };\n",
    encoding="utf-8",
)
print(f"Exported {len(states)} motions with foot anchors to {target.relative_to(root.parents[1])}")
