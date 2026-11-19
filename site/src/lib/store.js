// Store links with campaign tags, so the stores can tell how many installs
// came from the website (17 Nov 2026 audit: no store link carried a tag).
//
// App Store: pt is the provider token of the Azenha AI account (the same on
// every app), ct the campaign; downloads show in App Store Connect → Apps →
// PapaGaio → Analytics → Acquisition → Campaigns, once a campaign has about
// five first-time downloads.
// Google Play: the referrer carries URL-encoded UTM tags; installs show in
// Play Console → Grow users → Store performance, filtered by UTM campaign.
//
// Same scheme in every section of azenha.ai: ct=web-<section>-<placement>,
// utm_campaign=<section>, utm_content=<placement>. Keep placements few —
// a campaign under the stores' privacy thresholds shows nothing at all.
//
// The schema.org sameAs and the manifest keep the plain URLs: they name the
// app, nobody clicks them.

export const APP_STORE_URL = 'https://apps.apple.com/app/papagaio-portugal/id6802084974';
export const PLAY_URL = 'https://play.google.com/store/apps/details?id=ai.azenha.papagaio';

const SECTION = 'papagaio';
const PROVIDER_TOKEN = '129240922';

export function appStoreLink(placement) {
  return `${APP_STORE_URL}?pt=${PROVIDER_TOKEN}&ct=web-${SECTION}-${placement}&mt=8`;
}

export function playLink(placement) {
  const referrer = `utm_source=azenha.ai&utm_medium=web&utm_campaign=${SECTION}&utm_content=${placement}`;
  return `${PLAY_URL}&referrer=${encodeURIComponent(referrer)}`;
}
