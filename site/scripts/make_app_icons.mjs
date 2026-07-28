// Emits the Flutter app's launcher icons from the shared mark (scripts/mark.mjs),
// so the app and the site carry the identical bird.
//
//   icon.png             flag split + parrot   → iOS / legacy Android
//   icon_background.png  flag split alone      → Android adaptive back layer
//   icon_foreground.png  parrot on transparent → Android adaptive front layer
//
// Android masks the adaptive foreground to a circle and can crop the outer ~18%
// on each side, so that layer draws the bird smaller — the lesson from the
// BullDozer icon, which lost its corners.
//
// sharp lives here in the site project, so run it from this directory:
//   node scripts/make_app_icons.mjs           (cwd: papagaio/site)
// then, in the app project: dart run flutter_launcher_icons
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { flagBack, parrot, svg } from '../../scripts/mark.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', '..', '..', 'papagaio_app', 'assets', 'icon');
mkdirSync(OUT, { recursive: true });

const S = 1024;

const files = {
  'icon.png': svg(S, flagBack(S) + parrot(S, 0.62)),
  'icon_background.png': svg(S, flagBack(S)),
  // 0.46 keeps the bird inside the ~66% safe circle the launcher mask leaves.
  'icon_foreground.png': svg(S, parrot(S, 0.46)),
};

for (const [name, markup] of Object.entries(files)) {
  await sharp(Buffer.from(markup)).resize(S, S).png().toFile(join(OUT, name));
  console.log(`wrote ${name} (${S}px) → papagaio_app/assets/icon/`);
}
