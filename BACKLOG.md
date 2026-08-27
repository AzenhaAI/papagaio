# Backlog

Ideas worth building, and why. Ordered by what they would change for someone
actually learning European Portuguese here — not by how novel they are.

The list below was seeded by a set of peer projects (adapted-news podcasts,
interlinear reading, a pronunciation scorer, picture flashcards, a notes-to-
cards bot). What follows is what survives contact with this product: several
of those ideas already exist here under another name, and one of them is a
better version of something we do badly.

---

## 1. A daily bulletin, graded to your level

Three minutes of Madeira and Portugal news, rewritten at A2 / B1 / B2, spoken
in a pt-PT voice, with the ten words you would not know listed underneath and
one tap to put them in your deck.

Why this one first: it is the only idea here that produces a reason to open the
app on a day when you do not feel like studying. Everything else in the product
waits for you to arrive; this arrives at you, and it is news you actually need —
a strike, a road closed, a levada shut, an AIMA rule changed.

We already have every part: the voice, the level model, the reader's
unknown-word detection, the scheduler. What is missing is a source feed and a
nightly job to grade it. Peer projects do this for Spanish and hold ~100 daily
listeners with no code and no marketing, which says the format works.

Cost: a nightly Worker cron, a summariser prompt per level, TTS, and a page
plus a bot broadcast. Days, not weeks.

## 2. Reading a real book with the translation above the line

The Ilya Frank method: original text, gloss inline, no dictionary trips. Our
reader already translates on tap and collects unknown words — the missing half
is a library of texts worth reading and a parallel view that does not make you
tap at all.

Public-domain Portuguese is thin next to French or English, but Eça de Queirós,
Camilo Castelo Branco and the Madeiran chroniclers are there, and a graded
retelling of a chapter is something we can generate rather than find.

Cost: a text library (storage, not cleverness), a reading view with inline
gloss, and the same collect button we already ship.

## 3. Sentence-level pronunciation, not word-level

Today the app checks a single word: you say it, Whisper transcribes, it matches
or it does not. A peer project generates sentences from any text you give it,
reads them aloud, listens back and scores — which is the exercise that actually
transfers to speaking, because the hard part of Portuguese is what happens
between words, not inside them.

We have the pieces (TTS, Whisper, the deck). What we lack is a scoring model
kinder than string equality: word-level alignment, so "you dropped the final
vowel in _mesmo_" is possible instead of a flat wrong.

## 4. A picture on the card, for the concrete nouns

Words for things stick to images. Not for verbs, not for abstractions, not for
grammar — for the bread, the sink, the plug, the receipt. A picture per card is
a strong memory hook and a weak one everywhere else, so this is a filtered
feature: nouns with a physical referent only, drawn from an openly licensed
source rather than generated, and never blocking the card if the image is
missing.

## 5. Right-click "add to deck" in the browser

The extension already translates a selection; a peer project's whole product is
the right-click that files the word away. Ours has the translation panel — the
missing tap is the one that says "and keep it". It needs the extension bound to
the learner's account, which is the pairing code the bot already issues.

## 6. Word and phrase pages, for search

A peer project pulls 1,500 visitors a month from search with pages about one
character each. Every phrase in our phrasebook is a page someone is typing into
Google right now — "how do you say sorry in European Portuguese", "autocarro or
ônibus" — and we have 149 of them plus 1,000 words with real examples and
audio, sitting behind a search box that Google cannot use.

Cost: a page generator over the existing deck, the same shape as the trail
pages on the other site.

---

## Deliberately not doing

**Subscriptions, paywalls, a free tier that runs out.** The peer with the most
revenue in that list says plainly that the money came from onboarding, pricing
and paywall work rather than from the product. That is true, and it is the
reason not to: this exists so that someone who has just moved here and is
paying for everything else does not also pay to be understood at the pharmacy.

**Streaks and shame mechanics.** They work. They are also why people quit.

**Mnemonic tags aimed at Russian speakers.** One peer builds this and it is a
good idea for a Russian-language product. Here it would push the interface
towards a language this app has decided is the exception, not the default.

---

## Waiting on review, and what goes into 1.0.1

Build 3 has been in the queue since 20 August; build 4 is uploaded and cannot
replace it — Apple locks the build to the submission, and swapping means
cancelling and starting the queue again. So build 4 becomes 1.0.1, submitted
the moment the current one is decided either way.

Already in build 4: the system default translator, the Safari extension, island
news, the phrasebook, hand-written cards, the starting level, text size, the
coach reading your own line back, voice sent on release.

Everything shipped from here until that verdict lands is 1.0.1 too — the
server-side half reaches people the day it deploys regardless, which is why
waiting costs so little.
