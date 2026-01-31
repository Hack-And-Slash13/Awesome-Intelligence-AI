import argparse
import torch
from diffusers import StableDiffusionPipeline
from PIL import Image
import sys

# ---- CPU SAFETY ----
torch.set_num_threads(1)
torch.set_num_interop_threads(1)
device = "cpu"

# ---- ARGUMENTS ----
parser = argparse.ArgumentParser()
parser.add_argument("--prompt", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args()

prompt = args.prompt
output_path = args.output

try:
    pipe = StableDiffusionPipeline.from_pretrained(
        "runwayml/stable-diffusion-v1-5",
        torch_dtype=torch.float32
    )

    pipe = pipe.to(device)
    pipe.enable_attention_slicing()

    image = pipe(
        prompt,
        height=256,
        width=256,
        num_inference_steps=20,   # keep low for CPU
        guidance_scale=7.5
    ).images[0]

    image.save(output_path)

    sys.exit(0)

except Exception as e:
    print(f"Worker failed: {e}", file=sys.stderr)
    sys.exit(1)
