// Photograph a menu, a sign, a letter from the condomínio — and get it in
// English, with the same European Portuguese guarantee the typed translator
// gives.
//
// Two decisions worth remembering:
//
// 1. Reading happens on the server, not the phone. On-device OCR (ML Kit) ships
//    no arm64 simulator slice, which makes the app unverifiable before it
//    reaches a device — and the translation needs a connection anyway.
//
// 2. Reading and translating are separate calls to separate models. Workers AI
//    has vision on this account and Groq does not; Groq's llama-3.3-70b is the
//    better translator and already carries every pt-PT rule. So the vision
//    model only transcribes, and translate() does what it is good at. The
//    photo path and the typed path then produce identical output for identical
//    text, which is the point.

import { translate } from './translate.js';

// Tried in order; the first that answers wins. Availability moves, so a failure
// falls through instead of taking the endpoint down.
// Llama 4 Scout reads long screenshots line by line; the 3.2 vision model
// often answered with a description of the picture instead ("The image shows
// a screenshot of an email…", Kirill, 28.10.2026), so it is only a fallback.
const VISION_MODELS = [
  { id: '@cf/meta/llama-4-scout-17b-16e-instruct', chat: true },
  { id: '@cf/meta/llama-3.2-11b-vision-instruct' },
  { id: '@cf/llava-hf/llava-1.5-7b-hf' },
];

// An answer that talks ABOUT the picture rather than copying its text.
const DESCRIBES = /^\s*(the|this) (image|picture|photo|photograph|screenshot)\b|^\s*(here is|here's) (the|a) (transcription|text)|^\s*the text (in|on|of) (the|this) (image|picture)/i;

const READ_PROMPT =
  'Transcribe every piece of text visible in this image, exactly as written, ' +
  'including accents, in reading order. One line per line of text. ' +
  'Do not translate it. Do not describe the image. ' +
  'If there is no text at all, answer with nothing.';

const toBytes = (b64) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** Reads the text off an image. Returns '' when there is none. */
export async function readText(env, image) {
  if (!env.AI) throw new Error('vision not configured');
  const b64 = image.startsWith('data:') ? image.slice(image.indexOf(',') + 1) : image;
  const bytes = toBytes(b64);

  let lastError;
  for (const model of VISION_MODELS) {
    try {
      const out = model.chat
        ? await env.AI.run(model.id, {
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: READ_PROMPT },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
              ],
            }],
            max_tokens: 1500,
          })
        : await env.AI.run(model.id, {
            image: [...bytes],
            prompt: READ_PROMPT,
            max_tokens: 1500,
          });
      const text = String(out?.description ?? out?.response ?? '').trim();
      if (text && !DESCRIBES.test(text)) return { text, model: model.id };
    } catch (e) {
      lastError = e;
    }
  }
  if (lastError) throw new Error('vision: ' + lastError.message);
  return { text: '', model: null };
}

/**
 * Reads and translates the text in an image.
 * `image` is a data URL or bare base64 of a JPEG/PNG.
 */
export async function readAndTranslate(env, image, direction, ui, { same = 'flip' } = {}) {
  const { text, model } = await readText(env, image);
  if (!text) return { source: '', translation: '' };

  // The same rule as typed text: Portuguese goes into the reader's interface
  // language, anything else into Portuguese. Without `ui` the photo path sent
  // Portuguese into English for a Russian reader.
  const out = await translate(env, text, direction, ui, { same });
  return { ...out, source: text, read_by: model };
}
