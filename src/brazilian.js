// Tatoeba's Portuguese is half Brazilian. A learner of pt-PT should not meet
// "Você fala." under falar or "Me ajude" under ajudar, so every place that
// shows a sentence (dictionary, practice, the bot, the word pages built by
// scripts/export_word_pages.mjs) asks this module first. One list, so the
// site and the app never disagree about the same sentence.
//
// Word edges by letter, not \b: in JavaScript \b is ASCII-only, so "\bônibus"
// never matched anything.

// Brazil-only words and the Brazilian progressive (está fazendo; Portugal
// says está a fazer).
const BR_WORDS = /(?<!\p{L})(?:ônibus|trem|celular|banheiro|café da manhã|geladeira|xícara|tela|time de|moça|garoto|bonde|aeromoça|você|vocês|cadê|pra|tá|tô|equipe|fato|me dá|em um|em uma|a gente)(?!\p{L})|(?<!\p{L})(?:estou|está|estás|estamos|estão|estava|estavam|estive|esteve|fico|fica|ficou|ficava|ficamos|continua|continuo|continuou|anda|ando|andava)\s+\p{L}+(?:ando|endo|indo)(?!\p{L})/iu;

// Pronoun placement pt-PT does not use: a weak pronoun opening the sentence
// or a clause after a comma ("Me ajude", "Por favor, me ajude"), or right
// after a bare subject at the start ("Eu te amo", "Tom se mudou", "Eu o vi").
// Portugal says ajude-me, amo-te, mudou-se, vi-o. Only me/te/lhe at a clause
// start: there "se" is "if" and "nos" is "in the", and "se faz favor" is the
// Portuguese phrase itself, though "Nos vemos" (vemo-nos) is caught by its
// -mos verb. After não/nunca the pronoun goes first in
// Portugal too, so those stay.
const BR_CLITIC = /(?:^|[,;:—]\s*)(?:me|te|lhes?)\s+\p{L}|^(?:(?:o|a)\s+)?(?:eu|tu|ele|ela|eles|elas|nós|tom|mary|maria|john|joão)\s+(?:me|te|lhes?|se|nos)\s+(?!(?:não|nunca)(?!\p{L}))\p{L}|^(?:eu|tu|ele|ela|nós|eles|elas)\s+(?:o|a|os|as)\s+\p{L}|^nos\s+\p{L}+mos(?!\p{L})/iu;

/** True when a Portuguese sentence reads as Brazilian. */
export const isBrazilian = (s) => BR_WORDS.test(s ?? '') || BR_CLITIC.test(s ?? '');

/** A name without its article ("Tom viu"; Portugal says "O Tom viu") is
 *  Tatoeba's Brazilian habit too, but far too common to drop: such lines go
 *  after the others instead. */
export const bareName = (s) => (/^(?:Tom|Mary|John|Maria|João)\s/.test(s ?? '') ? 1 : 0);
