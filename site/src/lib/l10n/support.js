// [data-th] translations for the support page; see index.js.
// Menu paths (Settings → Pairing code, Settings → Offline dictionaries, the
// "Start here" button) use the app's own labels from lib/data/l10n.dart.
// support.spelled must never contain a recognisable email address:
// Cloudflare would rewrite it, which is the whole point of that paragraph.
const BOT = '<a href="https://t.me/papagaio_ebot">@papagaio_ebot</a>';
const MAIL = '<a href="mailto:agent@azenha.ai">agent@azenha.ai</a>';

export default {
  pt: {
    'support.title': 'Apoio',
    'support.intro': 'Ajuda para as apps PapaGaio — iPhone, iPad, Android, Mac e Windows — e para o bot do Telegram.',
    'support.contact.h': 'Contacto',
    'support.contact': `Escreva para ${MAIL} — perguntas, relatos de erros e sugestões são todos bem-vindos, e costumamos responder no espaço de um par de dias. Se preferir o chat, o bot ${BOT} vai dar ao mesmo sítio.`,
    'support.spelled': 'Endereço de apoio, por extenso: agent [at] azenha.ai — a Cloudflare substitui qualquer endereço que reconheça por um redirecionamento anti-spam, por isso a cópia legível tem de escapar ao detetor para continuar legível no código-fonte da página.',
    'support.faq.h': 'Perguntas frequentes',
    'support.account.q': 'Preciso de uma conta?',
    'support.account.a': 'Não. A app abre diretamente no tradutor e no dicionário. Toque em <em>Começar aqui</em> no separador Cartões e é criado um perfil no momento — sem e-mail, sem palavra-passe, nada para memorizar.',
    'support.sync.q': 'Como tenho o mesmo progresso no telemóvel e no portátil?',
    'support.sync.a': `Envie <code>/link</code> ao ${BOT} e cole na app o código que ele lhe responder (Definições → Código de associação). Todos os dispositivos com esse código partilham o mesmo baralho e a mesma fila de revisões: comece um cartão no telemóvel e termine-o no portátil.`,
    'support.offline.q': 'Funciona sem internet?',
    'support.offline.a': 'Nas apps, sim: o dicionário de português (110 133 entradas) vem incluído e funciona offline desde a primeira vez que abre a app, e há mais pacotes em Definições → Dicionários offline. Este site precisa de ligação. Os cartões que já sincronizou também podem ser revistos offline, e as suas respostas são enviadas quando a ligação voltar. O Tutor IA, o tradutor e a tradução de fotografias precisam de ligação — é no servidor que pensam.',
    'support.sound.q': 'Não há som.',
    'support.sound.a': 'Verifique primeiro o interruptor de silêncio e o volume — o áudio é reproduzido pelo canal de multimédia. As gravações são transferidas uma vez e guardadas em cache, por isso a primeira reprodução de cada palavra precisa de ligação.',
    'support.ptpt.q': 'Porquê só português europeu?',
    'support.ptpt.a': 'Porque é essa a ideia. A maioria dos tradutores responde, sem avisar, na variante brasileira; o PapaGaio responde sempre no português falado em Portugal e na Madeira, e assinala cada palavra em que as duas diferem.',
    'support.delete.q': 'Como apago os meus dados?',
    'support.delete.a': 'Envie <code>/delete</code> ao bot, ou escreva-nos para o endereço acima a pedi-lo — são apagados o perfil, os cartões que adicionou e o histórico de revisões. Apagar só a app remove apenas a cópia local.',
    'support.free.q': 'É mesmo grátis?',
    'support.free.a': 'Sim — sem anúncios, sem subscrição, sem versão premium, nada bloqueado. Funciona em infraestrutura gratuita e foi feito como ferramenta para aprender línguas, não como negócio.',
    'support.privacy.h': 'Privacidade',
    'support.privacy': 'O que é guardado e o que não é: <a href="/papagaio/privacy/">política de privacidade</a>.',
  },
  ru: {
    'support.title': 'Поддержка',
    'support.intro': 'Помощь по приложениям PapaGaio — для iPhone, iPad, Android, Mac и Windows — и по боту в Telegram.',
    'support.contact.h': 'Связаться',
    'support.contact': `Пишите на ${MAIL} — рады вопросам, сообщениям об ошибках и предложениям; обычно отвечаем в течение пары дней. Если удобнее чат, пишите боту ${BOT} — сообщение попадёт туда же.`,
    'support.spelled': 'Адрес поддержки, записанный текстом: agent [at] azenha.ai — Cloudflare заменяет любой распознанный адрес антиспам-переадресацией, поэтому читаемую копию приходится прятать от сканера, иначе в исходном коде страницы её не прочесть.',
    'support.faq.h': 'Частые вопросы',
    'support.account.q': 'Нужен ли аккаунт?',
    'support.account.a': 'Нет. Приложение сразу открывается на переводчике и словаре. Нажмите <em>Начать здесь</em> на вкладке «Карточки» — и профиль создастся тут же: без почты, без пароля, ничего не нужно запоминать.',
    'support.sync.q': 'Как сделать прогресс общим на телефоне и ноутбуке?',
    'support.sync.a': `Отправьте <code>/link</code> боту ${BOT} и вставьте код из его ответа в приложение («Настройки → Код связи»). Все устройства с этим кодом делят одну колоду и одну очередь повторений: начните карточку на телефоне — закончите на ноутбуке.`,
    'support.offline.q': 'Работает ли без интернета?',
    'support.offline.a': 'В приложениях — да: словарь португальского (110 133 статьи) встроен и работает без интернета с первого запуска, а дополнительные пакеты — в разделе «Настройки → Оффлайн-словари». Этому сайту нужен интернет. Уже синхронизированные карточки тоже можно повторять без сети, а ответы отправятся, когда связь вернётся. ИИ-коучу, переводчику и переводу по фото нужен интернет — они думают на сервере.',
    'support.sound.q': 'Нет звука.',
    'support.sound.a': 'Сначала проверьте переключатель беззвучного режима и громкость — звук идёт через канал мультимедиа. Записи загружаются один раз и кэшируются, поэтому для самого первого воспроизведения слова нужен интернет.',
    'support.ptpt.q': 'Почему только европейский португальский?',
    'support.ptpt.a': 'Потому что в этом весь смысл. Большинство переводчиков без предупреждения отвечают на бразильском варианте; PapaGaio всегда отвечает на португальском, на котором говорят в Португалии и на Мадейре, и отмечает каждое слово, где варианты расходятся.',
    'support.delete.q': 'Как удалить мои данные?',
    'support.delete.a': 'Отправьте <code>/delete</code> боту или напишите нам об этом на адрес выше — удалятся профиль, добавленные вами карточки и история повторений. Если удалить только приложение, сотрётся лишь локальная копия.',
    'support.free.q': 'Это правда бесплатно?',
    'support.free.a': 'Да — без рекламы, без подписки, без премиум-тарифа, ничего не заблокировано. Работает на бесплатной инфраструктуре и создан как инструмент для изучения языков, а не как бизнес.',
    'support.privacy.h': 'Конфиденциальность',
    'support.privacy': 'Что хранится, а что нет: <a href="/papagaio/privacy/">политика конфиденциальности</a>.',
  },
};
