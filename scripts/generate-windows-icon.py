from pathlib import Path
import sys

from PIL import Image


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: python3 generate-windows-icon.py <output.ico> <png> [<png> ...]")
        return 1

    output_path = Path(sys.argv[1])
    source_paths = [Path(value) for value in sys.argv[2:]]

    images = [Image.open(path).convert("RGBA") for path in source_paths]
    images.sort(key=lambda image: image.size[0], reverse=True)

    if not images:
        print("No source PNG files were provided.")
        return 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    images[0].save(
        output_path,
        format="ICO",
        sizes=[image.size for image in images],
        append_images=images[1:],
        bitmap_format="bmp",
    )
    print(f"Windows icon created at: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
