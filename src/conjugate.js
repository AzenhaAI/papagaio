// European Portuguese conjugation, by rule where the rules hold and by table
// where they do not.
//
// Generated rather than written out: a model asked for "pudemos" will sometimes
// give "podemos", and the mistake is invisible until a learner repeats it. Rules
// plus an explicit irregular table are checkable; prose from a model is not.
//
// Persons throughout: eu, tu, ele/ela, nós, eles/elas. Portugal drops vós in
// speech, so it is not carried.
//
// Tenses cover what an A2–B1 learner meets, grouped by time in the UI:
//   past    — pps, imperfeito, mais_que_perfeito, imperfeito_conj
//   present — presente, presente_conj, condicional, imperativo
//   future  — futuro, futuro_conj

const P = 5;

/** Orthography that keeps the sound when the ending changes.
 *
 * Which way a stem shifts depends on the conjugation, because the same letter
 * is hard in one class and soft in the other. Applying both sets to every verb
 * is what produced «fiço» and «esqueque» in the deck: c is hard in ficar, so it
 * needs no ç before o, and soft in esquecer, so it needs no qu before e. */
function respell(stem, ending, kind) {
  const soft = /^[ei]/.test(ending);
  if (kind === 'ar') {
    // Hard c/g: they take a u to stay hard in front of e/i…
    if (soft) {
      if (stem.endsWith('c')) return stem.slice(0, -1) + 'qu' + ending;   // ficar → fique
      if (stem.endsWith('g')) return stem.slice(0, -1) + 'gu' + ending;   // chegar → chegue
      if (stem.endsWith('ç')) return stem.slice(0, -1) + 'c' + ending;    // começar → comece
    }
    // …and are already right in front of a/o: ficar → fico, never fiço.
    return stem + ending;
  }
  // -er / -ir: c and g are soft here, so a/o is the ending that needs help,
  // and e/i leaves the stem alone: esquecer → esqueço but esquece, esqueci.
  if (/^[ao]/.test(ending)) {
    if (stem.endsWith('gu')) return stem.slice(0, -2) + 'g' + ending;     // erguer → ergo
    if (stem.endsWith('c')) return stem.slice(0, -1) + 'ç' + ending;      // conhecer → conheço
    if (stem.endsWith('g')) return stem.slice(0, -1) + 'j' + ending;      // proteger → protejo
  }
  return stem + ending;
}

const REGULAR = {
  ar: {
    presente: ['o', 'as', 'a', 'amos', 'am'],
    // pt-PT keeps the acute on the first-person plural preterite: falámos.
    pps: ['ei', 'aste', 'ou', 'ámos', 'aram'],
    imperfeito: ['ava', 'avas', 'ava', 'ávamos', 'avam'],
    presente_conj: ['e', 'es', 'e', 'emos', 'em'],
    imperfeito_conj: ['asse', 'asses', 'asse', 'ássemos', 'assem'],
    participio: 'ado',
  },
  er: {
    presente: ['o', 'es', 'e', 'emos', 'em'],
    pps: ['i', 'este', 'eu', 'emos', 'eram'],
    imperfeito: ['ia', 'ias', 'ia', 'íamos', 'iam'],
    presente_conj: ['a', 'as', 'a', 'amos', 'am'],
    imperfeito_conj: ['esse', 'esses', 'esse', 'êssemos', 'essem'],
    participio: 'ido',
  },
  ir: {
    presente: ['o', 'es', 'e', 'imos', 'em'],
    pps: ['i', 'iste', 'iu', 'imos', 'iram'],
    imperfeito: ['ia', 'ias', 'ia', 'íamos', 'iam'],
    presente_conj: ['a', 'as', 'a', 'amos', 'am'],
    imperfeito_conj: ['isse', 'isses', 'isse', 'íssemos', 'issem'],
    participio: 'ido',
  },
};

// Futuro and condicional attach to the whole infinitive, so they are regular for
// almost every verb — only these three contract.
const FUTURE_STEM = { fazer: 'far', dizer: 'dir', trazer: 'trar' };

/** -ir verbs whose last stem vowel lifts — e→i, o→u — in the 1sg present and in
 * every present subjunctive built on it: servir → sirvo, sirva; dormir → durmo,
 * durma. Every other tense keeps the plain stem (servi, servia, servirei).
 *
 * Membership is lexical, not phonetic, so the verbs are listed rather than
 * derived: seguir lifts (sigo) while emergir does not (emerjo), and no rule
 * over the spelling separates them. A verb in IRREGULAR wins over this table. */
const STEM_LIFT = {
  e: ['aderir', 'advertir', 'competir', 'conferir', 'conseguir', 'consentir',
      'despir', 'digerir', 'divertir', 'ferir', 'inserir', 'investir', 'mentir',
      'perseguir', 'preferir', 'referir', 'refletir', 'repetir', 'seguir',
      'sentir', 'servir', 'sugerir', 'transferir', 'vestir'],
  o: ['cobrir', 'descobrir', 'dormir', 'encobrir', 'engolir', 'polir', 'tossir'],
};

/** Lift the last e or o in the stem; returns the stem unchanged for the rest. */
function liftStem(verb, stem) {
  const v = STEM_LIFT.e.includes(verb) ? 'e' : STEM_LIFT.o.includes(verb) ? 'o' : null;
  if (!v) return stem;
  const at = stem.lastIndexOf(v);
  if (at < 0) return stem;
  return stem.slice(0, at) + (v === 'e' ? 'i' : 'u') + stem.slice(at + 1);
}

/** Verbs whose stems change. Only the tenses that deviate are listed. */
const IRREGULAR = {
  ser: {
    presente: ['sou', 'és', 'é', 'somos', 'são'],
    pps: ['fui', 'foste', 'foi', 'fomos', 'foram'],
    imperfeito: ['era', 'eras', 'era', 'éramos', 'eram'],
    presente_conj: ['seja', 'sejas', 'seja', 'sejamos', 'sejam'],
    imperfeito_conj: ['fosse', 'fosses', 'fosse', 'fôssemos', 'fossem'],
    futuro_conj: ['for', 'fores', 'for', 'formos', 'forem'],
    imperativo: ['', 'sê', 'seja', 'sejamos', 'sejam'],
    participio: 'sido',
  },
  estar: {
    presente: ['estou', 'estás', 'está', 'estamos', 'estão'],
    pps: ['estive', 'estiveste', 'esteve', 'estivemos', 'estiveram'],
    presente_conj: ['esteja', 'estejas', 'esteja', 'estejamos', 'estejam'],
    imperfeito_conj: ['estivesse', 'estivesses', 'estivesse', 'estivéssemos', 'estivessem'],
    futuro_conj: ['estiver', 'estiveres', 'estiver', 'estivermos', 'estiverem'],
    participio: 'estado',
  },
  ter: {
    presente: ['tenho', 'tens', 'tem', 'temos', 'têm'],
    pps: ['tive', 'tiveste', 'teve', 'tivemos', 'tiveram'],
    imperfeito: ['tinha', 'tinhas', 'tinha', 'tínhamos', 'tinham'],
    presente_conj: ['tenha', 'tenhas', 'tenha', 'tenhamos', 'tenham'],
    imperfeito_conj: ['tivesse', 'tivesses', 'tivesse', 'tivéssemos', 'tivessem'],
    futuro_conj: ['tiver', 'tiveres', 'tiver', 'tivermos', 'tiverem'],
    participio: 'tido',
  },
  ir: {
    presente: ['vou', 'vais', 'vai', 'vamos', 'vão'],
    pps: ['fui', 'foste', 'foi', 'fomos', 'foram'],
    imperfeito: ['ia', 'ias', 'ia', 'íamos', 'iam'],
    presente_conj: ['vá', 'vás', 'vá', 'vamos', 'vão'],
    imperfeito_conj: ['fosse', 'fosses', 'fosse', 'fôssemos', 'fossem'],
    futuro_conj: ['for', 'fores', 'for', 'formos', 'forem'],
    participio: 'ido',
  },
  fazer: {
    presente: ['faço', 'fazes', 'faz', 'fazemos', 'fazem'],
    pps: ['fiz', 'fizeste', 'fez', 'fizemos', 'fizeram'],
    presente_conj: ['faça', 'faças', 'faça', 'façamos', 'façam'],
    imperfeito_conj: ['fizesse', 'fizesses', 'fizesse', 'fizéssemos', 'fizessem'],
    futuro_conj: ['fizer', 'fizeres', 'fizer', 'fizermos', 'fizerem'],
    participio: 'feito',
  },
  poder: {
    presente: ['posso', 'podes', 'pode', 'podemos', 'podem'],
    pps: ['pude', 'pudeste', 'pôde', 'pudemos', 'puderam'],
    presente_conj: ['possa', 'possas', 'possa', 'possamos', 'possam'],
    imperfeito_conj: ['pudesse', 'pudesses', 'pudesse', 'pudéssemos', 'pudessem'],
    futuro_conj: ['puder', 'puderes', 'puder', 'pudermos', 'puderem'],
    participio: 'podido',
  },
  querer: {
    presente: ['quero', 'queres', 'quer', 'queremos', 'querem'],
    pps: ['quis', 'quiseste', 'quis', 'quisemos', 'quiseram'],
    presente_conj: ['queira', 'queiras', 'queira', 'queiramos', 'queiram'],
    imperfeito_conj: ['quisesse', 'quisesses', 'quisesse', 'quiséssemos', 'quisessem'],
    futuro_conj: ['quiser', 'quiseres', 'quiser', 'quisermos', 'quiserem'],
    participio: 'querido',
  },
  saber: {
    presente: ['sei', 'sabes', 'sabe', 'sabemos', 'sabem'],
    pps: ['soube', 'soubeste', 'soube', 'soubemos', 'souberam'],
    presente_conj: ['saiba', 'saibas', 'saiba', 'saibamos', 'saibam'],
    imperfeito_conj: ['soubesse', 'soubesses', 'soubesse', 'soubéssemos', 'soubessem'],
    futuro_conj: ['souber', 'souberes', 'souber', 'soubermos', 'souberem'],
    participio: 'sabido',
  },
  dizer: {
    presente: ['digo', 'dizes', 'diz', 'dizemos', 'dizem'],
    pps: ['disse', 'disseste', 'disse', 'dissemos', 'disseram'],
    presente_conj: ['diga', 'digas', 'diga', 'digamos', 'digam'],
    imperfeito_conj: ['dissesse', 'dissesses', 'dissesse', 'disséssemos', 'dissessem'],
    futuro_conj: ['disser', 'disseres', 'disser', 'dissermos', 'disserem'],
    participio: 'dito',
  },
  ver: {
    presente: ['vejo', 'vês', 'vê', 'vemos', 'veem'],
    pps: ['vi', 'viste', 'viu', 'vimos', 'viram'],
    presente_conj: ['veja', 'vejas', 'veja', 'vejamos', 'vejam'],
    imperfeito_conj: ['visse', 'visses', 'visse', 'víssemos', 'vissem'],
    futuro_conj: ['vir', 'vires', 'vir', 'virmos', 'virem'],
    participio: 'visto',
  },
  dar: {
    presente: ['dou', 'dás', 'dá', 'damos', 'dão'],
    pps: ['dei', 'deste', 'deu', 'demos', 'deram'],
    presente_conj: ['dê', 'dês', 'dê', 'demos', 'deem'],
    imperfeito_conj: ['desse', 'desses', 'desse', 'déssemos', 'dessem'],
    futuro_conj: ['der', 'deres', 'der', 'dermos', 'derem'],
    participio: 'dado',
  },
  vir: {
    presente: ['venho', 'vens', 'vem', 'vimos', 'vêm'],
    pps: ['vim', 'vieste', 'veio', 'viemos', 'vieram'],
    imperfeito: ['vinha', 'vinhas', 'vinha', 'vínhamos', 'vinham'],
    presente_conj: ['venha', 'venhas', 'venha', 'venhamos', 'venham'],
    imperfeito_conj: ['viesse', 'viesses', 'viesse', 'viéssemos', 'viessem'],
    futuro_conj: ['vier', 'vieres', 'vier', 'viermos', 'vierem'],
    participio: 'vindo',
  },
  pôr: {
    presente: ['ponho', 'pões', 'põe', 'pomos', 'põem'],
    pps: ['pus', 'puseste', 'pôs', 'pusemos', 'puseram'],
    imperfeito: ['punha', 'punhas', 'punha', 'púnhamos', 'punham'],
    presente_conj: ['ponha', 'ponhas', 'ponha', 'ponhamos', 'ponham'],
    imperfeito_conj: ['pusesse', 'pusesses', 'pusesse', 'puséssemos', 'pusessem'],
    futuro_conj: ['puser', 'puseres', 'puser', 'pusermos', 'puserem'],
    futuro: ['porei', 'porás', 'porá', 'poremos', 'porão'],
    condicional: ['poria', 'porias', 'poria', 'poríamos', 'poriam'],
    participio: 'posto',
  },
  trazer: {
    presente: ['trago', 'trazes', 'traz', 'trazemos', 'trazem'],
    pps: ['trouxe', 'trouxeste', 'trouxe', 'trouxemos', 'trouxeram'],
    presente_conj: ['traga', 'tragas', 'traga', 'tragamos', 'tragam'],
    imperfeito_conj: ['trouxesse', 'trouxesses', 'trouxesse', 'trouxéssemos', 'trouxessem'],
    futuro_conj: ['trouxer', 'trouxeres', 'trouxer', 'trouxermos', 'trouxerem'],
    participio: 'trazido',
  },
  sair: {
    presente: ['saio', 'sais', 'sai', 'saímos', 'saem'],
    pps: ['saí', 'saíste', 'saiu', 'saímos', 'saíram'],
    presente_conj: ['saia', 'saias', 'saia', 'saiamos', 'saiam'],
    imperfeito_conj: ['saísse', 'saísses', 'saísse', 'saíssemos', 'saíssem'],
    participio: 'saído',
  },
  ler: {
    presente: ['leio', 'lês', 'lê', 'lemos', 'leem'],
    pps: ['li', 'leste', 'leu', 'lemos', 'leram'],
    presente_conj: ['leia', 'leias', 'leia', 'leiamos', 'leiam'],
    participio: 'lido',
  },
  ouvir: {
    presente: ['ouço', 'ouves', 'ouve', 'ouvimos', 'ouvem'],
    presente_conj: ['ouça', 'ouças', 'ouça', 'ouçamos', 'ouçam'],
    participio: 'ouvido',
  },
  pedir: {
    presente: ['peço', 'pedes', 'pede', 'pedimos', 'pedem'],
    presente_conj: ['peça', 'peças', 'peça', 'peçamos', 'peçam'],
    participio: 'pedido',
  },
  dormir: {
    presente: ['durmo', 'dormes', 'dorme', 'dormimos', 'dormem'],
    presente_conj: ['durma', 'durmas', 'durma', 'durmamos', 'durmam'],
    participio: 'dormido',
  },
  perder: {
    presente: ['perco', 'perdes', 'perde', 'perdemos', 'perdem'],
    presente_conj: ['perca', 'percas', 'perca', 'percamos', 'percam'],
    participio: 'perdido',
  },
  conseguir: {
    presente: ['consigo', 'consegues', 'consegue', 'conseguimos', 'conseguem'],
    presente_conj: ['consiga', 'consigas', 'consiga', 'consigamos', 'consigam'],
    participio: 'conseguido',
  },
  abrir: { participio: 'aberto' },
  escrever: { participio: 'escrito' },
};

// ter, conjugated, is the auxiliary for the compound pasts.
const TER_IMPERFEITO = ['tinha', 'tinhas', 'tinha', 'tínhamos', 'tinham'];
const TER_PRESENTE = ['tenho', 'tens', 'tem', 'temos', 'têm'];
// ir in the present is how spoken Portuguese actually says the future.
const IR_PRESENTE = ['vou', 'vais', 'vai', 'vamos', 'vão'];

/** Full conjugation for one infinitive. Returns null for non-verbs. */
export function conjugate(infinitive) {
  const verb = String(infinitive || '').trim().toLowerCase();
  const m = verb.match(/^(.*?)(ar|er|ir)$/);
  const irr = IRREGULAR[verb];
  if (!m && verb !== 'pôr') return null;

  const stem = verb === 'pôr' ? 'po' : m[1];
  const kind = verb === 'pôr' ? 'er' : m[2];
  const R = REGULAR[kind];
  const reg = (endings) => endings.map((e) => respell(stem, e, kind));

  // The lifted stem carries the 1sg present and the whole present subjunctive.
  const lifted = kind === 'ir' ? liftStem(verb, stem) : stem;
  const lift = (endings) => endings.map((e) => respell(lifted, e, kind));

  const out = {
    presente: irr?.presente
      ?? (lifted === stem ? reg(R.presente)
        : [lift([R.presente[0]])[0], ...reg(R.presente).slice(1)]),
    pps: irr?.pps ?? reg(R.pps),
    imperfeito: irr?.imperfeito ?? reg(R.imperfeito),
    presente_conj: irr?.presente_conj ?? lift(R.presente_conj),
    imperfeito_conj: irr?.imperfeito_conj ?? reg(R.imperfeito_conj),
  };

  const fstem = FUTURE_STEM[verb] ?? verb;
  out.futuro = irr?.futuro ?? ['ei', 'ás', 'á', 'emos', 'ão'].map((e) => fstem + e);
  out.condicional = irr?.condicional ?? ['ia', 'ias', 'ia', 'íamos', 'iam'].map((e) => fstem + e);

  // Personal infinitive doubles as the future subjunctive for regular verbs.
  out.futuro_conj = irr?.futuro_conj ?? ['', 'es', '', 'mos', 'em'].map((e) => verb + e);

  // Affirmative imperative: tu borrows the indicative, the rest the subjunctive.
  out.imperativo = irr?.imperativo ?? [
    '', out.presente[2], out.presente_conj[2], out.presente_conj[3], out.presente_conj[4],
  ];

  const part = irr?.participio ?? stem + R.participio;
  out.mais_que_perfeito = TER_IMPERFEITO.map((t) => `${t} ${part}`);
  // "tenho falado" — repetition reaching the present. A famous trap: it is NOT
  // the English present perfect, and Brazilian usage differs too.
  out.ppc = TER_PRESENTE.map((t) => `${t} ${part}`);
  // "vou falar" — the future people actually say; futuro simples is bookish.
  out.futuro_prox = IR_PRESENTE.map((v) => `${v} ${verb}`);
  out.participio = part;
  out.gerundio = verb === 'pôr' ? 'pondo' : stem + (kind === 'ar' ? 'ando' : kind === 'er' ? 'endo' : 'indo');

  for (const [k, v] of Object.entries(out)) {
    if (Array.isArray(v) && v.length !== P) throw new Error(`${verb}: ${k} has ${v.length} forms`);
  }
  return out;
}

export const IRREGULAR_VERBS = Object.keys(IRREGULAR);
