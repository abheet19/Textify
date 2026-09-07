"""
Assemble the PNG frames captured by tools/record-demo.mjs into the animated GIF
embedded at the top of the README.

GIF is the only format GitHub autoplays inline in a README (<video> is stripped
by the sanitiser and a committed .mp4 renders as a link), so the job here is to
get a legible GIF small enough to actually load.

Usage:
    python tools/build-demo-gif.py [FRAME_DIR] [OUT_PATH]

Defaults: FRAME_DIR=./frames, OUT_PATH=docs/demo/textify-demo.gif
"""

import sys
from pathlib import Path

from PIL import Image

WIDTH = 960          # GitHub renders README images at roughly 850px wide
FRAME_MS = 125       # 8fps - plenty for UI, and a third the frames of 24fps
COLORS = 128         # palette size; the copper/amber dark theme needs few


def main() -> int:
    frame_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "frames")
    out = Path(sys.argv[2] if len(sys.argv) > 2 else "docs/demo/textify-demo.gif")

    paths = sorted(frame_dir.glob("f*.png"))
    if not paths:
        print(f"no frames in {frame_dir}", file=sys.stderr)
        return 1

    frames, previous = [], None
    durations = []
    for path in paths:
        img = Image.open(path).convert("RGB")
        height = round(img.height * WIDTH / img.width)
        img = img.resize((WIDTH, height), Image.LANCZOS)
        digest = img.tobytes()

        # Collapse runs of identical frames into one longer frame instead of
        # paying for duplicate image data.
        if digest == previous:
            durations[-1] += FRAME_MS
            continue
        previous = digest
        frames.append(img.quantize(colors=COLORS, method=Image.MEDIANCUT))
        durations.append(FRAME_MS)

    out.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        out,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        optimize=True,
        disposal=2,
    )
    size = out.stat().st_size
    print(
        f"{out}: {len(frames)} frames, {frames[0].width}x{frames[0].height}, "
        f"{size / 1_048_576:.2f} MB, {sum(durations) / 1000:.1f}s"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
