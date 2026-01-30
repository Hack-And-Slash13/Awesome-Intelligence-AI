import argparse
import torch
from PIL import Image
import sys

# ---- CPU SAFETY ----
torch.set_num_threads(1)
torch.set_num_interop_threads(1)

# ---- ARGUMENTS ----
parser = argparse.ArgumentParser()
parser.add_argument('--prompt', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()

prompt = args.prompt
output_path = args.output

try:
    # ⚠️ VERY lightweight fallback image if VQGAN fails
    # (Replace this block with real VQGAN-CLIP shortly)
    img = Image.new("RGB", (256, 256), color=(30, 30, 30))
    img.save(output_path)

    print("Image generated successfully")
    sys.exit(0)

except Exception as e:
    print(f"Worker failed: {e}", file=sys.stderr)
    sys.exit(1)

