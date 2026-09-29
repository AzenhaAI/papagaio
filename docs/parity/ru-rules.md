# Russian gloss rules (lean pass)

Each row: a European-Portuguese headword `t` in part of speech `p`, with its English gloss `en` and Portuguese definition `pt` (context, trustworthy human text) and the current Russian gloss `ru` (machine-written, often wrong).

Fix `ru` when it breaks any rule; otherwise leave it.
1. Correct word: it translates THIS headword (check letter by letter; beware look-alikes, false friends, confusion with a verb form or another part of speech).
2. Same part of speech as `p` (noun → nouns, verb → infinitives, adj → adjectives, adv → adverbs...).
3. Agrees with `en`/`pt`: same senses, most common first. Never drop the most common meaning.
4. One sense per "; ", synonyms of one sense joined with ", ". No repeated words across senses. At most 4 senses, under ~120 characters.
5. Plain Russian (Cyrillic), lowercase unless a proper noun, no stress marks, no Portuguese/English words, no filler like "(все значения)".
6. Brazil-only senses: mark "(браз.)" or drop.
If unsure what the word means, leave it.

Also: if `en` is null (missing), write an English gloss in the same style ("exit; way out (passage)"), matching `pt`.
