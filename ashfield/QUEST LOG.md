# Letters to Ashfield — Quest Log Journal

A review copy of the story content. This is written for reading outside the game. The ids in brackets match `ashfield/js/content.js`; the internal flags are included where a choice changes later content.

## Premise

Harriet Vale, the previous postmaster, was found at the steps of St Anne's on the night of 26 November. The inquest called it an accident. Before her death, Harriet had been checking discrepancies in the registered post and asking questions about the parish restoration accounts. Her red ledger and a bundle of returned letters are missing.

One of seven houses contains the culprit: Marion Tebbutt, Rev. Aldous Penry, Wren Hollis, Tom Ferrier, Edith Marlow, Dr Sam Okafor, or the new postmaster. The first playthrough selects only from the six villagers; the postmaster can become the culprit on a later run. The case notes present the innocent account for most people and a polished false account for the culprit.

The postmaster's job is also the investigation: sort the post, return lost property, visit people, compare records, and decide whether to give Nettleton Constabulary a name.

## How To Read This Log

- **Letter**: deliver it to the named house. A letter addressed to the postmaster goes to the Post Office and opens.
- **Item**: an object with marks that identify its owner. Learn what the marks mean, then return the object.
- **Note**: read it and keep it. It may teach a mark, settle an item, or add evidence to the case.
- **Appointment**: a visit or question available from the address book. `need` is the trust level required.
- **Reply**: the response chosen by the player, followed by its effect or later scene.

---

# Day 1 — Monday

## Morning letters

### [p1a] Letter to Marion Tebbutt
**Address:** Mrs M. Tebbutt, The Shop, Front Street, Ashfield

Routine village post. First delivery tutorial.

### [p1b] Letter to Rev. Aldous Penry
**Address:** The Vicarage, by St Anne's

Routine village post. First delivery tutorial.

### [p1c] Letter to Tom Ferrier
**Address:** T. Ferrier, Low Farm, up the mill road

Routine village post. First delivery tutorial.

### [p1d] Appointment from the Parish Council
**Address:** Postmaster, the Post Office, Ashfield
**Subject:** Appointment

The Council confirms you as Postmaster of Ashfield following Harriet Vale's death. The duties are the round, the counter, and the map. Anything found on the round must be returned to its owner.

Before her death, Harriet reported discrepancies in registered post and asked to inspect the parish restoration accounts. Her red ledger and a bundle of returned letters are missing. If either turns up, put it in the locked drawer and notify the Council.

The inquest concluded that Harriet died accidentally at St Anne's. The Council does not anticipate further enquiry and asks the new postmaster to give the village no cause for alarm.

**Replies:**

- **Understood. I will keep the records safe.** Sets `took_post`. The appointment goes in the drawer. The missing ledger is the first thing assigned to you that cannot be delivered to an address.
- **“Any further enquiry” — why not?** Sets `took_post` and `asked_before`. The Council replies that the inquest settled the matter but does not explain Harriet's account questions or the missing papers. It is the first instruction not to look.

## End-of-day note

The first day establishes the job and the closed official version of Harriet's death. The missing ledger is the first case lead.

---

# Day 2 — Tuesday

## Morning letters and post

### [p2a] Letter to Wren Hollis
**Address:** Miss W. Hollis, c/o the public house on the green

### [p2b] Letter to Dr Sam Okafor
**Address:** The Surgery, Front Street — MEDICAL. DO NOT BEND.

### [p2c] Letter to Edith Marlow
**Address:** Mrs E. Marlow, the far end of the village

### [t_mug] Lost item for Tom
**Object:** White enamel mug, chipped at the rim
**Marks:** Wire mend; brown dog hair
**Owner:** Tom Ferrier

### [n2a] Note from Marion

“New postmaster — anything comes in with a mend on it rather than a new one, that's Low Farm. Tom hasn't bought a new anything since I've had the shop. The leaflets for Low Farm come back to the shop with holes in them, else no fault: it is seven houses on his road alone and the van misses two of them. Wire, mostly. — M.T.”

**Teaches:** `wire` points to Tom.

---

# Day 3 — Wednesday

## Morning letters and post

### [p3a] Letter to Edith
**Address:** Rose Cottage

### [p3b] Letter to Sam
**Address:** Dr S. Okafor — from the Registrar

### [t_glasses] Lost item for Marion
**Object:** Tartan spectacle case with a receipt folded inside
**Marks:** Shop till receipt; crooked price label
**Owner:** Marion Tebbutt

### [n3a] Anonymous note

“A parcel for the surgery came back with short brown hairs caught under the string. It had been sent up the mill road and returned before Sam opened it. Not a stray, Marion says: Ferrier's dog, Bracken. The question is not who owns the dog. It is why a medical parcel went past Low Farm at all.”

**Teaches:** `dogcoat` points to Tom.

### [c_marion_a] Case note: Marion's alibi

- **If Marion is guilty:** She says she shut the shop at one, stayed in the flat, and heard the vestry clock at a quarter to two. She gives too many times and explains them in the wrong order.
- **If Marion is innocent:** She says she shut at one and stayed in the flat. The closed sign supports her, but nobody actually asked her to prove it.

### [c_penry_a] Case note: Penry's alibi

- **If Penry is guilty:** The vestry lock and his claim that he stayed inside make the account circular: the person confirming the locked room is the person who controlled it.
- **If Penry is innocent:** The vestry door locks from the vicar's side, the lamp was lit until closing, and he has never clarified whether he was last out or first in.

### [p3c] Letter from Penry to the postmaster
**Subject:** The night of the 26th

Penry says he was in the vestry. The register was undisturbed, but the door was not. He wants someone from outside the village to compare the two facts with him.

**Replies:**

- **I will look at the register with you.** Sets `rev_promise`, trust +2 with Penry. Opens the register visit.
- **The inquest said accident.** Trust -1 with Penry. He replies that he signed the inquest and cannot unsign it.

---

# Day 4 — Thursday

## Morning letters and post

### [p4a] Returned letter for Harriet Vale
**Address:** Mrs H. Vale, the Post Office, Ashfield

The previous postmaster is dead, so this can be deliberately delivered to Marion as an investigative choice.

### [p4b] Letter to Wren
**Address:** The Fox & Hounds — brewery invoice enclosed

### [p4c] Letter to Penry
**Address:** Rev. A. Penry, St Anne's — Diocesan Registry, Marriages & Burials

### [t_thimble] Lost item for Edith
**Object:** Silver thimble, worn thin at the crown
**Marks:** Lavender; rose thorn
**Owner:** Edith Marlow

### [n4a] Note from Marion

Anything smelling of lavender has been in Rose Cottage. A till receipt identifies who kept it, not who bought it; Marion keeps hers.

**Teaches:** `lavender` points to Edith and reinforces `till` points to Marion.

### [c_wren_a] Case note: Wren's alibi

- **If Wren is guilty:** She says she was late back, nobody saw her, and she could claim to have been anywhere. Her alibi is offered too cheaply.
- **If Wren is innocent:** She missed the 6.40 by a minute and sat on the green until the last bus came in. Her folded timetable supports the account.

### [c_tom_a] Case note: Tom's alibi

- **If Tom is guilty:** He repeats that he was at the gate and that nobody saw him. He is more concerned with being unseen than with describing the farm.
- **If Tom is innocent:** He was at the gate with the animals seen to. Prints in the churchyard mud came back up the road, which he himself pointed out.

### [c_none_a] Anonymous observation

A slip lists the lights of the parish and says: “seven houses, one bell, one van.” It puts the whole evening in one row but names nobody.

## Map evidence

### [f_prints] Boot prints in the vestry porch
**Tell Tom:** The heel has a nail in it. Tom identifies his boot and explains that the print drying from the inside means someone came in through the wet and left later than the visible trail suggests.

### [f_scarf] Scarf at the churchyard gate
**Unlocked by:** `prints_tom`
**Tell Marion:** The wool came from a November shop delivery. She remembers parcels sent to Rose Cottage, herself, and the vestry.

### [f_lamp] Vestry lamp
**Unlocked by:** `scarf_marion`
**Tell Penry:** The lamp was full on the 26th but was returned dry. Someone carried it and failed to follow the vestry rule.

### [f_draft] Prepared Council notice
**Unlocked by:** `lamp_mill`
**Tell Marion:** A notice about Harriet's accident was written the day before she died. The back says to alter the paragraph if the account changes. It looks prepared rather than spontaneous and sets `draft_seen` and `tea`.

### [f_stone] Stone in the churchyard bed
**Unlocked by:** `draft_seen`
**Tell Edith:** Postmark-pad gum is stuck to it, with a boot mark. Someone used the office pad outside after hours. Sets `stone_edith` and `edith_vigil`.

## Deliberate wrong-door choice

Delivering [p4a] to Marion sets `vale_to_marion` and starts her line about Harriet's envelope and the account ledger.

---

# Day 5 — Friday

## Morning letters and post

### [p5a] Letter to Tom
**Address:** Low Farm — veterinary account, second notice

### [p5b] Letter to Wren
**Address:** W. Hollis — School of Nursing, admissions

### [p5c] Letter to Marion
**Address:** The Shop — biscuit tin, by post, no sender

### [t_matchbox] Lost item for Wren
**Object:** Matchbox with four matches and a phone number
**Marks:** Beer mat; biro marks
**Owner:** Wren Hollis

### [n5a] Anonymous note

Nothing leaves the Fox with a beer mat beneath it unless Wren put it down while working.

**Teaches:** `beer` points to Wren.

### [c_edith_a] Case note: Edith's alibi

- **If Edith is guilty:** She claims she was at her window, saw nobody go up or down, and describes an empty lane with suspicious certainty.
- **If Edith is innocent:** She saw Tom go up and come back, saw the vestry light, and saw nobody else. Her age and clear view make the account useful.

### [c_sam_a] Case note: Sam's alibi

- **If Sam is guilty:** His ledger says he came to the vestry at nine, found it locked, waited eleven minutes, and left. The phrase “locked” ignores that the lock was on Penry's side.
- **If Sam is innocent:** He recorded the nine o'clock call at the time, including the eleven-minute wait. It is the only account written immediately and precisely.

### [c_marion_b] Case note: Marion's till record

- **If Marion is guilty:** The till closed at ten to one rather than one. She knows which stamp belongs to which time because she altered the record.
- **If Marion is innocent:** The till tape and closed sign agree. The account is ordinary, rounded, and internally consistent.

---

# Day 6 — Saturday

## Morning letters and post

### [p6a] Letter to Edith
**Address:** Mrs E. Marlow, Rose Cottage — from a firm of solicitors

### [p6b] Letter to Sam
**Address:** The Surgery — parish register enquiry, ref. 7/4

### [t_timetable] Lost item for Wren
**Object:** Bus timetable, folded to one column and annotated
**Marks:** Biro; bus times
**Owner:** Wren Hollis

### [n6a] Note from Wren

“If a matchbox turns up with a number in it that's mine and I want it back please. Not the matches. The number. — W”

**Settles:** [t_matchbox] belongs to Wren.

### [c_keeper_a] Case note: the post office log

- **If the postmaster is guilty:** A parcel was booked in and out at half past eight with no initials. The new postmaster remembers the parcel room's lock but not the evening after six, suggesting a missing piece in their own account.
- **If the postmaster is innocent:** The log is blank from half six to nine. The sorting room was unattended and unlocked, meaning someone else could have used it.

### [p6c] Letter from Wren to the postmaster
**Subject:** The night Harriet died

Wren says everyone claims to have been somewhere. She was on the 6.40, carried the till money to Marion's, and did not want to be the person who found the vestry empty. She asks the postmaster to write it down.

**Replies:**

- **I will write it down.** Sets `wren_alibi`, trust +2. Opens Wren's cellar visit.
- **Who carried the money up to Marion?** Sets `wren_alibi`, trust +1. Wren explains that Marion keeps the till money after closing.
- **Leave it.** The offer is ignored and moved to the bottom of the pile.

## Appointment: Wren's cellar
**When:** `wren_alibi`
**Need:** No additional trust
**Sets:** `wren_box`

Wren walks through the evening in order: 6.40 bus, till money to Marion, lane, back of the hall at ten to nine, vestry light, empty corner. She felt safer telling it in the cellar.

---

# Day 7 — Sunday

## Morning letters and post

### [p7a] Letter to Penry
**Address:** The Vicarage — lamp oil account, quarterly

### [p7b] Letter to Tom
**Address:** T. Ferrier — black-edged card

### [p7c] Returned letter for Harriet
**Address:** Mrs H. Vale, the Post Office, Ashfield. Postmarked Ashfield.

### [t_key] Lost item for Penry
**Object:** Long iron key on grey string
**Marks:** Church cross; lamp oil
**Owner:** Rev. Aldous Penry

### [n7a] Note from Edith

Church iron is cut with a cross at the end of the ward. Penry fills the lamp himself and gets oil on everything he owns.

**Teaches:** `cross` points to Penry and `oil` points to Penry.

### [c_penry_b] Case note: the register

- **If Penry is guilty:** He repeatedly says the register was undisturbed even though nobody asked. A disturbed page would reveal who handled it.
- **If Penry is innocent:** The register, lamp, and lock show no clear disturbance. Nobody has suggested the register was what Harriet's visitor touched.

### [c_wren_b] Case note: the Fox toast

- **If Wren is guilty:** She mentions a toast on the 26th, then retreats and says it was the first time. The correction sounds rehearsed.
- **If Wren is innocent:** She serves the bar that night but does not join the toast. Being behind the bar gives her a public alibi.

### [c_tom_b] Case note: the churchyard gate

- **If Tom is guilty:** He claims the gate was locked, though it hangs freely. He knows the detail is false.
- **If Tom is innocent:** He correctly says the gate is off its latch and swings. His knowledge comes from walking the lane, which he refuses to discuss.

### [c_edith_b] Case note: Edith's Thursday routine

- **If Edith is guilty:** She gives a perfect account of thirty years of Thursdays and insists she did not go out. The routine sounds rehearsed.
- **If Edith is innocent:** Her Thursday flowers and window watch put her in position to see Tom come down and nobody else go up.

## Appointments

### [o_tom_gate] Stand at Tom's gate
**When:** A Tom item has been returned or `prints_tom` is known
**Sets:** `went_with_tom`, `tom_hope`

Tom says the policeman walked around a hole in the night. He gives only eleven words, but the gap matters.

### [o_edith_window] Sit at Edith's window
**When:** `edith_diary`
**Sets:** `counted_with_edith`, `watched_flowers`

Edith records visitors to the north corner. A blank line in her visitor book is dated for the moment you are sitting there.

---

# Day 8 — Monday

## Morning letters and post

### [p8a] Letter to Marion
**Address:** Mrs M. Tebbutt — a card, “On Your 51st”

### [p8b] Letter to Edith
**Address:** Mrs E. Marlow, Rose Cottage — a diary, returned unread

### [t_bookmark] Lost item for Sam
**Object:** Paperback about cathedrals, read to page 90 three times
**Marks:** Prescription slip; green bench paint
**Owner:** Dr Sam Okafor

### [n8a] Note from Marion

Sam eats on the green bench and puts things down there. His prescription slips are used as bookmarks rather than prescriptions.

**Teaches:** `bench` and `script` point to Sam.

### [c_sam_b] Case note: Sam's precision

- **If Sam is guilty:** He insists that his watch was running and that eleven minutes was exact. The unnecessary detail sounds defensive.
- **If Sam is innocent:** He recorded eleven minutes because that is what happened. His precision is irritating but trustworthy.

### [c_none_b] Anonymous observation

Marion says Sam bought a recorded parcel on the afternoon of the 26th; Sam says Marion is the one who kept the receipt. By supper, each has told the story twice and changed one detail. The parcel, the receipt, and the missing ledger have become three ways of naming the same quarrel.

### [c_keeper_b] Case note: the post office door

- **If the postmaster is guilty:** The office was left on the latch and Harriet had a key to everywhere. The new postmaster remembers the latch and the morning post but not the last hour before Harriet was found: a key to everywhere and a blank hour.
- **If the postmaster is innocent:** The office was bolted at half six. The brass latch and iron bolt make the office an unlikely scene, but leave the postmaster with a suspiciously blank log.

## Appointments

### [o_wren_green] Stand on the green at ten past eight
**When:** `wren_box` and day 8 or later
**Sets:** `wren_aware`, `wren_promise`

Wren does not take the bus. She wants the five minutes between her alibi locations witnessed and written down.

### [o_edith_page] Ask Edith about the folded page
**When:** `counted_with_edith`
**Sets:** `diary_page_read`

Edith admits she read a page at two in the morning after trying not to read it. She will not say what it contains.

### [o_edith_case] Ask Edith which case note does not fit
**When:** `counted_with_edith`; need trust 2
**Sets:** `edith_case_read`

Edith says the useful note is the one about the night itself, not the six notes written to account for individual people.

---

# Day 9 — Tuesday

## Morning letters and post

### [p9a] Letter to Sam
**Address:** Dr S. Okafor — a form, returned unsigned

### [p9b] Letter to Edith
**Address:** Mrs E. Marlow, Rose Cottage — in her own hand

### [t_button] Lost item for the post office
**Object:** Horn coat button, worn shiny, from the coat in the porch
**Owner:** The post office / player

### [n9a] Note from an anonymous Ashfield source

The coat in the porch has a new button. It is Harriet's coat, and she did not wear a spare.

**Settles:** [t_button] belongs to the post office.

### [p9c] Letter from Sam to the postmaster
**Subject:** The night of the 26th

Sam says his ledger records a locked vestry door at nine, while Penry's register records an open door and an extinguished lamp. Both entries are signed, but they cannot describe the same minute. He asks the postmaster to put the books together.

**Replies:**

- **Bring yours. I will ask him for his.** Sets `sam_register`, trust Sam +2 and Penry +1. Triggers the two-books evening scene.
- **Two true books about one door.** Trust Sam -1. The contradiction stays in the drawer.

## Evening scene: The two books

Triggered immediately by the first reply to [p9c]. This scene belongs to Day 9 because the letter is delivered on Day 9.

Sam brings the surgery ledger and Penry brings the parish register. One says the door was locked at nine; the other says it was open. The player chooses:

- **Lay them side by side.** Trust Sam +2 and Penry +1. Sets `reg_box`. The two records contradict each other in the same minute.
- **Read them aloud to each of them.** Trust Sam +1 and Penry +1. Sets `reg_box`. Each person hears the other account for the first time.

## Appointments

### [o_sam_bench] Sit with Sam on the green bench
**When:** Sam's item has been returned or [p2b] has been sorted
**Sets:** `met_sam`, `look_records`

Sam admits he has written the 26th on several forms and is no longer certain which record he trusts.

### [o_sam_drive] Go on Sam's afternoon round
**When:** `met_sam`, day 7 or later; need trust 2
**Sets:** `drove_with_sam`

At the county line Sam turns the car around, as he did on the 26th, and finally explains why the locked-door sentence has stayed with him.

---

# Day 10 — Wednesday

## Morning letters and post

### [p10a] Letter to Penry
**Address:** The Vicarage — lamp oil account, quarterly

### [p10b] Letter to Tom
**Address:** Low Farm — estimate for repairs to a stone wall

### [t_receipt] Unclaimed shop receipt
**Object:** Smudged receipt for a parcel posted on the afternoon of the 26th
**Marks:** Shop till receipt; crooked price label
**Seller:** Marion's shop
**Buyer:** Sam

**How it settles:** Ask Marion. She identifies the order pad, Sam's handwriting, and the significance of Sam keeping the dated receipt.

### [p10c] Letter from Edith to the postmaster
**Subject:** The north corner, and the 26th

Edith says she watched the north corner at eight. People have been visiting it without knowing about each other, which is why their accounts disagree. She asks the postmaster to sit at her window.

**Replies:**

- **I will come and sit at the window.** Sets `edith_diary`, trust Edith +2. Triggers the window scene.
- **Who comes? You know who comes.** Sets `edith_diary`, trust Edith +1. Edith gives a partial answer and keeps the rest of her book closed.

## Appointments

### [o_marion_tea] Tea above the shop
**When:** `tea`
**Sets:** `marion_tea_done`, trust Marion +2

Marion reveals an envelope under the till with Harriet's name and a receipt written in a living person's hand.

### [o_marion_ledger] Ask about the envelope under the till
**When:** `marion_tea_done` and not `ledger_seen`; need trust 1
**Sets:** `ledger_seen`, trust Marion +1

Marion produces the envelope and a ledger. Harriet's name and a date connected to the night of the 26th appear in the margin.

### [o_marion_case] Lay the case out over tea
**When:** `ledger_seen`; need trust 3
**Sets:** `marion_case_read`, trust Marion +1

Marion sorts the notes into accounts of individual people and one note that describes the night itself. She identifies the one that does not fit.

## Evening scene: The window on the north corner

Triggered by the first reply to [p10c]. Edith puts the kettle on and watches the churchyard path. The player chooses:

- **Watch at ten past eight.** Sets `watched_flowers` and `marion_vigil`. Marion visits the corner on Thursday and the shop opens late afterward.
- **Watch at noon, when the road is quiet.** Sets `watched_flowers` and `tom_vigil`. Tom visits the corner and gives the same account he has given all fortnight.

---

# Day 11 — Thursday

## Morning letters and post

### [p11a] Unaddressed letter
**Address:** Ashfield. No name, no house.

### [p11b] Anonymous letter to the postmaster
**Subject:** The 26th

The writer says the postmaster has five alibis, two books, and a receipt, but has not asked who benefited from Harriet's death. Harriet kept a red ledger covering parish donations, shop accounts, farm boundaries, medical orders, and letters that should not have been opened.

The writer offers three choices: file the case as already filed, give the constable a name, or leave the question unanswered. The letter is an accusation waiting for evidence, not a supernatural warning.

**Replies:**

- **File it as it was filed.** Sets `chose_file`, ending `file`.
- **Give the constable a name.** Opens the suspect list. The player may name any remaining suspect or themselves. Sets `accused_name_said` and ending `named`.
- **Leave it. Let the 26th keep what it keeps.** Sets `chose_quiet`, ending `quiet`.
- **Do not answer the letter.** Leads to ending `silent`.

---

# Day 12 — Friday

## Morning letters and post

### [p12a] Letter to Marion
**Address:** Mrs M. Tebbutt, The Shop, Front Street, Ashfield

### [p12b] Constabulary letter to the postmaster
**Address:** Postmaster, the Post Office, Ashfield — Nettleton Constabulary, by hand
**Subject:** The 26th — report

If the player filed the case or stayed quiet, the constabulary notes the existing accident finding and thanks the postmaster for discretion. Otherwise, it requests the postmaster's report and anything found during the twelve-day round.

**Reply:**

- **Sign and seal it.** The report is sent to Nettleton.

## Final decision

The constable takes the assembled accounts. A name alone is not enough: at least six case notes must be kept before an accusation can be confirmed. With fewer than six, even a correct guess remains an unsupported suspicion and the file stays open. The postmaster culprit is especially slow-burning: the guilty account contains a blank hour and missing memories around the parcel room, but the player only has to recognise that pattern if they have found enough of the case.

---

# Address-book Appointments — Quick Index

## Marion

- **Tea above the shop** — `o_marion_tea`; requires `tea`; visit; trust +2; sets `marion_tea_done`.
- **Ask about the envelope under the till** — `o_marion_ledger`; requires `marion_tea_done`, trust 1; ask; trust +1; sets `ledger_seen`.
- **Lay the case out over tea** — `o_marion_case`; requires `ledger_seen`, trust 3; ask; trust +1; sets `marion_case_read`.

## Penry

- **Turn the register over with him** — `o_penry_register`; requires `rev_promise`; visit; trust +2; sets `reg_vestry`, `rev_confess`.
- **Ask which list the 26th is on** — `o_penry_lists`; requires `reg_vestry` or `reg_box`, trust 1; ask; trust +1; sets `reg_lists`.

## Wren

- **Hear her places on the 26th in order** — `o_wren_cellar`; requires `wren_alibi`; visit; trust +2; sets `wren_box`.
- **Stand on the green at ten past eight** — `o_wren_green`; requires `wren_box`, day 8+; visit; trust +3; sets `wren_aware`, `wren_promise`.

## Tom

- **Stand at the gate with him at five** — `o_tom_gate`; requires a returned Tom item or `prints_tom`; visit; trust +1; sets `went_with_tom`, `tom_hope`.

## Edith

- **Sit at the window on a Thursday** — `o_edith_window`; requires `edith_diary`; visit; trust +2; sets `counted_with_edith`, `watched_flowers`.
- **Ask about the folded page** — `o_edith_page`; requires `counted_with_edith`; ask; trust +1; sets `diary_page_read`.
- **Ask which case note does not fit** — `o_edith_case`; requires `counted_with_edith`, trust 2; ask; trust +1; sets `edith_case_read`.

## Sam

- **Sit on the green bench** — `o_sam_bench`; requires a returned Sam item or sorted [p2b]; visit; trust +1; sets `met_sam`, `look_records`.
- **Go on the afternoon round** — `o_sam_drive`; requires `met_sam`, day 7+, trust 2; visit; trust +2; sets `drove_with_sam`.

---

# Marks and Their Meanings

| Mark | Points to | Meaning |
|---|---|---|
| `wire` | Tom | Low Farm mends rather than replaces |
| `twine` | Tom | Orange baler twine |
| `dogcoat` | Tom | Bracken's brown hair |
| `till` | Marion | Shop till receipts |
| `pad` | Marion | Shop order-pad corners |
| `pricegun` | Marion | Crooked or doubled price labels |
| `oil` | Penry | Vestry lamp oil |
| `cross` | Penry | Church ironwork |
| `hymn` | Penry | Penry's numbered lists |
| `biro` | Wren | Wren's overworked handwriting |
| `beer` | Wren | Fox & Hounds beer mat |
| `bus` | Wren | Her annotated timetable |
| `script` | Sam | Prescription-pad paper |
| `latin` | Sam | Doctor's hand and abbreviations |
| `bench` | Sam | Green paint from the bench |
| `lavender` | Edith | Rose Cottage scent |
| `copper` | Edith | Edith's copperplate handwriting |
| `rose` | Edith | Rose thorns caught in seams |

---

# Ending Outcomes

## `file` — The report
The player files the case as the inquest filed it. The accident remains official and the culprit keeps the 26th.

## `named` — The name
The player names a suspect. With six or more case notes, a correct name leads to an arrest and reopens the inquest. With fewer, the constable asks for proof and no culprit is confirmed. A wrong name leaves the accused free and the real culprit unidentified.

## `quiet` — The blank scrap
The anonymous letter and evidence remain in the drawer. The village continues as before and nobody is charged. If the postmaster is the culprit, the unexplained hour in their own account remains as an unease rather than a reveal.

## `silent` — The blank morning
The player never answers. The constable closes the existing accident report without receiving the new evidence. No culprit is named by the game; the village remains merely odd unless the player found enough clues to make the pattern legible.
