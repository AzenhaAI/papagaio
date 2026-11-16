// Translations of whole blocks with markup inside ([data-th="<id>"] in the
// pages), one file per page so pages can be translated independently. Ids
// are "<page>.<name>". The English stays in the page itself; a changed English
// block needs its translations updated by hand — until then the language
// versions keep the old wording (the id still matches) or, for a new id,
// show the English (scripts/localize_pages.mjs lists those after the build).
//
// Used only at build time (scripts/localize_pages.mjs): the language
// versions are static pages, so none of this ships to the browser.
import home from './home.js';
import translate from './translate.js';
import practice from './practice.js';
import coach from './coach.js';
import read from './read.js';
import phrasebook from './phrasebook.js';
import news from './news.js';
import features from './features.js';
import about from './about.js';
import support from './support.js';
import apps from './apps.js';
import components from './components.js';

const ALL = [home, translate, practice, coach, read, phrasebook, news, features, about, support, apps, components];
const BY = { pt: {}, ru: {} };
for (const page of ALL) for (const lang of Object.keys(BY)) Object.assign(BY[lang], page[lang] ?? {});

export const th = (lang, id) => BY[lang]?.[id] ?? null;
