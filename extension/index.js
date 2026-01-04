const { event_types, eventSource, saveSettingsDebounced, renderExtensionTemplateAsync, debounce } = window;
const { extension_settings } = window;

const MODULE_NAME = 'nanogpt-image-enhancer';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const LORA_KEYS = ['lora_url_1', 'lora_url_2', 'lora_url_3', 'lora_url_4'];
let fetchPatched = false;
let uiInjected = false;

function ensureSettings() {
    if (!extension_settings.sd) {
        extension_settings.sd = {};
    }

    if (!extension_settings.sd.nanogpt_image_enhancer) {
        extension_settings.sd.nanogpt_image_enhancer = {
            loras: {
                lora_url_1: '',
                lora_url_2: '',
                lora_url_3: '',
                lora_url_4: '',
            },
            referenceImages: [],
        };
    } else {
        const store = extension_settings.sd.nanogpt_image_enhancer;
        store.loras = Object.assign({
            lora_url_1: '',
            lora_url_2: '',
            lora_url_3: '',
            lora_url_4: '',
        }, store.loras || {});
        store.referenceImages = Array.isArray(store.referenceImages) ? store.referenceImages : [];
    }

    return extension_settings.sd.nanogpt_image_enhancer;
}

function saveSettings(store) {
    extension_settings.sd.nanogpt_image_enhancer = store;
    saveSettingsDebounced();
}

async function waitForElement(selector, attempts = 20, interval = 250) {
    for (let i = 0; i < attempts; i++) {
        const element = $(selector);
        if (element.length) {
            return element;
        }

        await new Promise(resolve => setTimeout(resolve, interval));
    }

    return null;
}

function bytesFromDataUrl(dataUrl) {
    const base64 = String(dataUrl || '').split(',')[1] || '';
    return Math.ceil((base64.length * 3) / 4);
}

function createCanvas(image, width, height, quality) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(width));
    canvas.height = Math.max(1, Math.floor(height));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
}

async function downscaleToLimit(image) {
    let width = image.naturalWidth;
    let height = image.naturalHeight;
    let quality = 0.92;

    for (let i = 0; i < 10; i++) {
        const dataUrl = createCanvas(image, width, height, quality);
        if (bytesFromDataUrl(dataUrl) <= MAX_IMAGE_BYTES) {
            return dataUrl;
        }

        width = Math.max(1, Math.floor(width * 0.9));
        height = Math.max(1, Math.floor(height * 0.9));
        quality = Math.max(0.5, quality - 0.07);
    }

    throw new Error('Unable to compress image below 4MB.');
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function handleFileSelection(file, settings) {
    if (!file) return;

    const rawDataUrl = await readFileAsDataUrl(file);
    const baseImage = await loadImage(rawDataUrl);
    const finalDataUrl = bytesFromDataUrl(rawDataUrl) <= MAX_IMAGE_BYTES
        ? rawDataUrl
        : await downscaleToLimit(baseImage);

    settings.referenceImages.push({
        name: file.name,
        dataUrl: finalDataUrl,
    });

    saveSettings(settings);
    renderReferenceList(settings);
}

function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = dataUrl;
    });
}

function renderReferenceList(settings) {
    const list = $('#nanogpt_reference_list');

    if (!list.length) return;

    list.empty();

    if (!settings.referenceImages.length) {
        list.append('<div class="nano-empty">No reference images added yet.</div>');
        return;
    }

    settings.referenceImages.forEach((image, index) => {
        const wrapper = $('<div class="nano-ref-item"></div>');
        const preview = $('<img class="nano-ref-preview" />').attr('src', image.dataUrl).attr('alt', image.name || `Reference ${index + 1}`);
        const caption = $('<div class="nano-ref-caption"></div>').text(image.name || `Reference ${index + 1}`);
        const remove = $('<button type="button" class="menu_button nano-remove">Remove</button>');

        remove.on('click', () => {
            settings.referenceImages.splice(index, 1);
            saveSettings(settings);
            renderReferenceList(settings);
        });

        wrapper.append(preview, caption, remove);
        list.append(wrapper);
    });
}

function toggleLoraVisibility(modelName) {
    const visible = modelName === 'flux-2-dev-lora';
    $('#nanogpt_lora_fields').toggle(visible);
    $('#nanogpt_lora_notice').toggle(!visible);
}

function bindLoraInputs(settings) {
    LORA_KEYS.forEach(key => {
        const input = $(`#nanogpt_${key}`);
        input.val(settings.loras[key] || '');
        input.on('input', debounce(() => {
            settings.loras[key] = String(input.val());
            saveSettings(settings);
        }, 300));
    });
}

function bindReferenceControls(settings) {
    const fileInput = $('#nanogpt_reference_upload');
    const browse = $('#nanogpt_reference_browse');

    browse.on('click', () => fileInput.trigger('click'));
    fileInput.on('change', async (event) => {
        const [file] = event.target.files || [];

        try {
            await handleFileSelection(file, settings);
        } catch (error) {
            console.error(error);
            toastr.warning(error?.message || 'Unable to add reference image.');
        }

        fileInput.val('');
    });

    renderReferenceList(settings);
}

async function injectUi() {
    if (uiInjected) return;

    const settingsContainer = await waitForElement('.sd_settings .inline-drawer-content');
    if (!settingsContainer?.length) return;

    $('#nanogpt_enhancer_settings').remove();

    const settings = ensureSettings();
    const html = await renderExtensionTemplateAsync(MODULE_NAME, 'settings', {
        ...settings.loras,
    });

    const panel = $(html);
    settingsContainer.append(panel);
    bindLoraInputs(settings);
    bindReferenceControls(settings);

    const modelSelector = $('#sd_model');
    modelSelector.on('change', () => toggleLoraVisibility(String(modelSelector.val())));
    toggleLoraVisibility(String(modelSelector.val()));

    uiInjected = true;
}

function patchNanoGptFetch() {
    if (fetchPatched) return;
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input?.url;

        if (url?.includes('/api/sd/nanogpt/generate') && init.body) {
            try {
                const payload = JSON.parse(init.body);
                const settings = ensureSettings();

                if (payload?.model === 'flux-2-dev-lora') {
                    for (const key of LORA_KEYS) {
                        const value = String(settings.loras[key] || '').trim();
                        if (value) {
                            payload[key] = value;
                        }
                    }
                }

                const imageDataUrls = settings.referenceImages
                    .map(image => image?.dataUrl)
                    .filter(url => typeof url === 'string' && url.length > 0);

                if (imageDataUrls.length) {
                    payload.imageDataUrls = imageDataUrls;
                }

                init = { ...init, body: JSON.stringify(payload) };
            } catch (error) {
                console.warn('NanoGPT enhancer could not decorate request.', error);
            }
        }

        return originalFetch(input, init);
    };

    fetchPatched = true;
}

jQuery(async () => {
    ensureSettings();
    patchNanoGptFetch();
    await injectUi();

    eventSource.on(event_types.EXTENSION_SETTINGS_LOADED, async (manifest) => {
        if (manifest?.display_name !== 'Image Generation') return;
        uiInjected = false;
        await injectUi();
    });
});
