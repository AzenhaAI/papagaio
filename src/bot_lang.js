// The bot's interface language and where its translations go.
//
// Two settings per user, both optional (NULL = follow the default):
//   users.ui     'en' | 'pt' | 'ru' — the language the bot speaks. Default: the
//                 Telegram client's language when it is one of ours, else English.
//   users.tr_to  'en' | 'pt' | 'ru' — where every translation goes. Default
//                 (NULL, "auto"): the app's rule — Portuguese input goes into the
//                 interface language (English when that is Portuguese), anything
//                 else into Portuguese. 'pt' on Portuguese input explains the
//                 word in Portuguese, as the app does on an explicit PT pick.
//
// Only the messages a learner meets every day are translated here (the
// translation reply, the settings, the start and help texts, the command
// menu); the rest of the bot still speaks English.

export const UI_LANGS = ['en', 'pt', 'ru'];

export function botUi(user, from) {
  if (UI_LANGS.includes(user?.ui)) return user.ui;
  const code = String(from?.language_code ?? '').slice(0, 2);
  return UI_LANGS.includes(code) ? code : 'en';
}

/** The translator's direction and mode for this user's next message. */
export function botDirection(user) {
  const to = UI_LANGS.includes(user?.tr_to) ? user.tr_to : null;
  if (!to) return { direction: 'auto->pt', same: 'flip' };
  return { direction: `auto->${to}`, same: to === 'pt' ? 'explain' : 'flip' };
}

/** Picks the string for the interface language, English when one is missing. */
export const L = (ui, s) => s[ui] ?? s.en;

export const S = {
  learn: { en: '➕ Learn this word', pt: '➕ Aprender esta palavra', ru: '➕ Учить это слово' },
  listen: { en: '🔊 Listen', pt: '🔊 Ouvir', ru: '🔊 Слушать' },
  everyTense: { en: '🔀 Every tense', pt: '🔀 Todos os tempos', ru: '🔀 Все времена' },
  onMadeira: { en: '🌴 On Madeira', pt: '🌴 Na Madeira', ru: '🌴 На Мадейре' },
  madeiraSource: {
    en: 'Vocabulário Popular da Madeira, 1950',
    pt: 'Vocabulário Popular da Madeira, 1950',
    ru: 'Vocabulário Popular da Madeira, 1950',
  },
  uncertain: { en: 'meaning not established', pt: 'significado incerto', ru: 'значение не установлено' },
  slip: { en: '✏️ *Your text had a slip:*', pt: '✏️ *O seu texto tinha um erro:*', ru: '✏️ *В тексте была ошибка:*' },
  correctVersion: { en: 'Correct version', pt: 'Versão correta', ru: 'Правильно' },
  literally: { en: 'literally', pt: 'à letra', ru: 'дословно' },
  register: { en: 'register', pt: 'registo', ru: 'стиль' },
  notBrazilian: { en: '⚠️ *pt-PT, not Brazilian:*', pt: '⚠️ *pt-PT, não brasileiro:*', ru: '⚠️ *pt-PT, не бразильский:*' },
  inBrazil: { en: 'in Brazil they say', pt: 'no Brasil diz-se', ru: 'в Бразилии говорят' },
  settingsTitle: {
    en: '⚙️ *Settings*\n\n*Interface* — the language I speak.\n*Translate into* — where your words go. *Auto*: Portuguese into your interface language, anything else into Portuguese. *PT* on a Portuguese word explains it in Portuguese.',
    pt: '⚙️ *Definições*\n\n*Interface* — a língua em que falo.\n*Traduzir para* — para onde vão as suas palavras. *Auto*: o português vai para a língua da interface (inglês, se for português), o resto para português. *PT* numa palavra portuguesa explica-a em português.',
    ru: '⚙️ *Настройки*\n\n*Интерфейс* — язык, на котором я говорю.\n*Переводить на* — куда идут ваши слова. *Авто*: португальский — на язык интерфейса, всё остальное — на португальский. *PT* для португальского слова даёт толкование по-португальски.',
  },
  interface: { en: 'Interface', pt: 'Interface', ru: 'Интерфейс' },
  translateInto: { en: 'Translate into', pt: 'Traduzir para', ru: 'Переводить на' },
  auto: { en: 'Auto', pt: 'Auto', ru: 'Авто' },
  saved: { en: 'Saved', pt: 'Guardado', ru: 'Сохранено' },
  madeiraNone: {
    en: 'No Madeiran word found for that. Try /madeira on its own for a random one.',
    pt: 'Não encontrei essa palavra madeirense. Experimente só /madeira para uma ao acaso.',
    ru: 'Такого мадейрского слова не нашлось. Отправьте просто /madeira — пришлю случайное.',
  },
  madeiraIntro: {
    en: '🌴 *A word of Madeira*',
    pt: '🌴 *Uma palavra da Madeira*',
    ru: '🌴 *Слово Мадейры*',
  },
  madeiraMore: { en: '🎲 Another one', pt: '🎲 Outra', ru: '🎲 Ещё одно' },
};

/** The settings message keyboard; the current choices carry a tick. */
export function settingsKeyboard(user, ui) {
  const tick = (on, label) => (on ? `✓ ${label}` : label);
  const to = UI_LANGS.includes(user?.tr_to) ? user.tr_to : 'auto';
  return {
    inline_keyboard: [
      [{ text: `— ${L(ui, S.interface)} —`, callback_data: 'noop' }],
      [
        { text: tick(ui === 'en', '🇬🇧 EN'), callback_data: 'ui:en' },
        { text: tick(ui === 'pt', '🇵🇹 PT'), callback_data: 'ui:pt' },
        { text: tick(ui === 'ru', '🇷🇺 RU'), callback_data: 'ui:ru' },
      ],
      [{ text: `— ${L(ui, S.translateInto)} —`, callback_data: 'noop' }],
      [
        { text: tick(to === 'auto', L(ui, S.auto)), callback_data: 'to:auto' },
        { text: tick(to === 'en', 'EN'), callback_data: 'to:en' },
        { text: tick(to === 'ru', 'RU'), callback_data: 'to:ru' },
        { text: tick(to === 'pt', 'PT'), callback_data: 'to:pt' },
      ],
    ],
  };
}
