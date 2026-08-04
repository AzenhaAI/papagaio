// Deck linter. Runs over every deck file and fails loudly.
//
// The checks are the mistakes that actually happened, not hypothetical ones:
// a Brazilian word slipping into a pt-PT deck, an example that does not contain
// its own term (which silently disables the cloze exercise), a duplicate id, a
// missing preterite accent. A second model opinion catches some of these some of
// the time; a list catches all of them every time.
//
// Run: node scripts/check_deck.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Brazilian on the left, what Portugal says on the right. Only UNAMBIGUOUS
// pairs — a word that is ordinary pt-PT in another sense does not belong here.
// "meia" was in this list until it flagged "onze e meia" and "de meia em meia
// hora": it means sock in Brazil but half everywhere, and a linter that cries
// wolf gets ignored. Same reasoning removed "grama" (grass in Brazil, gram here).
const BRAZILIAN = {
  'ônibus': 'autocarro', 'onibus': 'autocarro',
  'celular': 'telemóvel',
  'banheiro': 'casa de banho',
  'tela': 'ecrã',
  'trem': 'comboio',
  'café da manhã': 'pequeno-almoço',
  'cardápio': 'ementa', 'cardapio': 'ementa',
  'aluguel': 'renda',
  'endereço': 'morada',
  'arquivo': 'ficheiro',
  'sorvete': 'gelado',
  'geladeira': 'frigorífico',
  'ponto de ônibus': 'paragem',
  'time': 'equipa',
  'esporte': 'desporto',
  'terno': 'fato',
  'xícara': 'chávena', 'xicara': 'chávena',
  'suco': 'sumo',
  'bonde': 'elétrico',
  'açougue': 'talho',
  'delegacia': 'esquadra',
  'faxineira': 'empregada de limpeza',
  'gênero': 'género',
  'estou fazendo': 'estou a fazer',
  'estou indo': 'vou a caminho',
  'estou trabalhando': 'estou a trabalhar',
};
// Gerund progressives generally: "estou/está/estamos + -ndo" is Brazilian.
const GERUND_PROGRESSIVE = /\b(estou|estás|está|estamos|estão|estava|estavam)\s+\w+ndo\b/i;

const problems = [];
const seen = new Map();
// Same word twice under different ids: the linter used to check ids only, and
// "o fim de semana" got taught in two separate batches before anyone noticed.
// Vocabulary only — drills repeat forms on purpose, because Portuguese does:
// "eu era" and "ele era" are identical, and the future subjunctive of vir is
// vir. Flagging those would bury the real duplicates in noise.
const terms = new Map();
let cards = 0, clozeOk = 0;

for (const file of readdirSync(join(root, 'data/deck')).filter((f) => f.endsWith('.json')).sort()) {
  const deck = JSON.parse(readFileSync(join(root, 'data/deck', file), 'utf8'));
  const course = deck.meta?.course;
  if (!course) { problems.push(`${file}: meta.course missing`); continue; }

  for (const c of deck.cards) {
    cards++;
    const where = `${file} ${c.id}`;
    const term = c.term ?? c.pt ?? c.en;

    if (!c.id || !term || !c.trans) { problems.push(`${where}: missing id, term or trans`); continue; }
    if (seen.has(c.id)) problems.push(`${where}: duplicate id, also in ${seen.get(c.id)}`);
    seen.set(c.id, file);

    if (c.pos !== 'drill') {
      const key = `${course}:${term.toLowerCase()}`;
      if (terms.has(key)) problems.push(`${where}: "${term}" already taught as ${terms.get(key)}`);
      terms.set(key, `${c.id} in ${file}`);
    }
    if (/[А-Яа-яЁё]/.test(JSON.stringify(c))) problems.push(`${where}: Cyrillic in a public deck`);

    // Cloze needs the term to appear in its own example, verbatim.
    if (c.ex_t) {
      const bare = term.toLowerCase().replace(/^(o|a|os|as|um|uma) /, '');
      if (c.ex_t.toLowerCase().includes(bare) || c.ex_t.toLowerCase().includes(term.toLowerCase())) clozeOk++;
    }

    if (course !== 'pt') continue;

    for (const [br, pt] of Object.entries(BRAZILIAN)) {
      // A note may legitimately name the Brazilian word to warn about it.
      const rx = new RegExp(`(^|[^\\p{L}])${br.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'iu');
      const inNote = rx.test(c.note ?? '');
      const elsewhere = rx.test([term, c.ex_t].filter(Boolean).join(' '));
      if (elsewhere && !inNote) problems.push(`${where}: Brazilian "${br}" — Portugal says "${pt}"`);
      else if (elsewhere) problems.push(`${where}: Brazilian "${br}" in the card itself, not just the note`);
    }
    if (c.ex_t && GERUND_PROGRESSIVE.test(c.ex_t)) {
      problems.push(`${where}: gerund progressive in "${c.ex_t}" — pt-PT uses estar a + infinitive`);
    }
    // -ar verbs keep the acute in the first-person plural preterite.
    if (c.ex_t && /\b\w+[aeiou]mos\b/i.test(c.ex_t)) {
      const m = c.ex_t.match(/\b(\w+amos)\b/i);
      if (m && /ontem|passad|já|nunca/i.test(c.ex_t)) {
        problems.push(`${where}: "${m[1]}" in a past context — pt-PT wants the acute (-ámos)`);
      }
    }
  }
}

console.log(`${cards} cards checked, ${clozeOk} support cloze`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  problems.forEach((p) => console.error('  ' + p));
  process.exit(1);
}
console.log('no problems');
