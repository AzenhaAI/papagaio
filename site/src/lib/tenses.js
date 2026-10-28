// Tense notes shared by the verbs page and the dictionary: what each tense
// is for, the words that call for it, how English says it, the classic trap,
// and the verb's own example from /api/conjugate.
//
// The Portuguese stays Portuguese whatever the interface; the English half of
// each line goes through t(), and a Russian interface reads the example's
// Russian translation instead of the English one.

import { ui, t } from './i18n.js';

// What each tense is *for*, the way teachers in Portugal head a worksheet
// ("Imperfeito do Indicativo – hábitos e descrição no passado"). Same tables as
// the app's verbs page.
export const PURPOSE = {
  presente: ['rotina e factos gerais', 'routine and general facts'],
  pps: ['ação concluída', 'a finished action'],
  imperfeito: ['hábitos e descrição no passado', 'habits and description in the past'],
  ppc: ['ação repetida até agora', 'an action repeated up to now'],
  mais_que_perfeito: ['ação anterior a outra no passado', 'an action before another past one'],
  imperfeito_conj: ['hipóteses e desejos', 'hypotheses and wishes'],
  presente_conj: ['desejo, dúvida e emoção', 'wish, doubt and emotion'],
  condicional: ['pedidos delicados e hipóteses', 'polite requests and hypotheticals'],
  imperativo: ['instruções', 'instructions'],
  futuro_prox: ['planos e intenções', 'plans and intentions'],
  futuro: ['previsões e promessas', 'predictions and promises'],
  futuro_conj: ['condição no futuro', 'a condition in the future'],
};

// The words that call for each tense: hear "ontem" and the PPS follows.
export const MARKERS = {
  presente: 'normalmente, todos os dias, ao sábado, às vezes',
  pps: 'ontem, no fim de semana, no ano passado, há dois dias',
  imperfeito: 'antigamente, quando era criança, sempre, todos os verões',
  ppc: 'ultimamente, nas últimas semanas, este mês',
  mais_que_perfeito: 'já, ainda não, quando cheguei, antes de',
  imperfeito_conj: 'se, como se, oxalá, queria que',
  presente_conj: 'espero que, talvez, quero que, é importante que',
  condicional: 'se fosse, no teu lugar, gostaria de',
  imperativo: 'por favor, agora, não…',
  futuro_prox: 'amanhã, para a semana, logo, daqui a pouco',
  futuro: 'um dia, no futuro, daqui a dez anos',
  futuro_conj: 'quando, se, assim que, logo que, enquanto',
};

// How English says the tense, on "go"; a verb with its own example
// sentence brings its own pattern ("I went · I have gone").
export const ENGLISH = {
  presente: 'I go',
  pps: 'I went · I have gone',
  imperfeito: 'I used to go · I was going',
  ppc: 'I have been going (lately)',
  mais_que_perfeito: 'I had gone',
  imperfeito_conj: 'if I went…',
  presente_conj: 'that I go',
  condicional: 'I would go',
  imperativo: 'Go!',
  futuro_prox: "I'm going to go",
  futuro: 'I will go',
  futuro_conj: 'when I go…',
};

// The classic English-speaker mistake: the two past tenses split the
// English present perfect.
// Filled with the verb's own forms: {pps} and {ppc} are its "eu" forms, {en}
// the English perfect ("I have done").
export const TRAP = {
  pps: "English '{en}' is {pps} here, not {ppc}",
  ppc: '{ppc} = repeatedly up to now, not the English present perfect',
};

const trapLine = (k, e, conj) => {
  const pps = conj?.pps?.[0], ppc = conj?.ppc?.[0];
  if (!TRAP[k] || !pps || !ppc) return '';
  const parts = String(e?.en_form ?? '').split('·');
  const en = k === 'pps' && parts.length > 1 ? parts.pop().trim() : 'I have …';
  return t(TRAP[k]).replace('{en}', en).replace('{pps}', pps).replace('{ppc}', ppc);
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Above the table: what the tense is for, then (after the caller's "when"
// line) its marker words.
export const tensePurpose = (k) => PURPOSE[k]
  ? `<div style="font-size:13.5px;"><strong>${PURPOSE[k][0]}</strong>
    <span class="muted"> — ${esc(t(PURPOSE[k][1]))}</span></div>` : '';
export const tenseMarkers = (k) => MARKERS[k]
  ? `<div class="muted" style="font-size:12.5px;">${esc(t('Markers:'))}
    <em style="color:var(--text);">${MARKERS[k]}</em></div>` : '';

// Under the table: the English pattern, the trap, and this verb's own
// sentence with its translation.
export const tenseNotes = (k, e, { sound = true, conj } = {}) => {
  const en = e?.en_form || ENGLISH[k];
  let h = '';
  if (en) h += `<div class="muted" style="font-size:12.5px; margin-top:6px;">${esc(t('In English:'))}
    <span style="color:var(--text);">${esc(en)}</span></div>`;
  const trap = trapLine(k, e, conj);
  if (trap) h += `<div style="font-size:12.5px; color:var(--warn); margin-top:2px;">${esc(trap)}</div>`;
  const tr = (ui() === 'ru' && e?.ru) || e?.en;
  if (e?.pt) h += `<div style="margin-top:6px; display:flex; gap:6px; align-items:flex-start;">
    <div><div style="font-size:14.5px; font-style:italic;">${esc(e.pt)}</div>
    ${tr ? `<div class="muted" style="font-size:12.5px;">${esc(tr)}</div>` : ''}</div>
    ${sound ? `<button class="say" data-say="${esc(e.pt)}"
      style="background:none; border:0; cursor:pointer; font-size:13px; opacity:.6;">🔊</button>` : ''}</div>`;
  return h;
};
