"""
Convert desktop screenshots to iPhone 6.5" and iPad 13" App Store formats.
Adds a dark background, status bar area, and centers the content.
"""

from PIL import Image, ImageDraw, ImageFont
import os

BG_COLOR = (26, 26, 46)  # Dark background matching the app

# Device profiles
DEVICES = {
    "iphone65": {
        "width": 1242,
        "height": 2688,
        "status_bar": 132,
        "home_indicator": 102,
        "padding": 80,
        "corner": 30,
        "font_size": 42,
        "font_small": 32,
        "indicator_w": 400,
        "suffix": "",
    },
    "ipad13": {
        "width": 2048,
        "height": 2732,
        "status_bar": 100,
        "home_indicator": 80,
        "padding": 120,
        "corner": 30,
        "font_size": 42,
        "font_small": 32,
        "indicator_w": 500,
        "suffix": "_ipad",
    },
}

# Source screenshots
SCREENSHOTS = [
    {
        "file": r"C:\Users\berry\Pictures\Screenshots\Screenshot_20260409_215708.png",
        "output": "screenshot_realtime",
    },
    {
        "file": r"C:\Users\berry\Pictures\Screenshots\Screenshot_20260409_215730.png",
        "output": "screenshot_commute",
    },
    {
        "file": r"C:\Users\berry\Pictures\Screenshots\Screenshot_20260409_215815.png",
        "output": "screenshot_sections",
    },
]

OUTPUT_DIR = r"C:\My Project\lanepilot\screenshots"
os.makedirs(OUTPUT_DIR, exist_ok=True)


def create_rounded_mask(size, radius):
    """Create a rounded rectangle mask."""
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, size[0], size[1]], radius=radius, fill=255)
    return mask


def make_screenshot(src_path, out_base, device):
    d = DEVICES[device]
    W, H = d["width"], d["height"]

    # Create base image
    base = Image.new("RGB", (W, H), BG_COLOR)

    # Load source
    src = Image.open(src_path)
    src_w, src_h = src.size

    # Calculate content area
    content_top = d["status_bar"]
    content_bottom = H - d["home_indicator"]
    content_height = content_bottom - content_top
    content_width = W - d["padding"]

    # Scale source to fit content area width
    scale = content_width / src_w
    new_w = content_width
    new_h = int(src_h * scale)

    # If too tall, scale by height instead
    if new_h > content_height:
        scale = content_height / src_h
        new_h = content_height
        new_w = int(src_w * scale)

    src_resized = src.resize((new_w, new_h), Image.LANCZOS)

    # Center horizontally, place at top of content area
    x_offset = (W - new_w) // 2
    y_offset = content_top + 20

    # Create rounded corners for the screenshot
    rounded_mask = create_rounded_mask((new_w, new_h), d["corner"])

    # Paste with rounded corners
    base.paste(src_resized, (x_offset, y_offset), rounded_mask)

    # Draw status bar elements
    draw = ImageDraw.Draw(base)

    try:
        font = ImageFont.truetype("arial.ttf", d["font_size"])
        font_small = ImageFont.truetype("arial.ttf", d["font_small"])
    except OSError:
        font = ImageFont.load_default()
        font_small = font

    draw.text((80, 48), "21:57", fill=(255, 255, 255), font=font)
    draw.text((W - 200, 48), "100%", fill=(255, 255, 255), font=font_small)

    # Battery icon
    bx = W - 100
    by = 52
    draw.rounded_rectangle([bx, by, bx + 56, by + 28], radius=4, outline=(255, 255, 255), width=2)
    draw.rectangle([bx + 56, by + 8, bx + 60, by + 20], fill=(255, 255, 255))
    draw.rectangle([bx + 4, by + 4, bx + 52, by + 24], fill=(76, 217, 100))

    # Home indicator
    indicator_w = d["indicator_w"]
    indicator_h = 12
    ix = (W - indicator_w) // 2
    iy = H - 40
    draw.rounded_rectangle(
        [ix, iy, ix + indicator_w, iy + indicator_h],
        radius=6,
        fill=(255, 255, 255, 180),
    )

    # Save
    out_name = f"{out_base}{d['suffix']}.png"
    out_path = os.path.join(OUTPUT_DIR, out_name)
    base.save(out_path, "PNG", quality=95)
    print(f"Saved: {out_path} ({W}x{H})")


for s in SCREENSHOTS:
    if os.path.exists(s["file"]):
        for device in DEVICES:
            make_screenshot(s["file"], s["output"], device)
    else:
        print(f"Not found: {s['file']}")

print("\nDone! Screenshots saved to:", OUTPUT_DIR)
