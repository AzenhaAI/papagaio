// [data-th] translations for the news page; see index.js.
// Only the static prose: the bulletin, the date, the word list and its
// heading, "Loading…" and the error line are written by the page's script.
const JM = '<a href="https://www.jm-madeira.pt/" rel="noreferrer">JM-Madeira</a>';
const BOT = 'https://t.me/papagaio_ebot';

export default {
  pt: {
    'news.title': 'Hoje na ilha',
    'news.lede': `O que aconteceu na Madeira esta manhã, reescrito ao nível em que lê, com as palavras que vale a pena guardar logo abaixo. Escrito a partir dos títulos do ${JM} — nunca copiado deles.`,
    'news.bot': `Quer o boletim todas as manhãs sem ter de vir aqui? <a href="${BOT}">O bot envia-o</a> — /news — e a app tem-no com áudio e guarda as palavras com um toque.`,
  },
  ru: {
    'news.title': 'Сегодня на острове',
    'news.lede': `Что произошло на Мадейре сегодня утром — пересказано на вашем уровне, а под текстом слова, которые стоит сохранить. Пишется по заголовкам ${JM} — но никогда не копируется из них.`,
    'news.bot': `Хотите получать сводку каждое утро, не заходя сюда? <a href="${BOT}">Бот присылает её</a> (/news), а в приложении она есть с озвучкой и сохранением слов в одно касание.`,
  },
};
