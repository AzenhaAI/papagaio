// A browsable inventory of European Portuguese verbs.
//
// The deck teaches maybe sixty verbs, which is the right number to *learn* but
// the wrong number to *look up*: you meet "abrandar" on a road sign long before
// any course would teach it. Every verb here conjugates through src/conjugate.js
// — rules where the rules hold, the irregular table where they do not — so the
// list can grow without anyone hand-writing a single form.
//
// Glosses are British English, deliberately short: this is a lookup list, not a
// dictionary article. The full article lives behind /api/card and the entry
// generator.
//
// Format: "infinitivo|gloss". Sorted on load, so entries may be added anywhere.

const RAW = `
abaixar|to lower, turn down
abandonar|to abandon, leave
abater|to slaughter; to knock down
abençoar|to bless
abrandar|to slow down, ease off
abraçar|to hug, embrace
abrir|to open
absorver|to absorb
acabar|to finish, end
aceitar|to accept
acender|to light, switch on
acertar|to get right, hit the mark
achar|to think, find
acompanhar|to accompany, go with
aconselhar|to advise
acontecer|to happen
acordar|to wake up
acreditar|to believe
acrescentar|to add
adaptar|to adapt
adiantar|to bring forward; to be of use
adiar|to postpone
adivinhar|to guess
admirar|to admire
admitir|to admit
adoecer|to fall ill
adorar|to love, adore
adormecer|to fall asleep
afastar|to move away, push aside
afirmar|to state, affirm
agarrar|to grab, hold on to
agir|to act
agradecer|to thank
aguardar|to wait for
aguentar|to bear, put up with
ajudar|to help
alcançar|to reach, achieve
alegrar|to cheer up
almoçar|to have lunch
alterar|to alter, change
alugar|to rent, hire
amar|to love
ameaçar|to threaten
analisar|to analyse
andar|to walk, go about
anotar|to jot down
antecipar|to anticipate, bring forward
anunciar|to announce, advertise
apagar|to switch off, erase
apanhar|to catch, pick up
aparecer|to appear, turn up
apertar|to tighten, squeeze
apoiar|to support
apontar|to point, note down
aprender|to learn
apresentar|to present, introduce
aproveitar|to make the most of
aproximar|to bring closer
aquecer|to heat, warm up
arranjar|to get hold of; to fix
arrepender-se|to regret
arriscar|to risk
arrumar|to tidy up
assinar|to sign
assistir|to attend, watch
assumir|to take on, assume
assustar|to frighten
atender|to answer, serve a customer
atirar|to throw
atrasar|to delay
atravessar|to cross
aumentar|to increase
avançar|to advance, move forward
avisar|to warn, let know
bater|to hit, knock
beber|to drink
beijar|to kiss
brincar|to play, joke
buscar|to fetch
cair|to fall
calar|to keep quiet
calçar|to put on shoes
cancelar|to cancel
cansar|to tire
cantar|to sing
carregar|to carry; to load; to press
casar|to marry
castigar|to punish
causar|to cause
ceder|to give way, yield
chamar|to call
chatear|to annoy, bother
chegar|to arrive
cheirar|to smell
chorar|to cry
chover|to rain
chumbar|to fail an exam
começar|to begin
comentar|to comment
comer|to eat
cometer|to commit
comparar|to compare
compensar|to make up for
competir|to compete
completar|to complete
comprar|to buy
compreender|to understand
comunicar|to communicate
conceder|to grant
concluir|to conclude, finish
concordar|to agree
conduzir|to drive; to lead
confessar|to confess
confiar|to trust
confirmar|to confirm
confundir|to confuse
conhecer|to know, be acquainted with
conquistar|to conquer, win over
conseguir|to manage, be able to
conservar|to keep, preserve
considerar|to consider
consistir|to consist
constar|to be stated, appear on
construir|to build
consultar|to consult
consumir|to consume
contar|to count; to tell
continuar|to continue
contrariar|to go against
contratar|to hire
controlar|to control
convencer|to convince
conversar|to chat
convidar|to invite
copiar|to copy
corrigir|to correct
correr|to run
cortar|to cut
costumar|to be in the habit of
crescer|to grow
criar|to create, raise
cruzar|to cross
cuidar|to look after
culpar|to blame
cumprir|to fulfil, comply with
curar|to cure
custar|to cost; to be hard
dançar|to dance
dar|to give
decidir|to decide
declarar|to declare
defender|to defend
definir|to define
deitar|to lay down; to go to bed
deixar|to leave; to let
demorar|to take time, be long
depender|to depend
descansar|to rest
descarregar|to unload, download
descer|to go down
descobrir|to discover
desconfiar|to be suspicious
descrever|to describe
desculpar|to excuse, forgive
desejar|to wish, desire
desenhar|to draw
desenvolver|to develop
desistir|to give up
desligar|to switch off, hang up
despachar|to deal with quickly
despedir|to dismiss; to say goodbye
destruir|to destroy
detestar|to hate
devolver|to give back
dever|to owe; must, ought to
dirigir|to direct, address
discutir|to argue, discuss
distinguir|to distinguish
divertir|to amuse
dividir|to divide, share
dizer|to say, tell
doer|to hurt, ache
dormir|to sleep
duvidar|to doubt
educar|to educate, bring up
eleger|to elect
elogiar|to praise
embarcar|to board
emprestar|to lend
empurrar|to push
encher|to fill
encomendar|to order
encontrar|to find, meet
enganar|to deceive
engolir|to swallow
enfrentar|to face
ensinar|to teach
entender|to understand
entrar|to enter, go in
entregar|to deliver, hand over
enviar|to send
envolver|to involve, wrap
errar|to be wrong, to err
escolher|to choose
esconder|to hide
escrever|to write
escutar|to listen
esperar|to wait; to hope
espantar|to astonish
esquecer|to forget
estabelecer|to establish
estacionar|to park
estar|to be (state, place)
estragar|to spoil, ruin
estudar|to study
evitar|to avoid
exagerar|to exaggerate
exigir|to demand
existir|to exist
explicar|to explain
exportar|to export
expressar|to express
faltar|to be missing; to miss an event
falar|to speak, talk
fazer|to do, make
fechar|to close
ferir|to wound
ferver|to boil
ficar|to stay; to become; to be located
fingir|to pretend
formar|to form, train
fornecer|to supply
fugir|to run away
fumar|to smoke
funcionar|to work, function
furar|to pierce; to jump a queue
ganhar|to win, earn
garantir|to guarantee
gastar|to spend, use up
gerir|to manage
gostar|to like
governar|to govern
gravar|to record
gritar|to shout
guardar|to keep, put away
guiar|to guide, drive
haver|there to be; to have (auxiliary)
herdar|to inherit
identificar|to identify
imaginar|to imagine
impedir|to prevent
importar|to matter; to import
incluir|to include
indicar|to indicate
influenciar|to influence
informar|to inform
insistir|to insist
instalar|to install
integrar|to integrate
interessar|to interest
interromper|to interrupt
introduzir|to introduce, insert
investir|to invest
ir|to go
jantar|to have dinner
jogar|to play a game
julgar|to judge; to reckon
juntar|to join, gather
jurar|to swear
lamentar|to regret, be sorry
lavar|to wash
legalizar|to legalise
lembrar|to remind, remember
ler|to read
levantar|to lift, raise
levar|to take, carry
libertar|to free
ligar|to switch on; to phone
limpar|to clean
livrar|to rid, free
lutar|to fight
manter|to keep, maintain
marcar|to book, mark, score
matar|to kill
medir|to measure
melhorar|to improve
mentir|to lie
merecer|to deserve
meter|to put in
misturar|to mix
molhar|to wet
morar|to live, reside
morder|to bite
morrer|to die
mostrar|to show
mudar|to change, move house
nadar|to swim
namorar|to date, go out with
nascer|to be born
navegar|to sail, browse
necessitar|to need
negar|to deny
notar|to notice
obedecer|to obey
obrigar|to force, oblige
observar|to observe
obter|to obtain
ocorrer|to occur
ocupar|to occupy
odiar|to hate
oferecer|to offer, give as a gift
olhar|to look
opor|to oppose
organizar|to organise
ouvir|to hear
pagar|to pay
parar|to stop
parecer|to seem, look like
participar|to take part
partir|to leave; to break
passar|to pass, spend time
passear|to stroll, go out
pedir|to ask for, order
pegar|to grab, catch on
pendurar|to hang up
pensar|to think
perceber|to understand, realise
perder|to lose, miss
perdoar|to forgive
perguntar|to ask a question
permitir|to allow
pertencer|to belong
pesar|to weigh
pintar|to paint
poder|can, to be able to
poupar|to save money
pousar|to put down, land
praticar|to practise
precisar|to need
preencher|to fill in a form
preferir|to prefer
pretender|to intend
preocupar|to worry
preparar|to prepare
prestar|to be of use; to render
pretender|to intend, aim
prever|to foresee
proceder|to proceed
procurar|to look for
produzir|to produce
proibir|to forbid
prometer|to promise
promover|to promote
propor|to propose
proteger|to protect
provar|to taste; to prove
publicar|to publish
puxar|to pull
qualificar|to qualify
queimar|to burn
queixar-se|to complain
querer|to want
questionar|to question
realizar|to carry out, achieve
receber|to receive
reclamar|to complain, claim
recomendar|to recommend
reconhecer|to recognise
recordar|to recall
recuperar|to recover
recusar|to refuse
reduzir|to reduce
reformar|to retire; to reform
regressar|to return
relacionar|to relate
renovar|to renew
reparar|to notice; to repair
repetir|to repeat
representar|to represent
resolver|to solve, sort out
respeitar|to respect
responder|to answer
resultar|to result
reunir|to gather, meet
rir|to laugh
roubar|to steal, rob
saber|to know a fact; to know how
sair|to go out, leave
salvar|to save, rescue
satisfazer|to satisfy
seguir|to follow
segurar|to hold
sentar|to seat
sentir|to feel
separar|to separate
ser|to be (identity, essence)
servir|to serve; to fit
significar|to mean
sobreviver|to survive
sofrer|to suffer
sonhar|to dream
sorrir|to smile
subir|to go up
suceder|to happen; to succeed to
sugerir|to suggest
sujar|to dirty
sumir|to vanish
supor|to suppose
surgir|to arise, appear
surpreender|to surprise
telefonar|to phone
temer|to fear
tentar|to try
ter|to have
terminar|to finish
tirar|to take out, remove
tocar|to touch; to play an instrument
tomar|to take, have a drink
trabalhar|to work
traduzir|to translate
trair|to betray
tratar|to treat, deal with
trazer|to bring
treinar|to train
trocar|to swap, change money
usar|to use, wear
utilizar|to use
valer|to be worth
vencer|to win; to expire
vender|to sell
ver|to see
vestir|to wear, dress
viajar|to travel
vigiar|to watch over
vir|to come
virar|to turn
visitar|to visit
viver|to live
voar|to fly
voltar|to come back, return
`;

/** Every verb, sorted for an A–Z list. */
export const VERBS = RAW.trim().split('\n')
  .map((line) => {
    const [inf, gloss] = line.split('|');
    return { inf: inf.trim(), gloss: (gloss ?? '').trim() };
  })
  .filter((v, i, a) => v.inf && a.findIndex((x) => x.inf === v.inf) === i)
  .sort((a, b) => fold(a.inf).localeCompare(fold(b.inf)));

/** Accent- and case-blind, because nobody types "começar" into a search box. */
export function fold(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Resolve what the user typed to a verb we can conjugate. Accepts the plain
 * infinitive, an accent-stripped spelling, and reflexives written either way
 * ("queixar", "queixar-se"), since the pronoun does not change the forms.
 */
export function findVerb(input) {
  const q = fold(input).replace(/-se$/, '').trim();
  if (!q) return null;
  return VERBS.find((v) => fold(v.inf).replace(/-se$/, '') === q) ?? null;
}
