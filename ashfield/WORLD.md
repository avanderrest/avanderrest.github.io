# Ashfield — the world, in one file

The quest log for **Letters to Ashfield**. Everything the engine knows is in `js/content.js`;
this is the browsing copy, so you never have to read a 900-line object.

## The setup

A fortnight ago, on the **26th of November**, Harriet Vale — the previous postmaster — died.
They said it was a fall on the vestry steps. The inquest called it accident, and the village
considered the matter closed.

You are the new postmaster, twelve days, one pile a morning, six houses and the post office —
**seven houses**, as the village keeps saying, as if being able to count them were the whole
job.

## The killer

At the start of each run the engine draws one of seven killers (`pickKiller` in `game.js`):

`marion` · `penry` · `wren` · `tom` · `edith` · `sam` · **`keeper`** (the post office / you)

- Fourteen **case notes** (id `c_*`, `caseClue: true`) turn up in the pile on days 3–8, two a
  day. Each reads one way if that person is the killer and another if they are innocent — the
  guilty text is the story the village needs for the night to close; the innocent text is what
  people really did.
- Kept case notes gather in the diary under **The case**.
- The day-11 unsigned letter (from `ash`, "the one honest letter I have written") asks you to
  either **file** the case, give the constable a **name**, or leave it **quiet**. Whoever you
  name (`Yourself` = accusing the office is the `keeper` confession) decides the endings.

## The people (six houses + the office)

| key | name | place | work | the 26th, in one line |
| --- | --- | --- | --- | --- |
| marion | Marion Tebbutt | The Shop, Front Street | the till, the tin, the town | shut at one; closed sign; keeps the dead woman's mail under the till |
| penry | Rev. Aldous Penry | St Anne's / vestry | the register, the lamp, the lists | in the vestry; register "undisturbed"; his book says the door was open at nine |
| wren | Wren Hollis | The Fox & Hounds | the bar, the bus, the dream | 6.40 bus, till money to Marion's, lane, back of the hall at ten to nine |
| tom | Tom Ferrier | Low Farm | the beasts, the gate, the wall | at the gate; his boot print is the *last one in* the vestry porch |
| edith | Edith Marlow | Rose Cottage | the window, the flowers, the book | at the window by eight; nobody went up, Tom came down |
| sam | Dr Sam Okafor | The Surgery | the bench, the ledger, the car | called to the vestry at nine; wrote "door locked from within, eleven minutes" |
| keeper | you | the Post Office | the round, the counter, the map | log blank half six to nine; the coat has its buttons back |

## Marks & clues (what the marks on things mean)

```
wire     → tom   (mends everything)
twine    → tom   (baler twine at Low Farm)
dogcoat  → tom   (Bracken, brown collie)
till     → marion (shop receipts; keeps hers)
pad      → marion (order-pad corners)
pricegun → marion (doubles labels when thinking)
oil      → penry (vestry lamp, filled by hand)
cross    → penry (church ironwork)
hymn     → penry (pencil lists of numbers)
biro     → wren  (goes over paper while thinking)
beer     → wren  (everything leaves the Fox on a mat)
bus      → wren  (an opinion about exactly one bus)
script   → sam   (prescription pads used as bookmarks)
latin    → sam   (doctor's hand, Latin short forms)
bench    → sam   (the green bench, that one green)
lavender → edith (Rose Cottage in every drawer)
copper   → edith (her hand only)
rose     → edith (thorns, no gloves)
```

## Things in the pile (the marks are the address)

| id | day | what | marks | owner | how it settles |
| --- | --- | --- | --- | --- | --- |
| t_mug | 2 | enamel mug, chipped | wire, dogcoat | tom | badges + note from Marion |
| t_glasses | 3 | tartan spectacle case + receipt | till, pricegun | marion | marks |
| t_thimble | 4 | silver thimble, thin crown | lavender, rose | edith | marks |
| t_matchbox | 5 | matches + a phone number | beer, biro | wren | note asks for it back (asks) |
| t_timetable | 6 | bus timetable, one column | biro, bus | wren | marks |
| t_key | 7 | long iron key, grey string | cross, oil | penry | marks |
| t_bookmark | 8 | cathedral paperback, p.90 | script, bench | sam | marks |
| t_button | 9 | horn coat button | none | keeper | note names it; returns to the office |
| t_receipt | 10 | shop receipt for a parcel posted the 26th | till, pricegun | — | **ask Marion** (soldWhere/buyer → names Sam) |

`names`/`asks`: a note that settles one outright. `n6a` (wren) asks for the matchbox;
`n9a` (ash) names the button.

## Finds on the map (case evidence, in chain order)

| id | day | art | found | tell to | sets | opens |
| --- | --- | --- | --- | --- | --- | --- |
| f_prints | 3 | paws | boot prints in the vestry porch, one nail in the heel | tom | prints_tom | f_scarf |
| f_scarf | — | collar | good Christmas wool, caught on the churchyard gate | marion | scarf_marion | f_lamp |
| f_flowers | 4 | flowers | damp flowers, north corner, no grave | penry | flowers_rev | — |
| f_lamp | — | lamp | vestry lamp on its hook, drained dry | penry | lamp_mill | f_draft |
| f_draft | — | smooth | Council notice written the day *before* the fall | marion | draft_seen, tea | f_stone |
| f_stone | — | wall | stone in the churchyard bed, postmark-pad gum to it | edith | stone_edith, edith_vigil | — |

## Outreach (the hand-written requests)

`need` is a trust level: the door does not open until you are that far in (AM-8).

| id | who | kind | when | need | sets |
| --- | --- | --- | --- | --- | --- |
| o_marion_tea | marion | visit | has tea | — | marion_tea_done |
| o_marion_ledger | marion | ask | marion_tea_done | 1 | ledger_seen |
| o_marion_case | marion | ask | ledger_seen | 3 | marion_case_read |
| o_penry_register | penry | visit | rev_promise | — | reg_vestry, rev_confess |
| o_penry_lists | penry | ask | reg_vestry or reg_box | 1 | reg_lists |
| o_wren_cellar | wren | visit | wren_alibi | — | wren_box |
| o_wren_green | wren | visit | wren_box, day 8+ | — | wren_aware, wren_promise |
| o_tom_gate | tom | visit | returned tom or prints_tom | — | went_with_tom, tom_hope |
| o_edith_window | edith | visit | edith_diary | — | counted_with_edith, watched_flowers |
| o_edith_page | edith | ask | counted_with_edith | — | diary_page_read |
| o_edith_case | edith | ask | counted_with_edith | 2 | edith_case_read |
| o_sam_bench | sam | visit | returned sam or sorted p2b | — | met_sam, look_records |
| o_sam_drive | sam | visit | met_sam, day 7+ | 2 | drove_with_sam |

## Day by day

### Day 1 — Monday
- **p1a** Marion / **p1b** Penry / **p1c** Tom (envelope tutorial)
- **p1d** (keeper) Parish Council appointment; *departure of the previous postmistress, Mrs
  Harriet Vale*; "We do not anticipate any further enquiry." Replies: `Understood` /
  `"Any further enquiry" — why not?` → asked_before

### Day 2 — Tuesday
- **p2a** Wren / **p2b** Sam / **p2c** Edith
- **t_mug** (wire, dogcoat → tom)
- **n2a** note from Marion teaches `wire` (AM-9: leaflets version — seven houses on the mill
  road alone and the van misses two of them)

### Day 3 — Wednesday
- **p3a** Edith / **p3b** Sam (Registrar)
- **t_glasses** (till, pricegun → marion)
- **n3a** note teaches `dogcoat`
- **c_marion_a · c_penry_a** — the case opens
- **p3c** (keeper, Penry) *The night of the 26th* — register undisturbed, door was not.
  Replies: `I will look at the register with you` → rev_promise / `The inquest said accident` → −1

### Day 4 — Thursday
- **p4a** → return: *Mrs H. Vale, the Post Office* (deliberately give to Marion → vale_to_marion)
- **p4b** Wren / **p4c** Penry
- **t_thimble** (lavender, rose → edith)
- **n4a** note teaches `lavender`, `till`
- **c_wren_a · c_tom_a · c_none_a** (the *seven houses* slip)

### Day 5 — Friday
- **p5a** Tom / **p5b** Wren (School of Nursing) / **p5c** Marion
- **t_matchbox** (beer, biro → wren)
- **n5a** note teaches `beer`
- **c_edith_a · c_sam_a · c_marion_b**

### Day 6 — Saturday
- **p6a** Edith (solicitors) / **p6b** Sam *ref. 7/4*
- **t_timetable** (biro, bus → wren)
- **n6a** wren asks for the matchbox
- **c_keeper_a**
- **p6c** (keeper, wren) *the night harriet died* — "everybody says they were somewhere… you're
  the post. write it down." Replies: `I will write it down` → wren_alibi (×2 routes)

### Day 7 — Sunday
- **p7a** Penry (lamp oil) / **p7b** Tom (black-edged card) / **p7c** →return (postmarked
  Ashfield; give to Marion → ledger_seen)
- **t_key** (cross, oil → penry)
- **n7a** Edith note teaches `cross`, `oil`
- **c_penry_b · c_wren_b · c_tom_b · c_edith_b**

### Day 8 — Monday
- **p8a** Marion ('On Your 51st') / **p8b** Edith (diary, returned unread)
- **t_bookmark** (script, bench → sam)
- **n8a** note teaches `bench`, `script`
- **c_sam_b · c_none_b** (the unsigned second slip) · **c_keeper_b**

### Day 9 — Tuesday
- **p9a** Sam / **p9b** Edith
- **t_button** — belongs to the office; **n9a** (ash) names it
- **c_sam_b** set on day 8; same day p9c…
- **p9c** (keeper, Sam) *The night of the 26th* — two true books about one locked-and-open door
  (AM-10 rewording applied). Replies: `Bring yours…` → sam_register → **scene books** /
  `Two true books about one door.` → −1

### Day 10 — Wednesday
- **p10a** Penry / **p10b** Tom
- **t_receipt** (AM-11) — ask Marion: soldWhere/buyer → named sam, boughtOutcome QoS
- **p10c** (keeper, Edith) *The north corner, and the 26th* — two lists, the rota at the corner
  (AM-10 rewording applied). Replies: `I will come and sit at the window` → **scene window** /
  `Who comes? You know who comes.` → edith_diary

### Day 11 — Thursday
- **p11a** →return: *Ashfield. No name, no house.*
- **p11b** (keeper, from **ash**) *The 26th* — the threat/confession fork:
  - **File it as it was filed.** → ending `file`
  - **Give the constable a name.** → `suspects` flow (six buttons + Yourself) → ending `named`
  - **Leave it.** → ending `quiet`
  - (never opening it → ending `silent`)

### Day 12 — Friday
- **p12a** Marion / **p12b** (keeper) Nettleton Constabulary, by hand — body flips on
  chose_file / chose_quiet. Reply: Sign and seal it.

## Scenes (evenings, AM-14)

- **books** — after p9c reply 1, at closing. Two books, one desk:
  *lay them side by side* or *read them aloud to each of them*. Either sets `reg_box`.
- **window** — after p10c reply 1: watch the corner at *ten past eight* (Marion) or
  *at noon* (Tom). Sets watched_flowers + marion_vigil / tom_vigil.

## Endings

| ending | title | how |
| --- | --- | --- |
| file | The report | filed as it was filed; five stay accounted for; the 26th keeps its quiet |
| named | The name | right name if `accused === killer`; otherwise the constable writes nothing and the truth retires to the bottom drawer |
| quiet | The blank scrap | the threat lies unanswered; nothing is said; it is a complete account |
| silent | The blank morning | you never answered; the constable closes what the inquest closed |

## Flags that do things

```
took_post · asked_before · rev_promise · wren_alibi · sam_register
edith_diary · chose_file · chose_quiet · accused_name_said · signed
prints_tom · scarf_marion · lamp_mill · flowers_rev · draft_seen · tea
stone_edith · edith_vigil · vale_to_marion · ledger_seen
marion_tea_done · reg_vestry · rev_confess · reg_lists · reg_box
wren_box · wren_aware · wren_promise · went_with_tom · tom_hope
counted_with_edith · watched_flowers · diary_page_read · edith_case_read
marion_case_read · met_sam · look_records · drove_with_sam
marion_vigil · tom_vigil
```