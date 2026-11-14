/**
 * Common irregular English verbs, so a selected past form ("seen", "went") can say which verb it
 * comes from. The online dictionary doesn't say, and answers some forms badly ("been" as a plural of
 * "bee", nothing for "was").
 *
 * Each line: base, past simple, past participle; "/" separates alternatives (British spellings too)
 */
const IRREGULAR_VERBS = `
arise arose arisen
awake awoke awoken
be was/were been
bear bore borne/born
beat beat beaten
become became become
begin began begun
bend bent bent
bet bet bet
bind bound bound
bite bit bitten
bleed bled bled
blow blew blown
break broke broken
breed bred bred
bring brought brought
broadcast broadcast broadcast
build built built
burn burnt/burned burnt/burned
burst burst burst
buy bought bought
catch caught caught
choose chose chosen
cling clung clung
come came come
cost cost cost
creep crept crept
cut cut cut
deal dealt dealt
dig dug dug
do did done
draw drew drawn
dream dreamt/dreamed dreamt/dreamed
drink drank drunk
drive drove driven
eat ate eaten
fall fell fallen
feed fed fed
feel felt felt
fight fought fought
find found found
flee fled fled
fling flung flung
fly flew flown
forbid forbade forbidden
forecast forecast forecast
forget forgot forgotten
forgive forgave forgiven
freeze froze frozen
get got got/gotten
give gave given
go went gone
grind ground ground
grow grew grown
hang hung hung
have had had
hear heard heard
hide hid hidden
hit hit hit
hold held held
hurt hurt hurt
keep kept kept
kneel knelt knelt
know knew known
lay laid laid
lead led led
lean leant/leaned leant/leaned
leap leapt/leaped leapt/leaped
learn learnt/learned learnt/learned
leave left left
lend lent lent
let let let
lie lay lain
light lit lit
lose lost lost
make made made
mean meant meant
meet met met
mistake mistook mistaken
overcome overcame overcome
pay paid paid
prove proved proven
put put put
quit quit quit
read read read
ride rode ridden
ring rang rung
rise rose risen
run ran run
say said said
see saw seen
seek sought sought
sell sold sold
send sent sent
set set set
sew sewed sewn
shake shook shaken
shine shone shone
shoot shot shot
show showed shown
shrink shrank shrunk
shut shut shut
sing sang sung
sink sank sunk
sit sat sat
sleep slept slept
slide slid slid
smell smelt/smelled smelt/smelled
speak spoke spoken
speed sped sped
spell spelt/spelled spelt/spelled
spend spent spent
spill spilt/spilled spilt/spilled
spin spun spun
spit spat spat
split split split
spoil spoilt/spoiled spoilt/spoiled
spread spread spread
spring sprang sprung
stand stood stood
steal stole stolen
stick stuck stuck
sting stung stung
stink stank stunk
stride strode stridden
strike struck struck
string strung strung
strive strove striven
swear swore sworn
sweep swept swept
swell swelled swollen
swim swam swum
swing swung swung
take took taken
teach taught taught
tear tore torn
tell told told
think thought thought
throw threw thrown
tread trod trodden
understand understood understood
undertake undertook undertaken
upset upset upset
wake woke woken
wear wore worn
weave wove woven
weep wept wept
win won won
wind wound wound
withdraw withdrew withdrawn
wring wrung wrung
write wrote written
`;

/** How a form relates to its verb, worded as learner's dictionaries do */
export type VerbFormKind = 'past simple' | 'past participle' | 'past simple and past participle';

export interface VerbForm {
  kind: VerbFormKind;
  base: string;
}

/** The verbs' base forms */
const BASES = new Set<string>();
/** Each past form, lowercase, to the verbs it is a form of ("lay": past simple of "lie") */
const FORMS = new Map<string, VerbForm[]>();

for (const line of IRREGULAR_VERBS.trim().split('\n')) {
  const [base, past, participle] = line.split(' ');
  BASES.add(base);
  const pastForms = past.split('/');
  const participleForms = participle.split('/');

  for (const form of new Set([...pastForms, ...participleForms])) {
    // "put", "cut": the form is the verb itself, nothing to explain
    if (form === base) continue;
    const isPast = pastForms.includes(form);
    const isParticiple = participleForms.includes(form);
    const kind: VerbFormKind = isPast && isParticiple
      ? 'past simple and past participle'
      : isPast ? 'past simple' : 'past participle';
    FORMS.set(form, [...(FORMS.get(form) ?? []), { kind, base }]);
  }
}

/**
 * The irregular verbs a word is a past form of; empty for anything else
 */
export function findIrregularVerbForms(word: string): VerbForm[] {
  return FORMS.get(word.toLowerCase()) ?? [];
}

/**
 * Whether a word is itself one of the irregular verbs ("lay", besides being the past of "lie")
 */
export function isIrregularVerbBase(word: string): boolean {
  return BASES.has(word.toLowerCase());
}
