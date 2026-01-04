# ST-nanogpt-image_enhancement

A Silly Tavern extension that augments the built-in Image Generation (Stable Diffusion) extension with NanoGPT-specific features:

- LoRA URL inputs for the **Flux.2 [dev] LoRA** model (sent only when that model is selected).
- Reference image uploads stored as base64 JPEGs (auto-resized to stay under 4MB) and attached to NanoGPT image requests.

## Installation

1. Clone or download this repository.
2. Copy the contents of the `extension` folder into your SillyTavern install at `public/scripts/extensions/nanogpt-image-enhancer/`.
3. Restart SillyTavern or reload extensions from the Extensions menu.
4. Enable the **NanoGPT Image Enhancer** extension in the UI.

## Usage

1. Open **Settings → Extensions → Image Generation**.
2. Select **NanoGPT** as the source and choose the **Flux.2 [dev] LoRA** model.
3. Enter up to four LoRA URLs. These values persist even if you switch models, but they are only sent when `flux-2-dev-lora` is selected.
4. Under **Reference Images**, click **Browse** to pick JPEG/PNG files (they will be resized if larger than 4MB when encoded). Thumbnails are shown and stored in your settings; remove any image with the **Remove** button.
5. Generate images as usual—NanoGPT requests will include your reference images (as `imageDataUrls`) and, when applicable, your LoRA URLs in the documented request body format.

## Notes

- The extension hooks NanoGPT generation requests at `/api/sd/nanogpt/generate` to inject LoRA URLs and reference images; other providers are untouched.
- All settings are saved alongside the existing Stable Diffusion extension settings.
- Reference images are kept locally in your SillyTavern configuration; re-upload them if you clear settings or switch browsers.
