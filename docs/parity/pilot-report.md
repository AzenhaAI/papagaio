# Dictionary parity — phase 0 pilot report (2026-09-27)

Pilot of `docs/cloud-dictionary-parity.md`: 500 headwords from the top 20,000,
all three layers filled where missing and gated, passing values written back to
D1 under run tag `parity-pilot-2026-09-27` (rollback:
`node scripts/parity_writeback.mjs --rollback parity-pilot-2026-09-27`).

## Sample

- "Top 20,000" = the first 20,000 distinct `lex:`/`lexpt:` terms by `freq`
  (cutoff freq ≤ 73,360; ranks are sparse, so `freq < 20000` covers only 8,555 terms).
- Every 40th of those (ranks 20, 60, …, 19,980) → 500 terms → **584 rows** (476 `lex:`, 108 `lexpt:`).
- Gaps found: English missing on all 108 `lexpt:` rows; `def_pt` missing on 36 `lex:` rows (7.6%); Russian present everywhere.

## Pipeline

1. **Edit** — 10 Sonnet agents × ~59 rows: keep or replace each layer against `docs/parity/gate-rules.md`, fill the missing ones.
2. **Gate** — 6 independent Sonnet agents × ~146 proposals: accept/reject only, no rewriting.
3. **Lint** — mechanical: stress marks, >4 senses, duplicate senses, length, stray semicolons, mixed Latin/Cyrillic words.
4. **Write-back** — `scripts/parity_writeback.mjs`: guarded UPDATEs (`col IS old`) + one `gloss_history` row per column change.

## Results

| layer | kept | rewrites proposed | fills proposed | gate-rejected | written |
|---|---|---|---|---|---|
| Russian (`trans_ru`) | 186 (32%) | 398 (68%) | 0 | 6 | 392 |
| English (`trans` / new `trans_en`) | 369 | 107 | 108 | 3 | 212 |
| Portuguese def (`def_pt`) | 325 | 223 | 36 | 1 | 258 |
| **total** | | 728 | 144 | **10 (1.1%)** | **862** |

`gloss_history`: trans_ru 392, def_pt 258, trans 144 (104 EN on `lex:` + 40 `lexpt:` display defs), trans_en 108, fold 17.

The Russian layer confirmed the brief: 68% of the pilot's Russian glosses broke a rule. Most common: leftover stress marks, verbatim repeats (`полностью; полностью; полностью`), wrong words from look-alikes (bodo→«козёл» from *bode*, bagos→«сумки» from *bags*, veio (noun)→«пришёл»), part-of-speech mix-ups.

## Cost and time

| | |
|---|---|
| Wall time | 27 min (15:33:52 → 16:01 UTC): setup 3.5, edit 9.6, gate 10.3, write-back 1.4 |
| Sonnet tokens (16 subagents) | 1,914,367 total (edit 1.06M, gate 0.85M) ≈ **3.8k tokens per headword**, all three layers |
| Sonnet 5 at API list price ($2 in / $10 out per MTok) | ≈ $5–8 for the pilot (input/output split not reported per agent, so a range) |
| Cloudflare | $0: no Workers AI; D1 free tier |
| D1 rows read | ≈ 37k (28.8k finding the top-20k cutoff, 1.7k fetching the 584 rows, 6.6k write-back guards) |
| D1 rows written | 3,714 (1,724 statements; D1 counts index updates too) |

## Findings that change the plan

- **The Portuguese-definition gap is much smaller than the brief says.** Live code keeps the pt definition of `lex:` rows in `def_pt` (read by `src/api.js:476`), not `trans_pt` (which is the EN→PT gloss of `lexen:` rows). Only 7.6% of pilot `lex:` rows lack `def_pt`; extrapolated ≈ 4.8k rows, not 33,267. The pilot wrote to `def_pt`; the brief's "trans_pt" should read `def_pt`.
- **The gate is lenient (98.9% pass).** The 60-row random sample reads well, but one editor+one gate on the same model and rules share blind spots; e.g. `lexpt:AAA` kept its Russian «высший рейтинг» while its new English leads with anti-aircraft artillery. For phase 2 either add a cheaper second-opinion pass on a 10% sample, or tell the gate to check cross-layer consistency explicitly.
- `lexpt:` English is a structural gap (100% of those rows): phase 3 ≈ all 46k `lexpt:` rows.
- `fold` follows the `term trans` convention on only 17 of the 144 rows whose `trans` changed; the rest were left as they were.

## Extrapolation (same pipeline, Sonnet 5, API list price)

| phase | work | Sonnet tokens | ≈ $ | wall time @16 agents | D1 reads |
|---|---|---|---|---|---|
| 1 export + pack | page `cards` + `ru_forms` by rowid | 0 | 0 | ~5 min | ~250k (under the 1M budget) |
| 2 gate top 20k | 20k headwords × 3 layers | ~76M | $200–300 | ~15 h (≈4 h @60 agents) | ~300k |
| 3 fill EN | ~42k `lexpt:` rows outside top 20k, 1 layer + gate | ~55M | $150–220 | ~11 h | ~250k |
| 4 fill PT def | ~4k rows (not 33k, see above) | ~5M | $15–20 | ~1 h | ~30k |
| 5 gate long tail | ~81k headwords, Russian only (≈1/2 per-headword cost) | ~155M | $400–600 | ~30 h | ~500k |

Wall time scales with parallel agents; spread D1 reads across days to stay under the 5M/day limit shared with users.
Cheaper option for phases 3–5: generate with Workers AI (llama-3.3-70b, fractions of a cent) and keep only the Sonnet gate, roughly halving token spend.

## Samples

### Russian — 20 random accepted rewrites

| headword | before | after | reason |
|---|---|---|---|
| abadia (noun) | абба́тство | аббатство | stress marks |
| MA (abbrev) | Мать | (браз.) аббревиатура штата Мараньян | wrong word |
| coerente (adj) | свя́зный (последовательный, логически стройный); непротиворечи́вый; когере́нтный | связный (последовательный, логически стройный); непротиворечивый; когерентный | stress marks |
| constatação (noun) | свидетельство | констатация, установление факта; подтверждение, доказательство | missing senses |
| quatro (noun) | четы́ре (число между 3 и 5) | четыре (число между 3 и 5) | stress marks |
| dividiram (verb) | разделить (математика, экономика); разделить (политика, социум) | разделили; поделили | duplicate: разделить repeated with redundant domain tags |
| mal (adv) | плохо (некорректно); только (только) | плохо (некорректно); едва, еле (едва-едва) | duplicate/wrong word |
| radicalmente (adv) | полностью; полностью; полностью | радикально; полностью | word repeated 3x verbatim (padding, same as RULES.md example) |
| restaurante (adj) | рестора́н | восстанавливающий; реставрирующий | pos: noun gloss on adjective |
| clímax (noun) | кульминация; кульминационный момент; кульминация (в романе) | кульминация | duplicate |
| matagal (noun) | долго | заросли, чаща | wrong word |
| talvez (noun) | возможно; может быть | сомнение; возможность | pos: adverb gloss on noun |
| assassínio (noun) | убийство; убийца; грабеж | убийство | wrong word |
| nivelado (adj) | сглаженный; ровный; гладкий (геометрия) | выровненный, ровный | wrong word |
| benzeno (noun) | бензо́л | бензол | padding |
| lírico (adj) | лири́ческий (связанный, соотносящийся по значению с существительным…) | лирический (связанный с лирикой, поэтический, эмоционально приподнятый) | stress mark/truncated |
| bastaram (verb) | достаточно (наречие); пора (время) | хватило; было достаточно | wrong word |
| trio (noun) | три́о | трио | stress marks |
| áudio (noun) | звук (аудио); звук (медиа) | звук; аудиосообщение; аудиотехника | duplicate |
| prolongar (verb) | продлевать; затягивать; отсрочивать | продлевать; затягивать | imprecise word (отсрочивать = to postpone, not prolong) |

### English — 20 random accepted rewrites

| headword | before | after | reason |
|---|---|---|---|
| auditório (noun) | auditorium (a large room for public meetings or performances); auditory (an audience of a hearing) | auditorium; audience | wrong word |
| velha (noun) | mother; wife, especially a middle-aged or elderly one; a tie in a tic-tac-toe game | old woman; mother (informal); wife, especially an elderly one (informal); draw, tie in tic-tac-toe (Brazil) | missing primary sense |
| delfina (noun) | ∅ | female dolphin | missing |
| isolante (adj) | which isolates, cuts off from others; which insulates, prevents electrical contact; isolating | isolating, insulating (that isolates or cuts off contact, e.g. electrical, thermal, acoustic) | duplicate |
| desgraçado (verb) | ∅ | past participle of desgraçar | missing |
| pauzinhos (noun) | ∅ | chopsticks | missing |
| brega (adj) | tacky; kitschy; in poor taste | tacky, kitschy, in poor taste | duplicate |
| activa (noun) | ∅ | active voice (grammar) | missing |
| disparatar (verb) | ∅ | to talk nonsense, blunder (say or do something senseless); to insult, hurl abuse | missing |
| assentado (adj) | ∅ | seated; settled, established; founded (on) | missing |
| internet (noun) | internet (an internet connection, internet connectivity, access to the internet.) | internet; internet connection, access to the internet | padding |
| solicitado (adj) | ∅ | requested; in demand, busy | missing |
| brega (noun) | fight; the work done by a bullfighter; a subgenre of Brazilian popular music that originated in the 1970s, often with romantic lyrics about love and infidelity | fight; the work done by a bullfighter; brega (Brazilian pop music genre with romantic lyrics, Brazil) | brazil-only sense |
| lapso (adj) | ∅ | lapsed, expired; fallen, decayed; having erred, at fault | missing |
| prefeito (noun) | prefect; mayor | prefect (Roman civil administrator, or French civil magistrate); mayor (Brazil) | Brazil-only sense (mayor) presented unmarked as the pt-PT meaning |
| hierarquia (noun) | hierarchy (orderly distribution of civil, military or ecclesiastical powers); hierarchy, ranking (orderly classification, within any group or corporation, usually according to power, authority, or function); subordination (service relationship in which the superior has the power of direction, and th | hierarchy (system of ranked authority within a group or organization); subordination (relationship of being under another's authority) | over length (truncated) |
| recíproco (adj) | reciprocal (done by each of two people towards the other); which is obtained by dividing 1 by the number; reciprocal | reciprocal (done by each of two people towards the other); reciprocal (the multiplicative inverse of a number, obtained by dividing 1 by it) | word 'reciprocal' repeated bare as a trailing duplicate sense |
| rebuçado (noun) | candy (piece of sweet confectionery); something said or done with excessive care | candy, sweet (piece of confectionery); a person wearing a hood or cloak | second sense didn't match the pt definition (pessoa embuçada) |
| bourbon (noun) | ∅ | bourbon (type of American whiskey) | missing |
| magestade (noun) | ∅ | majesty; grandeur (archaic spelling of majestade) | missing |

### Portuguese definition — 20 random accepted rewrites

| headword | before | after | reason |
|---|---|---|---|
| confronto (noun) | enfrentamento;; comparação. | enfrentamento; comparação | padding: double semicolons/typo |
| almirantado (noun) | ∅ | cargo ou dignidade de almirante; jurisdição ou repartição que trata dos assuntos navais | missing |
| ceder (verb) | desistir de um direito (a favor de outrem); deixar de forma espontânea para que alguém utilize; renunciar a; não usar | desistir de um direito ou bem a favor de outrem, renunciando a ele; deixar de forma espontânea que alguém utilize algo | padding |
| supositório (noun) | ∅ | medicamento sólido, de forma cónica ou ovoide, que se introduz no ânus ou na vagina para se dissolver | missing |
| espécimen (noun) | indivíduo de uma certa espécie ou mostra de material que ilustra de forma especialmente destaca as características de seu gênero; item tomado para análise | indivíduo de determinada espécie, ou amostra que ilustra de forma clara as características do seu género; item recolhido para análise | pt-BR spelling (gênero) and grammar error (forma especialmente destaca) |
| dragão (noun) | monstro mitológico baseado em uma serpente ou lagarto, alado e que expele fogo pela boca; elemento heráldico representado por um dragão¹; designação do soldado das unidades militares introduzidas nos exércitos europeus do século XVII; peixe teleósteo da família dos gobiídeos, originário do continente americano (Gobioides braussonnetti) | monstro mitológico alado que expele fogo pela boca; elemento heráldico que representa esse monstro; soldado de cavalaria que combatia a pé, comum nos exércitos europeus do séc. XVII; peixe teleósteo da família dos gobiídeos | over length: definition exceeds the ~300 character limit |
| galar (verb) | fecundar (quando se fala de galináceos); olhar de forma insistente e interessada para algo ou alguém; cortejar, seduzir; ter relações sexuais; copular | fecundar (aves domésticas); olhar de forma insistente e interessada por alguém; cortejar, seduzir; ter relações sexuais, copular | duplicate |
| descarga (noun) | tiro de arma de fogo; evacuação; desobrigação; reservatório colocado nas latrinas que, depois de se acionar um mecanismo de descarga, sai água para as lavar | tiro de arma de fogo; evacuação; desobrigação; ato de libertar água para limpar a sanita (autoclismo) | wrong word: defined the tank, not the act |
| laguna (noun) | ∅ | lago de água salgada ou salobra, separado do mar por um cordão de areia ou recife | missing |
| estiveram (verb) | estavam, verbo no pretérito | terceira pessoa do plural do pretérito perfeito ou mais-que-perfeito do indicativo de estar | wrong tense: 'estavam' is imperfect, but estiveram is the preterite/pluperfect form |
| liberto (adj) | livre; que está em liberdade | livre, que está em liberdade; que ultrapassou convenções, preconceitos ou padrões estabelecidos | duplicate |
| conivente (adj) | que se omite diante da prática de um fato negativo; conluiado; cúmplice; que se aproxima ou se toca sem se fundir (diz-se de estrutura); que se aproxima pelo ápice, sem se fundir (diz-se de peça floral) | que se omite perante um facto negativo; conluiado, cúmplice; que se aproxima ou se toca sem se fundir (diz-se de estrutura ou de peça floral) | pt-BR spelling (fato→facto) + too many senses |
| debruçado (adj) | ∅ | que está inclinado ou apoiado sobre algo, debruçando-se | missing |
| aromaterapia (noun) | ∅ | terapia que usa óleos essenciais e fragrâncias para promover o bem-estar físico e psicológico | missing |
| calmamente (adv) | de modo calmo; que está em calmaria; quente; calmoso; sossegado; tranquilo | de modo calmo, sossegado ou tranquilo | pos: adjectives mixed into adverb gloss |
| cerca (adv) | perto, nas proximidades, na cercania | perto, nas proximidades (usado apenas em 'cerca de') | wrong word |
| áudio (noun) | técnica para o registro, reprodução e transmissão do som | técnica para o registo, reprodução e transmissão do som | pt-BR spelling |
| sinistro (noun) | acontecimento que causa dano, perda, sofrimento ou morte; acidente, desastre; prejuízo material de grande monta; dano; qualquer dano havido em bem colocado no seguro | acontecimento que causa dano, perda, sofrimento ou morte; prejuízo material de grande monta; dano coberto por um seguro | duplicate |
| diabrete (noun) | pequena criatura sobrenatural, semelhante a um demônio; criança bagunceira | pequena criatura sobrenatural, semelhante a um demónio; criança bagunceira | pt-BR spelling (demônio→demónio) |
| tolo (noun) | templo circular; sem inteligência ou sem juízo; ingênuo, simplório; tonto, parvo, idiota, pateta, bobo | pessoa com pouca inteligência ou juízo; pessoa ingénua, simplória | wrong word |

### All 10 gate rejections

| headword | layer | proposed | gate reason |
|---|---|---|---|
| abadia (noun) | en | abbey | Uncertain that "abbeystead" is wrong/non-standard rather than a distinct sense (the abbatial residence, matching pt residência canónica); dropping it may lose a correct sense. When unsure, keep old. |
| apego (noun) | ru | привязанность; любовь | Adds "любовь" (love), which overstates apego (attachment/fondness); pt definition only supports ligação afetiva/estima/afeição, not full romantic love. Risk of a misleading gloss. |
| berrar (verb) | en | to yell, scream, bellow (loudly or angrily); to weep loudly, bawl | Drops a distinct, rule-compliant Wiktionary sense ("to play a blowing horn (berrante)") that was not a duplicate and did not push the gloss over the 4-sense limit; removal is not required by any rule and is not clearly better, just different. |
| ceder (verb) | ru | уступать, отдавать; соглашаться (em disputa) | Portuguese text 'em disputa' left un-translated inside the Russian gloss's parenthetical (ru must be plain Russian); should read something like '(в споре)'. |
| cerca (adv) | ru | только, лишь (в сочетании с 'cerca de') | 'только, лишь' (only, merely) is the wrong meaning for this sense of 'cerca' (which means 'about, approximately/near', per its own pt definition 'perto, nas proximidades'); the en sibling proposal fixed this correctly to 'about, approximately' but this ru proposal keeps the mistranslation, just deduplicated. |
| dissolver (verb) | ru | растворить (в жидкости); расформировать (организацию, parламент); расторгнуть (договор) | garbled text: 'parламент' mixes Latin letters into a Cyrillic word (should be 'парламент'); typo would ship to live DB |
| histeria (noun) | ru | истерия, истеричность | merges two distinct pt senses ("doença nervosa" vs "índole desequilibrada ou caprichosa") into one comma-joined sense (истерия, истеричность) as if synonyms, violating one-sense-per-semicolon |
| legista (adj) | en | forensic (relating to the medical examiner); versed in law, jurisprudent | retains the old flagged-wrong "versed in law, jurisprudent" sense; this entrys own pt definition ("referente ao médico legista ou ao legismo") supports only the forensic/medical-examiner sense |
| presídio (noun) | pt | ato de defender uma praça de guerra ou fortaleza; guarnição militar encarregada dessa defesa; comando militar de uma província; (Brasil) estabelecimento penitenciário, prisão | adds an unsupported/likely invented sense ('comando militar de uma província') not grounded in the row's context or in the sibling en/ru proposals for the same headword; risks shipping a fabricated sense. |
| renderam (verb) | ru | сдались; принесли доход; сменили (караул) | 'сдались' (reflexive 'they surrendered themselves') likely mismatches the transitive/absolute use of 'renderam'; 'принесли доход' and 'сменили (караул)' are added senses not grounded in this row's own context (pt only says 'expressa ação de entregar'). |
