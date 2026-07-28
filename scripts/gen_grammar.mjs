// Builds the grammar drill deck. Drills are ordinary cards with pos='drill',
// so FSRS, units and statistics work on them unchanged — but they are always
// answered by typing, never by picking from four.
//
// Three families, chosen because they are where Russian speakers actually lose:
//   contractions — preposition + article fuse in Portuguese and have no Russian analogue
//   ser vs estar — one verb in Russian, two here, and the split is not intuitive
//   conjugation  — recognising a form is not producing it
//
// Run: node scripts/gen_grammar.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cards = [];
let n = 0;
const id = () => `gr${String(++n).padStart(4, '0')}`;

// ---------- contractions ----------

const CONTRACTIONS = [
  ['a + o', 'ao', 'Vou ___ supermercado.', 'I am going to the supermarket.'],
  ['a + a', 'à', 'Vamos ___ praia no sábado.', "We're going to the beach on Saturday."],
  ['a + os', 'aos', 'Escrevi ___ meus pais.', 'I wrote to my parents.'],
  ['a + as', 'às', 'A loja abre ___ nove horas.', 'The shop opens at nine.'],
  ['de + o', 'do', 'O carro ___ meu irmão está lá fora.', "My brother's car is outside."],
  ['de + a', 'da', 'Gosto muito ___ comida portuguesa.', 'I really like Portuguese food.'],
  ['de + os', 'dos', 'A casa ___ meus avós é antiga.', "My grandparents' house is old."],
  ['de + as', 'das', 'O barulho ___ obras começa cedo.', 'The noise from the building work starts early.'],
  ['em + o', 'no', 'Moro ___ Funchal há dois anos.', 'I have lived in Funchal for two years.'],
  ['em + a', 'na', 'Trabalho ___ cidade, perto do mercado.', 'I work in the city, near the market.'],
  ['em + os', 'nos', 'A morada está ___ documentos.', 'The address is in the documents.'],
  ['em + as', 'nas', 'Estive ___ urgências toda a noite.', 'I was in A&E all night.'],
  ['por + o', 'pelo', 'Obrigado ___ almoço.', 'Thank you for the lunch.'],
  ['por + a', 'pela', 'Obrigado ___ ajuda de ontem.', "Thank you for yesterday's help."],
  ['por + os', 'pelos', 'Passei ___ correios a caminho.', 'I stopped by the post office on the way.'],
  ['por + as', 'pelas', 'Andámos ___ veredas todo o dia.', 'We walked the trails all day.'],
  ['em + um', 'num', 'Vivo ___ apartamento pequeno.', 'I live in a small flat.'],
  ['em + uma', 'numa', 'Trabalho ___ empresa de dados.', 'I work at a data company.'],
];

for (const [formula, answer, sentence, gloss] of CONTRACTIONS) {
  cards.push({
    id: id(),
    term: answer,
    trans: formula,
    pos: 'drill',
    note: `${formula} always contracts — writing them apart is a mistake, not a style choice.`,
    ex_t: sentence,
    ex_trans: gloss,
    tags: ['drill', 'contraction'],
    unit: 'gramatica',
  });
}

// ---------- ser vs estar ----------

const SER_ESTAR = [
  ['sou', 'Eu ___ russo.', 'I am Russian.', 'ser — origin does not change'],
  ['estou', 'Eu ___ cansado hoje.', 'I am tired today.', 'estar — a state that passes'],
  ['é', 'A Madeira ___ uma ilha.', 'Madeira is an island.', 'ser — a permanent fact'],
  ['está', 'O café ___ frio.', 'The coffee is cold.', 'estar — how it happens to be now'],
  ['somos', 'Nós ___ analistas.', 'We are analysts.', 'ser — profession'],
  ['estamos', 'Nós ___ na praia.', 'We are at the beach.', 'estar — location is always estar'],
  ['é', 'Ela ___ professora.', 'She is a teacher.', 'ser — what she is'],
  ['está', 'Ela ___ doente.', 'She is ill.', 'estar — illness passes'],
  ['está', 'O restaurante ___ fechado hoje.', 'The restaurant is closed today.', 'estar — closed today, open tomorrow'],
  ['é', 'Hoje ___ segunda-feira.', 'Today is Monday.', 'ser — the day itself'],
  ['Está', '___ muito calor hoje.', 'It is very hot today.', 'estar — weather right now'],
  ['és', 'Tu ___ português?', 'Are you Portuguese?', 'ser — nationality'],
  ['estás', 'Tu ___ com fome?', 'Are you hungry?', 'estar com — hunger, thirst, cold'],
  ['são', 'Eles ___ meus vizinhos.', 'They are my neighbours.', 'ser — a lasting relation'],
  ['estão', 'Eles ___ a trabalhar.', 'They are working.', 'estar a + infinitive — the pt-PT progressive'],
  ['está', 'O passaporte ___ na gaveta.', 'The passport is in the drawer.', 'estar — where a thing is'],
];

for (const [answer, sentence, gloss, why] of SER_ESTAR) {
  cards.push({
    id: id(),
    term: answer,
    trans: 'ser or estar?',
    pos: 'drill',
    note: why,
    ex_t: sentence,
    ex_trans: gloss,
    tags: ['drill', 'ser-estar'],
    unit: 'gramatica',
  });
}

// ---------- conjugation, produced not recognised ----------

const PERSONS = ['eu', 'tu', 'ele/ela', 'nós', 'eles/elas'];
const TENSES = { presente: 'presente', pps: 'pretérito perfeito' };
// Past tense only for the verbs whose past is genuinely irregular and frequent.
const PPS_FOR = new Set(['ser', 'estar', 'ter', 'ir', 'fazer', 'poder', 'dizer', 'ver', 'vir']);

const entries = JSON.parse(readFileSync(join(root, 'data/entries/verbs_001.json'), 'utf8')).entries;
const deck = JSON.parse(readFileSync(join(root, 'data/deck/core_001.json'), 'utf8'));
const termById = Object.fromEntries(deck.cards.map((c) => [c.id, c.term ?? c.pt]));

for (const [cardId, entry] of Object.entries(entries)) {
  const verb = termById[cardId];
  if (!verb || !entry.conj) continue;
  for (const [tense, label] of Object.entries(TENSES)) {
    if (!entry.conj[tense]) continue;
    if (tense === 'pps' && !PPS_FOR.has(verb)) continue;
    entry.conj[tense].forEach((form, i) => {
      cards.push({
        id: id(),
        term: form,
        trans: `${verb} — ${PERSONS[i]}, ${label}`,
        pos: 'drill',
        note: '',
        ex_t: `${PERSONS[i]} ___`,
        ex_trans: `${verb}, ${label}`,
        tags: ['drill', 'conjugation', verb],
        unit: 'gramatica',
      });
    });
  }
}

const out = {
  meta: {
    deck: 'gram_001',
    course: 'pt',
    variant: 'pt-PT',
    level: 'A1-A2',
    note: 'Generated by scripts/gen_grammar.mjs — edit the script, not this file.',
  },
  cards: cards.map((c, i) => ({ ...c, freq: 1000 + i })),
};

writeFileSync(join(root, 'data/deck/gram_001.json'), JSON.stringify(out, null, 2) + '\n');
const byTag = {};
for (const c of cards) byTag[c.tags[1]] = (byTag[c.tags[1]] ?? 0) + 1;
console.log(`${cards.length} drills → data/deck/gram_001.json`);
console.log(Object.entries(byTag).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
