// What search engines read about the app (schema.org MobileApplication): the
// store listings it lives in and who publishes it. On the home and on
// /translate/, which is where /papagaio/ sends people.
export const APP_LD = {
  '@context': 'https://schema.org',
  '@type': 'MobileApplication',
  name: 'PapaGaio',
  alternateName: 'PapaGaio Portugal',
  description: 'Learn European Portuguese for life in Portugal and Madeira: an AI Coach that talks back in a pt-PT voice, a 110,000-entry dictionary, flashcards and verb tables.',
  url: 'https://azenha.ai/papagaio/',
  image: 'https://azenha.ai/papagaio/icon-512.png',
  operatingSystem: 'iOS, Android',
  applicationCategory: 'EducationalApplication',
  inLanguage: ['pt-PT', 'en', 'ru'],
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  sameAs: [
    'https://apps.apple.com/app/papagaio-portugal/id6802084974',
    'https://play.google.com/store/apps/details?id=ai.azenha.papagaio',
  ],
  publisher: { '@type': 'Organization', name: 'Azenha AI', url: 'https://azenha.ai/' },
};
