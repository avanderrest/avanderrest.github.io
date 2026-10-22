import os
import re
try:
    from diffusers import StableDiffusionXLPipeline, StableDiffusionXLControlNetPipeline, ControlNetModel
except ImportError:
    from diffusers import StableDiffusionXLPipeline, StableDiffusionXLControlNetPipeline
    from diffusers.utils import is_inference_mode

try:
    from diffusers.utils import is_inference_mode
except:
    is_inference_mode = lambda: True
import torch
from PIL import Image

# Constants
GAME_PROMPT = 'pixel art, neon cityscape, futuristic streets, cyberpunk aesthetic'

# Set up GPU acceleration
device = 'cuda' if torch.cuda.is_available() else 'cpu'

# Load SDXL ControlNet
controlnet = ControlNetModel.from_pretrained('diffusers/controlnet-canny-sdxl-1.0', use_safetensors=True)
pipe = StableDiffusionXLControlNetPipeline.from_pretrained(
    'stabilityai/stable-diffusion-xl-base-1.0',
    controlnet=controlnet,
    revision='fp16',
    torch_dtype=torch.float16,
    use_safetensors=True
).to(device)

pipe.enable_model_cpu_offload()
print('SDXL pipeline ready!')

# Generate asset
def generate_asset(slug):
    output_path = f'test/assets/{slug}.png'
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Generate image
    image = pipe(
        prompt=GAME_PROMPT,
        image=Image.open(f'test/_shots/{slug}/capture.png'),
        controlnet_conditioning_scale=0.5,
        num_inference_steps=20,
        guidance_scale=5,
    ).images[0]

    # Save
    image.save(output_path)
    print(f'Generated {output_path}')

# Example call
if __name__ == '__main__':
    generate_asset('lantern-deep')