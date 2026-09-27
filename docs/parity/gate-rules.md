# Parity pilot — gloss rules (the quality gate)

Each row is one Portuguese (pt-PT) headword in one part of speech. It carries three layers:

- `en` — English gloss (translation equivalents).
- `ru` — Russian gloss (translation equivalents).
- `pt` — Portuguese monolingual definition.

Rows sharing a term but differing in `pos` are DIFFERENT entries: gloss only this part of speech.

## Rules for every layer
1. **One sense per semicolon.** Senses are separated by `; `. Synonyms of the SAME sense go
   together, separated by `, `. Never repeat a word or near-duplicate across senses.
2. **Part of speech matches the headword.** noun → nouns, verb → infinitives, adj → adjectives,
   adv → adverbs, etc. No verb gloss on a noun, no adjective mixed into a noun gloss, no adverb for an adjective.
3. **No padding.** No collocations or phrases posing as senses (e.g. `полностью; полностью согласен;
   полностью уверен` → `полностью`), no filler like "a type of", no invented senses.
4. **European Portuguese.** Senses that exist only in Brazil are either dropped or explicitly marked:
   `(Brazil)` in en, `(браз.)` in ru, `(Brasil)` in pt. Never present them as the pt-PT meaning.
5. **Most important senses first, at most 4 senses.** Rare/archaic/specialist senses only if the word
   has nothing more common. A short clarifier in parentheses is fine: `bug (hidden listening device)`.
6. **Correct word.** Check the headword letter by letter (forçado ≠ forcado). Accents matter.
7. Abbreviations: gloss what the abbreviation stands for / means, not a guess.
8. Proper nouns: give the standard equivalent name.

## Layer-specific
- **ru**: plain Russian, NO stress marks (strip ◌́ and ё is fine). Lowercase unless a proper noun.
  1–4 senses, each 1–3 words (+ optional short parenthetical). Keep under ~120 characters.
- **en**: concise English equivalents, same style: `exit; way out (passage)`. Under ~200 characters.
  Existing en glosses come from Wiktionary (human-written): keep them unless they break a rule.
  Trimming an over-long en gloss to its main senses is a valid fix.
- **pt**: a short monolingual definition in European Portuguese orthography (pt-PT: `anónimo`,
  `facto`, `receção`, not Brazilian `anônimo`, `fato` (=facto), `recepção`). Senses separated by `; `,
  at most 4, under ~300 characters. Do not just repeat the headword or give a synonym alone when a
  definition is possible. Existing pt definitions come from Wiktionary: keep them unless they break a rule.

## Never overwrite good data with worse
If the current value is acceptable, it stays. A rewrite must be clearly better, never merely different.
When unsure what a word means, leave it (verdict ok) rather than guess.
