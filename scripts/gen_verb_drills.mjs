// Conjugation drills that ask for a form in context, not a row of a table.
//
// Reciting "ser — eu — presente — sou" trains recall along the table, and the
// table is not what the brain reaches for mid-sentence. A gapped sentence with
// a time marker makes the learner do the real operation: read "ontem", read
// "eu", pick the tense and the person. It is also the shape CIPLE tests.
//
// Frequency decides how much of each verb gets drilled. Everyday speech leans
// hard on eu and ele/ela in the present and the simple past; nós and the
// subjunctives matter but do not deserve equal airtime, so they appear for the
// core verbs only.
//
// Run: node scripts/gen_verb_drills.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conjugate } from './conjugate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const SUBJ = ['Eu', 'Tu', 'Ele', 'Nós', 'Eles'];

// A gap with no complement is not a sentence: "Agora, eu ___." teaches nothing.
// Each verb carries a short, everyday continuation so the drill reads like
// something a person would actually say in Madeira.
const COMPLEMENT = {
  abrir: 'a janela', acabar: 'o trabalho', acordar: 'às seis', ajudar: 'o vizinho',
  apanhar: 'o autocarro', assinar: 'o contrato', beber: 'um café', chegar: 'atrasado',
  comer: 'um pastel de nata', 'começar': 'às nove', comprar: 'pão no mercado',
  conhecer: 'esta rua', conseguir: 'abrir a porta', dar: 'os documentos ao senhorio',
  deixar: 'a encomenda na portaria', dizer: 'a verdade', doer: 'a cabeça',
  dormir: 'muito mal', encontrar: 'as chaves', entrar: 'na garagem',
  enviar: 'o recibo', escrever: 'ao senhorio', esperar: 'pelo autocarro',
  esquecer: 'o telemóvel em casa', estacionar: 'perto do mercado', estar: 'cansado',
  falar: 'com o médico', fazer: 'as compras', fechar: 'a porta', ficar: 'em casa',
  ganhar: 'pouco', gastar: 'demasiado', gostar: 'da Madeira', ir: 'ao supermercado',
  lembrar: 'do nome dele', ler: 'as notícias', levar: 'as compras para casa',
  morar: 'no Funchal', mudar: 'de casa', ouvir: 'o mar da varanda',
  pagar: 'com multibanco', pedir: 'a conta', perceber: 'o senhorio',
  poder: 'ajudar', poupar: 'algum dinheiro', 'precisar': 'de ajuda',
  procurar: 'um apartamento', 'pôr': 'as compras no frigorífico', querer: 'um galão',
  receber: 'o ordenado', saber: 'o caminho', sair: 'do trabalho', ser: 'analista',
  tentar: 'outra vez', ter: 'uma marcação', trabalhar: 'com dados',
  transferir: 'o dinheiro', trazer: 'o passaporte', usar: 'o multibanco',
  vender: 'o carro', ver: 'o mar daqui', vir: 'de comboio', viver: 'na ilha',
  voltar: 'na quinta-feira',
};

// A predicate noun or adjective agrees with its subject, so "nós somos
// analista" is wrong. Only these few need a plural form.
const COMPLEMENT_PLURAL = {
  ser: 'analistas', estar: 'cansados', chegar: 'atrasados',
};


// Each frame carries the cue that forces the tense. Without the cue the gap has
// several right answers and the drill teaches nothing.
const FRAMES = {
  presente:     [['Agora', 'right now'], ['Todos os dias', 'every day'], ['Hoje', 'today']],
  pps:          [['Ontem', 'yesterday'], ['Na semana passada', 'last week'], ['No sábado', 'on Saturday']],
  imperfeito:   [['Antigamente', 'in the old days'], ['Quando era criança', 'as a child']],
  futuro:       [['Amanhã', 'tomorrow'], ['Para o ano', 'next year']],
  presente_conj:[['Espero que', 'I hope that'], ['Talvez', 'maybe']],
  futuro_conj:  [['Quando', 'when'], ['Assim que', 'as soon as']],
  imperfeito_conj: [['Se', 'if']],
};

const TENSE_EN = {
  presente: 'present',
  pps: 'simple past',
  imperfeito: 'imperfect',
  futuro: 'future',
  presente_conj: 'present subjunctive',
  futuro_conj: 'future subjunctive',
  imperfeito_conj: 'imperfect subjunctive',
};

// The verbs worth drilling beyond the two workhorse tenses.
const CORE = new Set([
  'ser', 'estar', 'ter', 'ir', 'fazer', 'poder', 'querer', 'saber',
  'dizer', 'ver', 'dar', 'vir', 'ficar', 'pôr', 'gostar', 'precisar',
]);

// Persons in rough order of how often you produce them.
const PERSON_PLAN = {
  common: [0, 2],        // eu, ele
  extended: [0, 2, 3],   // + nós
};

let n = 0;
const id = () => `vd${String(++n).padStart(4, '0')}`;
const cards = [];

// Verbs come from the deck, so the drills follow whatever it teaches.
const verbs = new Map();
for (const file of readdirSync(join(root, 'data/deck')).filter((f) => f.endsWith('.json'))) {
  const deck = JSON.parse(readFileSync(join(root, 'data/deck', file), 'utf8'));
  if (deck.meta.course !== 'pt') continue;
  for (const c of deck.cards) {
    if (c.pos !== 'verb') continue;
    const term = (c.term ?? c.pt).split(/[\s-]/)[0].toLowerCase();
    if (!verbs.has(term)) verbs.set(term, c.trans);
  }
}

for (const [verb, gloss] of verbs) {
  const conj = conjugate(verb);
  if (!conj) continue;
  const core = CORE.has(verb);

  const tenses = core
    ? ['presente', 'pps', 'imperfeito', 'futuro', 'presente_conj', 'futuro_conj']
    : ['presente', 'pps'];

  for (const tense of tenses) {
    const forms = conj[tense];
    if (!forms) continue;
    const people = core && tense === 'presente' ? PERSON_PLAN.extended : PERSON_PLAN.common;

    for (const p of people) {
      const [cue, cueEn] = FRAMES[tense][(n + p) % FRAMES[tense].length];
      const subj = SUBJ[p];
      // Subjunctive frames read as a subordinate clause, so the cue leads.
      const plural = p === 3 || p === 4;
      const comp = (plural && COMPLEMENT_PLURAL[verb]) || COMPLEMENT[verb];
      const tail = comp ? ` ${comp}` : '';
      const sentence = tense.endsWith('_conj')
        ? `${cue} ${subj.toLowerCase()} ___${tail}, …`
        : `${cue}, ${subj.toLowerCase()} ___${tail}.`;

      cards.push({
        id: id(),
        term: forms[p],
        trans: `${verb} — ${TENSE_EN[tense]}, ${subj.toLowerCase()}`,
        pos: 'drill',
        note: `${cue} (${cueEn}) is what forces the ${TENSE_EN[tense]} here.`,
        ex_t: sentence,
        ex_trans: `${verb} = ${gloss}`,
        tags: ['drill', 'conjugation', verb],
        unit: 'gramatica',
        freq: 2000 + n,
      });
    }
  }
}

const out = {
  meta: {
    deck: 'verb_drills',
    course: 'pt',
    variant: 'pt-PT',
    level: 'A2-B1',
    note: 'Generated by scripts/gen_verb_drills.mjs — a form in context, never a table row.',
  },
  cards,
};
writeFileSync(join(root, 'data/deck/verb_drills.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`${cards.length} contextual drills over ${verbs.size} verbs → data/deck/verb_drills.json`);
