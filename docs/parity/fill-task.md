# Fill missing layers

Rows {id, t (European-Portuguese headword), p (part of speech), en, pt, ru}. `ru` is already checked and correct.
For each row, fill ONLY the null fields:
- `en` null → a concise English gloss in dictionary style ("exit; way out (passage)"), same senses as ru, ≤4 senses, one sense per "; ".
- `pt` null → a short monolingual definition in European Portuguese (pt-PT spelling: facto, género, registo…), ≤4 senses separated by "; ", not just a synonym when a definition is possible. For an inflected verb form, "forma de <infinitivo>: <pessoa/tempo>" is fine.
Rules: /home/user/papagaio/build/parity/RULES.md. If you truly cannot tell what the word means, leave it null.
Output: JSON array, one {"id", "en"?, "pt"?} per row you fill (only the filled fields). Validate it parses and ids exist in the input. Use a uniquely named scratch subdirectory. Reply only: rows read, en filled, pt filled.
