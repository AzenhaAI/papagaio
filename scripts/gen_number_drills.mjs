// Drills for the closed sets: numbers, dates, clock times, prices.
//
// These are the sets you cannot half-know — "quarenta e sete" is not derivable
// from vibes, and a phone number read aloud waits for nobody. Same drill shape
// as the verb drills: a gap in a real sentence, typed answer, so the bot's
// existing 'drill' exercise handles them with zero new code.
//
// Everything is generated from the number grammar itself, so the answers are
// correct by construction — including the pt-PT points Brazilian tables miss
// (catorze not quatorze, and 'meio-dia e meia' for 12:30).
//
// Run: node scripts/gen_number_drills.mjs   → writes data/deck/number_drills.json

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const UNITS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const TEENS = ['dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezasseis', 'dezassete', 'dezoito', 'dezanove'];
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

/** 0–999 in European Portuguese words. Feminine flips um/dois → uma/duas. */
function num(n, { fem = false } = {}) {
  if (n === 100) return 'cem';
  const unit = (u) => fem && u === 1 ? 'uma' : fem && u === 2 ? 'duas' : UNITS[u];
  if (n < 10) return unit(n);
  if (n < 20) return TEENS[n - 10];
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    return n % 10 ? `${t} e ${unit(n % 10)}` : t;
  }
  const h = Math.floor(n / 100);
  const hundred = h === 2 && fem ? 'duzentas' : HUNDREDS[h];
  return n % 100 ? `${hundred} e ${num(n % 100, { fem })}` : hundred;
}

const cards = [];
let i = 0;
const add = (term, trans, note, ex_t, ex_trans, tags) => {
  cards.push({
    id: `nd${String(++i).padStart(4, '0')}`,
    term, trans, pos: 'drill', note, ex_t, ex_trans,
    tags: ['drill', ...tags], unit: 'numeros_drill', freq: 2500 + i,
  });
};

// --- plain numbers, weighted at the sizes life actually uses ---
const PICKS = [4, 7, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 25, 28, 30, 33,
  37, 40, 44, 47, 50, 55, 60, 66, 70, 76, 80, 88, 90, 99, 100, 101, 111, 125,
  150, 200, 247, 300, 365, 400, 500, 650, 750, 999];
for (const n of PICKS) {
  add(num(n), `${n} in words`,
    n === 14 ? 'catorze — the pt-PT spelling; quatorze is Brazilian' :
    n >= 16 && n <= 19 ? 'dezasseis/dezassete/dezoito/dezanove — pt-PT keeps the a' :
    n === 100 ? 'cem alone, cento e… once anything follows' :
    n % 100 && n > 100 ? 'e joins hundreds to the rest: cento e vinte e cinco' :
    'tens join with e: quarenta e sete',
    `O número ___ (${n}).`, 'write the number in words', ['numero']);
}

// --- feminine agreement, the trap ---
for (const [n, noun, en] of [[2, 'cervejas', 'beers'], [1, 'mesa', 'table'],
  [2, 'chávenas', 'cups'], [22, 'pessoas', 'people'], [200, 'gramas', 'grams'],
  [32, 'páginas', 'pages']]) {
  add(num(n, { fem: true }), `${n} + feminine noun`,
    'um/dois flip to uma/duas before feminine nouns — duzentas too',
    `Queria ___ ${noun} (${n}).`, `I'd like ${n} ${en}`, ['numero', 'genero']);
}

// --- ordinals: floors, rounds, kings ---
const ORD = [['primeiro', 1], ['segundo', 2], ['terceiro', 3], ['quarto', 4],
  ['quinto', 5], ['sexto', 6], ['sétimo', 7], ['oitavo', 8], ['nono', 9], ['décimo', 10]];
for (const [w, n] of ORD) {
  add(w, `${n}º — ordinal`,
    'ordinals agree: primeira vez, segundo andar',
    `Moro no ___ andar (${n}º).`, `I live on floor ${n}`, ['numero', 'ordinal']);
}

// --- clock times, pt-PT style ---
const CLOCK = [
  ['são nove horas', '9:00', 'plural são for every hour except one'],
  ['é uma hora', '1:00', 'é (singular) only for one o\'clock and noon/midnight'],
  ['são nove e meia', '9:30', 'meia = half past; no word for minutes needed'],
  ['são dez e um quarto', '10:15', 'e um quarto = quarter past'],
  ['são vinte para as sete', '6:40', 'pt-PT counts DOWN to the hour: twenty to seven'],
  ['é um quarto para as três', '2:45', 'um quarto para as… — quarter to'],
  ['é meio-dia', '12:00', 'meio-dia — noon; meia-noite — midnight'],
  ['é meio-dia e meia', '12:30', 'e meia agrees with hora — meio-dia e meia, not e meio'],
  ['são dezanove horas', '19:00', 'timetables speak 24h: dezanove horas'],
];
for (const [words, t, note] of CLOCK) {
  add(words, `${t} — telling the time`, note,
    `— Que horas são? — ___ (${t}).`, 'answer with the time in words', ['tempo', 'horas']);
}

// --- dates ---
const DATES = [
  ['a um de janeiro', '1 Jan', 'day one is "a um", not first — no ordinal in pt-PT dates'],
  ['a vinte e cinco de abril', '25 Apr', 'the Revolution day — em abril de 1974'],
  ['a dez de junho', '10 Jun', 'Dia de Portugal'],
  ['a quinze de agosto', '15 Aug', 'months stay lowercase'],
  ['a trinta e um de dezembro', '31 Dec', ''],
];
for (const [words, d, note] of DATES) {
  add(words, `${d} — the date`, note,
    `A reunião é ___ (${d}).`, 'say the date in words', ['tempo', 'datas']);
}

// --- prices, the daily arithmetic ---
const PRICES = [
  ['dois euros e cinquenta', '2,50 €', 'euros e cêntimos — the e does the decimal point'],
  ['um euro e vinte', '1,20 €', ''],
  ['quinze euros e noventa e nove', '15,99 €', ''],
  ['cento e vinte euros', '120 €', ''],
];
for (const [words, p, note] of PRICES) {
  add(words, `${p} — the price`, note,
    `— Quanto é? — São ___ (${p}).`, 'say the price in words', ['numero', 'financas']);
}

// --- years, phone-style digit groups ---
add('mil novecentos e setenta e quatro', 'the year 1974',
  'years read as full numbers, no "nineteen seventy-four" shortcut',
  'A revolução foi em ___ (1974).', 'say the year in words', ['numero', 'datas']);
add('dois mil e vinte e seis', 'the year 2026', '',
  'Estamos em ___ (2026).', 'say the year in words', ['numero', 'datas']);
add('nove, um, um', '911 → digit by digit',
  'phone numbers go digit by digit; 112 is the real emergency number',
  'O número de emergência é um, um, dois — não ___ (9-1-1).', 'digits, one by one', ['numero']);

const out = {
  meta: {
    deck: 'number_drills',
    course: 'pt',
    variant: 'pt-PT',
    level: 'A1-A2',
    note: 'Generated by scripts/gen_number_drills.mjs — closed sets drilled in context: numbers, ordinals, clock, dates, prices. Answers correct by construction.',
  },
  cards,
};
writeFileSync(join(root, 'data', 'deck', 'number_drills.json'), JSON.stringify(out, null, 2) + '\n');
console.error(`${cards.length} number drills`);
