// The command menu, in one place.
//
// Telegram caches this list per client, so it changes only when we publish it.
// It used to be published on /start and once a night, which meant a command
// added in the morning was invisible to everyone who had already started the
// bot — including the person who asked for it.
//
// One list per language: Telegram shows a client the list published for its
// own language_code and the default (English) to everyone else.

const MENU = [
  ['help',     '🦜 What I can do',                     '🦜 O que sei fazer',                     '🦜 Что я умею'],
  ['tr',       '🔤 Translate a word or a phrase',      '🔤 Traduzir uma palavra ou frase',       '🔤 Перевести слово или фразу'],
  ['settings', '⚙️ Interface language, translate into', '⚙️ Língua da interface e da tradução',   '⚙️ Язык интерфейса и перевода'],
  ['madeira',  '🌴 A word of Madeira (1950 dictionary)', '🌴 Uma palavra da Madeira (1950)',      '🌴 Слово Мадейры (словарь 1950 г.)'],
  ['news',     '📰 Today on the island, at your level', '📰 Hoje na ilha, ao seu nível',          '📰 Новости острова под ваш уровень'],
  ['apps',     '🌍 The site and the apps — every link', '🌍 O site e as apps — todos os links',   '🌍 Сайт и приложения — все ссылки'],
  ['course',   '🎓 The course — lessons with a goal',  '🎓 O curso — lições com objetivo',       '🎓 Курс — уроки с целью'],
  ['talk',     '🎭 Free practice with the AI coach',   '🎭 Prática livre com o treinador IA',    '🎭 Практика с ИИ-коучем'],
  ['stop',     '🏁 End the dialog + error recap',      '🏁 Terminar o diálogo + erros',          '🏁 Закончить диалог + разбор ошибок'],
  ['now',      'A card right now',                     'Um cartão agora',                        'Карточка прямо сейчас'],
  ['drill',    '📐 Practise grammar on demand',        '📐 Praticar gramática',                  '📐 Грамматика по запросу'],
  ['level',    '🎚 Start higher — skip what you know', '🎚 Começar mais acima',                  '🎚 Начать выше — пропустить известное'],
  ['skip',     '⏭ Mark a topic you already know',      '⏭ Marcar um tema que já sabe',           '⏭ Отметить знакомую тему'],
  ['undo',     '↩️ Take back the last answer',          '↩️ Desfazer a última resposta',          '↩️ Отменить последний ответ'],
  ['export',   '💾 Download everything as JSON',       '💾 Descarregar tudo em JSON',            '💾 Скачать всё в JSON'],
  ['stats',    '📊 Statistics',                        '📊 Estatísticas',                        '📊 Статистика'],
  ['lang',     'Courses: PT / EN / both',              'Cursos: PT / EN / ambos',                'Курсы: PT / EN / оба'],
  ['pause',    'Pause',                                'Pausa',                                  'Пауза'],
  ['resume',   'Resume',                               'Retomar',                                'Продолжить'],
];

export async function publishCommands(env) {
  const post = (column, language_code) =>
    fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/setMyCommands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        commands: MENU.map((m) => ({ command: m[0], description: m[column] })),
        ...(language_code ? { language_code } : {}),
      }),
    });
  await Promise.all([post(1), post(2, 'pt'), post(3, 'ru')]);
}
