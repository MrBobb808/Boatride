# Gangway — boat ride check-in

A single-file check-in app for a ticketed boat ride where tickets were handed
out in numbered blocks to ~43 sellers, who then resold them onward. Open
`index.html` in a phone browser at the gangway. No server, no network, no
install.

## The two ways a guest arrives

**They know their ticket number.** Type it. The card shows who that number was
issued to and a big check-in button.

**They don't know their number.** Ask who they bought from, type that name, and
tap *Check off one of their tickets*. The app claims that seller's lowest
unused number. The seller's count stays honest even though the guest's name is
never known — which is the whole point, since only the block holders' names
were recorded.

## Eventbrite tickets

Numbers 254–263, 267–268 and 272–275 were bought through Eventbrite (EV1–EV14
plus Deuel Carter's two). Those guests get checked in inside the Eventbrite app;
the button here just keeps the headcount right. They're marked with a purple
stripe so they're hard to miss. Searching `EV3` finds ticket 256.

## The book

| | |
|---|---|
| Numbers issued | 288 (1–278, 326–335) |
| Returned, won't be used | 2 |
| Guests expected | 286 |
| Never issued | 279–325 (47 numbers) |
| People holding blocks | 43 |

The **Notes** tab lists the things worth knowing before the first guest
arrives — the ticket 126 double-claim, Sis Pinnock's returns, Bro Trevor's three
separate blocks, Sis Eugene's bus request, and where the "70 remains" tally
doesn't reconcile.

## Data model

`BLOCKS` in `index.html` is the whole source of truth: one entry per run of
consecutive numbers, with the holder's name and a `key` that merges blocks
belonging to the same person. Optional per-block fields:

- `paid` — badge text, e.g. `"Paid in full"`
- `returned` — tickets in this block that came back and won't be used
- `ev` / `evStart` — Eventbrite block and its first EV label number
- `unissued` — numbers that never left the book
- `sub` — a qualifier shown under the name, e.g. `"Kids tickets"`
- `note` — shown on both the ticket card and the seller card

To correct the list, edit `BLOCKS` and reload. Ranges must not overlap.

## State

Check-ins are kept in `localStorage` under `gangway-checkin-v1`, so closing the
tab or losing signal doesn't lose the list. Use the same phone and the same
browser all evening, and don't use private browsing. *Copy a summary* on the
Manifest tab exports the current state as text — worth doing once mid-boarding
as a backup.
