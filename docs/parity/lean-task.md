# Lean edit task (all three layers)

Standard: /home/user/papagaio/build/parity/RULES.md (read it). Summary of priorities:
- `ru` is machine-written and often wrong: check every row carefully (correct word, part of speech, agrees with en/pt, no repeats, ≤4 senses, plain Cyrillic, no stress marks). Never drop the most common meaning.
- `en` (English) and `pt` (Portuguese definition) are human-written (Wiktionary): change them ONLY for a clear rule violation — repeated/near-duplicate senses, more than 4 senses, truncated/garbled text, stray colons, wrong part of speech, a sense of a different word, Brazilian spelling in pt (pt-PT: facto, género, anónimo, registo…), unmarked Brazil-only sense.
- `en: null` → write an English gloss (same style: "exit; way out (passage)") matching pt/ru.
- The three layers must agree on the senses of this headword in this part of speech. When unsure, leave it.

Input rows: {id, t (headword), p (part of speech), en, pt, ru}.
Output: a JSON array with ONE object per CHANGED row only: {"id": "...", "en"?: "...", "ru"?: "...", "pt"?: "..."} — include only the fields you change, each as the full new value. Unchanged rows are omitted.
Work in chunks of ~300 rows (e.g. read with node, slice, write partial outputs, then merge) so no single write is huge. Write the final merged array to the output path, then validate that it parses and every id exists in the input.
Reply with only: rows read, rows changed, and changed counts per layer.
