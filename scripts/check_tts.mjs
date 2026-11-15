// Diagnostic for speech: one Azure AI Speech request, outside the Worker.
//
// Run: AZURE_SPEECH_KEY=... [AZURE_SPEECH_REGION=westeurope] node scripts/check_tts.mjs [pt|en] [text]
// It goes through src/tts.js itself, so a pass here means the Worker's code works
// with this key and region; a failure prints the HTTP status Azure gave.
import { configureTts, synthesize, VOICES } from '../src/tts.js';

const course = process.argv[2] === 'en' ? 'en' : 'pt';
const text = process.argv[3] ?? (course === 'en' ? 'Good morning.' : 'Bom dia, tudo bem?');

configureTts(process.env);
try {
  const audio = await synthesize(text, course);
  if (audio.byteLength < 1000) {
    console.error(`EMPTY — ${audio.byteLength} bytes`);
    process.exit(3);
  }
  console.log(`OK — ${VOICES[course]} returned ${audio.byteLength} bytes for "${text}"`);
} catch (e) {
  console.error('FAIL —', e.message);
  process.exit(1);
}
