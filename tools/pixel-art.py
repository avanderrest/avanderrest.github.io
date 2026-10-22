"""Make neon pixel-art scenes locally: SDXL + a pixel-art LoRA, then bloom and pixelate.

    python tools/pixel-art.py "rainy neon street market" --seed 7
    python tools/pixel-art.py "ramen stall at night" --size 1024x576 --block 3 --colors 64
    python tools/pixel-art.py --from images/raw.png --block 4

Generation loads Stable Diffusion XL base and the `nerijs/pixel-art-xl` LoRA, renders at
1024x576, then post-processes. It needs a CUDA card (Blackwell / sm_120 needs torch built
for cu128 or newer — a cu121 wheel dies with "no kernel image is available"). A 16 GB card
renders one scene in about 5 seconds.

`--from <image>` skips generation and only runs the post-processing, which needs nothing
but Pillow and never touches the GPU. Use it to re-cut a render with a different block
size, colour count or glow instead of paying for the same seed again.

The order matters, and it is the whole trick:

  1. render large. Never ask the model for pixel art at pixel-art resolution; it goes mushy.
  2. bloom the bright (sign, lamp) pixels additively, *before* pixelating, so the glow
     falls onto the pixel grid instead of smearing over it.
  3. shrink with NEAREST resampling — block 3 for fine art, 4-6 for chunky.
  4. palette-quantise with Floyd-Steinberg dithering.

Ask the model for "glow" or "bloom" in the prompt and it paints smear you cannot
pixelate back, so leave lighting to step 2. Lettering (katakana, HUD labels) comes out as
gibberish; draw real text on top afterwards.
"""
import argparse
import os
import re
import sys

from PIL import Image, ImageChops, ImageFilter

MODEL = "stabilityai/stable-diffusion-xl-base-1.0"
LORA = "nerijs/pixel-art-xl"
NEGATIVE = (
    "photo, photorealistic, 3d render, blurry, smooth gradient, antialiasing, "
    "lowres, jpeg artifacts, text, watermark, oversaturated"
)
DEFAULT_PROMPT = (
    "wide establishing shot, detailed pixel art of a rainy neon cyberpunk street market, "
    "row of food stalls with glowing lanterns and katakana signs, VR arcade storefront, "
    "crowd of pedestrians in jackets, wet reflective asphalt, magenta cyan and amber palette, "
    "soft volumetric neon glow, 16-bit game art"
)


def size_of(value):
    """'1024x576' -> (1024, 576)."""
    m = re.fullmatch(r"(\d+)x(\d+)", value)
    if not m:
        sys.exit(f"bad --size {value!r}, want WIDTHxHEIGHT such as 1024x576")
    return int(m.group(1)), int(m.group(2))


def bloom(img, threshold=195, radius=10, strength=0.4):
    """Add a gaussian halo to the bright pixels only, so shadows stay where they are."""
    if strength <= 0:
        return img.convert("RGB")
    rgb = img.convert("RGB")
    span = max(1, 255 - threshold)
    mask = rgb.convert("L").point(
        lambda v: int(255 * (v - threshold) / span) if v > threshold else 0
    )
    blobs = rgb.filter(ImageFilter.GaussianBlur(radius))
    glow = Image.composite(blobs, Image.new("RGB", rgb.size, (0, 0, 0)), mask)
    return ImageChops.add(rgb, glow.point(lambda v: int(v * strength)))


def pixelate(img, block=3, colors=64, dither=True):
    """NEAREST down, quantise, NEAREST back up. Returns (on screen, native size)."""
    w, h = img.size
    small = img.resize((max(1, w // block), max(1, h // block)), Image.NEAREST)
    if colors:
        small = small.quantize(
            colors=colors,
            method=Image.MEDIANCUT,
            dither=Image.FLOYDSTEINBERG if dither else Image.NONE,
        ).convert("RGB")
    return small.resize((w, h), Image.NEAREST), small


def render(args):
    """Run SDXL on the GPU and return one image. torch is imported only if we get here."""
    import torch
    from diffusers import DPMSolverMultistepScheduler, StableDiffusionXLPipeline

    if not torch.cuda.is_available():
        sys.exit("no CUDA device: pixelate an existing render with --from instead")

    pipe = StableDiffusionXLPipeline.from_pretrained(
        MODEL, torch_dtype=torch.float16, variant="fp16", use_safetensors=True
    )
    pipe.scheduler = DPMSolverMultistepScheduler.from_config(
        pipe.scheduler.config, use_karras_sigmas=True, algorithm_type="dpmsolver++"
    )
    if args.lora_scale > 0:
        pipe.load_lora_weights(LORA)
        pipe.fuse_lora(lora_scale=args.lora_scale)
    pipe.to("cuda")  # one pipeline at a time: two on 16 GB spill to shared memory and crawl
    pipe.set_progress_bar_config(disable=True)

    width, height = size_of(args.size)
    return pipe(
        prompt=args.prompt or DEFAULT_PROMPT,
        negative_prompt=NEGATIVE,
        width=width,
        height=height,
        num_inference_steps=args.steps,
        guidance_scale=args.cfg,
        generator=torch.Generator("cuda").manual_seed(args.seed),
    ).images[0]


def main():
    ap = argparse.ArgumentParser(description="Neon pixel art, generated or post-processed.")
    ap.add_argument("prompt", nargs="?", help="what to draw, or empty for the default street")
    ap.add_argument("--from", dest="source", help="pixelate this image instead of generating")
    ap.add_argument("--out", help="output PNG (default: images/pixel-art/<seed>.png)")
    ap.add_argument("--size", default="1024x576", help="render size, default 1024x576")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--steps", type=int, default=40)
    ap.add_argument("--cfg", type=float, default=6.5)
    ap.add_argument("--lora-scale", type=float, default=1.0, help="0 turns the LoRA off")
    ap.add_argument("--block", type=int, default=3, help="pixel size: 3 fine, 6 chunky")
    ap.add_argument("--colors", type=int, default=64, help="palette size, 0 keeps true colour")
    ap.add_argument("--no-dither", action="store_true")
    ap.add_argument("--bloom", type=float, default=0.4, help="glow strength, 0 for none")
    ap.add_argument("--bloom-radius", type=int, default=10)
    ap.add_argument("--bloom-threshold", type=int, default=195, help="brightness that glows")
    ap.add_argument("--keep-raw", action="store_true", help="also save the unbaked render")
    a = ap.parse_args()

    if a.source:
        img = Image.open(a.source)
    else:
        img = render(a)

    out = a.out or os.path.join("images", "pixel-art", f"{a.seed}.png")
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)

    screen, native = pixelate(
        bloom(img, a.bloom_threshold, a.bloom_radius, a.bloom),
        block=a.block,
        colors=a.colors,
        dither=not a.no_dither,
    )
    if a.keep_raw and not a.source:
        img.save(os.path.splitext(out)[0] + "-raw.png")
    native.save(os.path.splitext(out)[0] + "-native.png")
    screen.save(out)
    print(f"{out}  ({screen.width}x{screen.height} shown, {native.width}x{native.height} native)")


if __name__ == "__main__":
    main()
