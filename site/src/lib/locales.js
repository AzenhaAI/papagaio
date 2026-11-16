// Language versions of the main sections (scripts/localize_pages.mjs writes
// them after the build; the sitemap lists them). English stays at
// /papagaio/<section>/, the others at /papagaio/<lang>/<section>/.
//
// French is planned as a fourth language: add 'fr' to LANGS (and to UI in
// i18n.js) once its dictionary and the titles below exist.

export const LANGS = ['en', 'pt', 'ru'];
export const HREFLANG = { en: 'en', pt: 'pt-PT', ru: 'ru' };

/** Sections with a page per language; '' is the home. Pages that are mostly
 *  untranslated prose (privacy) or private to one reader (progress, settings)
 *  stay English-only. */
export const LOCALIZED = [
  '', 'translate', 'practice', 'coach', 'read', 'dictionary', 'phrasebook',
  'verbs', 'madeirense', 'features', 'news', 'apps', 'about', 'support',
];

export const pageUrl = (lang, section) =>
  `https://azenha.ai/papagaio/${lang === 'en' ? '' : lang + '/'}${section ? section + '/' : ''}`;

/** Title (≤ 60 characters) and description (≤ 160) per section and language.
 *  English keeps the page's own; {n} in Madeirense is the entry count. */
export const SEO = {
  '': {
    pt: {
      title: 'PapaGaio — aprenda português europeu (pt-PT)',
      desc: 'Um tutor IA de conversa em português europeu: o café, o banco, a AIMA. Ouve, responde em voz alta e corrige com calma. Tradutor e dicionário. Grátis.',
    },
    ru: {
      title: 'PapaGaio — европейский португальский (pt-PT) с ИИ',
      desc: 'ИИ-собеседник на европейском португальском: кафе, банк, AIMA. Слышит вас, отвечает голосом и мягко поправляет. Переводчик, словарь, карточки. Бесплатно.',
    },
  },
  translate: {
    pt: {
      title: 'Tradutor de português europeu (pt-PT) — PapaGaio',
      desc: 'Tradutor gratuito de inglês e russo para português europeu: só pt-PT, gralhas corrigidas, variantes do Brasil assinaladas, áudio e exemplos.',
    },
    ru: {
      title: 'Переводчик на португальский (Португалия) — PapaGaio',
      desc: 'Бесплатный переводчик с русского и английского на европейский португальский: только pt-PT, опечатки исправлены, бразильские варианты отмечены.',
    },
  },
  practice: {
    pt: {
      title: 'Cartões de português europeu — PapaGaio',
      desc: 'Reveja os seus cartões de português europeu no browser: o mesmo baralho e o mesmo calendário de repetição espaçada que no bot do Telegram e na app. Grátis.',
    },
    ru: {
      title: 'Карточки: европейский португальский — PapaGaio',
      desc: 'Повторяйте карточки по европейскому португальскому в браузере: та же колода и то же расписание интервальных повторений, что в Telegram-боте и в приложении.',
    },
  },
  coach: {
    pt: {
      title: 'Tutor IA de conversa em português europeu — PapaGaio',
      desc: 'Pratique situações reais em português europeu — café, banco, AIMA — com um tutor que corrige com calma e resume os seus erros no fim.',
    },
    ru: {
      title: 'ИИ-коуч для разговорного португальского — PapaGaio',
      desc: 'Разыгрывайте реальные ситуации на европейском португальском — кафе, банк, AIMA — с коучем, который мягко поправляет и разбирает ошибки.',
    },
  },
  read: {
    pt: {
      title: 'Ler português europeu palavra a palavra — PapaGaio',
      desc: 'Cole qualquer texto em português europeu, uma notícia, uma carta ou uma ementa, e leia-o com cada palavra explicada e comparada com o seu baralho de cartões.',
    },
    ru: {
      title: 'Чтение на португальском с переводом слов — PapaGaio',
      desc: 'Вставьте любой текст на европейском португальском — новость, письмо или меню — и читайте его с переводом каждого слова и сверкой с вашей колодой карточек.',
    },
  },
  dictionary: {
    pt: {
      title: 'Dicionário de português europeu — PapaGaio',
      desc: 'Dicionário de português europeu com mais de 110 000 entradas: significados em inglês e russo, áudio, exemplos e conjugações. Pesquisa sem acentos.',
    },
    ru: {
      title: 'Португальско-русский словарь (Португалия) — PapaGaio',
      desc: 'Словарь европейского португальского: более 110 000 статей с переводом на русский и английский, озвучкой, примерами и спряжениями.',
    },
  },
  phrasebook: {
    pt: {
      title: 'Expressões do português europeu — PapaGaio',
      desc: 'As expressões que se ouvem mesmo em Portugal — se calhar, pois é, está bem — com áudio e a história literal por trás de cada uma.',
    },
    ru: {
      title: 'Разговорник европейского португальского — PapaGaio',
      desc: 'Фразы, которые на самом деле говорят в Португалии — se calhar, pois é, está bem — с озвучкой и буквальным смыслом каждой.',
    },
  },
  verbs: {
    pt: {
      title: 'Conjugação de verbos em português europeu — PapaGaio',
      desc: 'Conjugue qualquer verbo em português europeu: presente, pretérito, imperfeito, futuro, condicional, conjuntivo e imperativo, com as formas de Portugal.',
    },
    ru: {
      title: 'Спряжение португальских глаголов (pt-PT) — PapaGaio',
      desc: 'Спряжение любого глагола европейского португальского: настоящее, прошедшие, будущее, условное, сослагательное и повелительное наклонение.',
    },
  },
  madeirense: {
    pt: {
      title: 'Palavras da Madeira: vocabulário madeirense — PapaGaio',
      desc: 'As palavras da Madeira: {n} termos regionais do «Vocabulário Popular da Madeira» (1950), com grafia atual e significados em inglês e russo.',
    },
    ru: {
      title: 'Слова Мадейры: мадейрский говор — PapaGaio',
      desc: 'Слова Мадейры: словарь «Vocabulário Popular da Madeira» (1950) в современном написании, с переводом каждого слова на русский и английский.',
    },
  },
  features: {
    pt: {
      title: 'Tudo o que o PapaGaio faz, grátis',
      desc: 'Tradutor pt-PT, dicionário offline com 110 000 entradas, cartões com repetição espaçada, verbos, leitor e um tutor de voz com IA. Tudo grátis.',
    },
    ru: {
      title: 'Возможности PapaGaio — бесплатно',
      desc: 'Переводчик pt-PT, офлайн-словарь на 110 000 статей, карточки с интервальным повторением, глаголы, чтение и голосовой ИИ-коуч. Всё бесплатно.',
    },
  },
  news: {
    pt: {
      title: 'Notícias da Madeira em português europeu — PapaGaio',
      desc: 'Um boletim diário e curto de notícias da Madeira em português europeu, nos níveis A2, B1 ou B2, com as palavras que vale a pena guardar.',
    },
    ru: {
      title: 'Новости Мадейры на португальском — PapaGaio',
      desc: 'Короткая ежедневная сводка новостей Мадейры на европейском португальском — уровни A2, B1 и B2 — с самыми полезными словами.',
    },
  },
  apps: {
    pt: {
      title: 'Apps PapaGaio para iPhone, Android, Mac e Windows',
      desc: 'O PapaGaio no telemóvel, no Mac, no PC e no Telegram: dicionário de português europeu, conjugador, tradutor e Tutor IA, grátis em todo o lado.',
    },
    ru: {
      title: 'Приложения PapaGaio: iPhone, Android, Mac, Windows',
      desc: 'PapaGaio на телефоне, Mac, ПК и в Telegram: словарь европейского португальского, спряжения, переводчик и ИИ-коуч — бесплатно везде.',
    },
  },
  about: {
    pt: {
      title: 'Sobre o PapaGaio',
      desc: 'Porque existe o PapaGaio e como funciona: um tutor gratuito de português europeu com tradutor, dicionário, cartões e um tutor de voz com IA.',
    },
    ru: {
      title: 'О проекте PapaGaio',
      desc: 'Зачем нужен PapaGaio и как он устроен: бесплатный репетитор европейского португальского с переводчиком, словарём, карточками и голосовым ИИ-коучем.',
    },
  },
  support: {
    pt: {
      title: 'Apoio — PapaGaio',
      desc: 'Apoio para as apps PapaGaio: começar sem Telegram, sincronizar o progresso entre dispositivos, dicionários offline, áudio e eliminação da conta.',
    },
    ru: {
      title: 'Поддержка — PapaGaio',
      desc: 'Помощь по приложениям PapaGaio: начало без Telegram, синхронизация прогресса между устройствами, офлайн-словари, звук и удаление аккаунта.',
    },
  },
};
