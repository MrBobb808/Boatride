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

## Report

The **Report** tab is the end-of-night document: headcount against tickets
issued, turnout, a ranked "who brought the most", a full per-holder table of
out / came / missing, the arrival window, and the numbers that were never
presented. *Print this report* uses a dedicated print stylesheet — app chrome
drops away and a dated header appears. *Download as a spreadsheet* emits CSV
through the `downloads` capability, falling back to `.txt` where the extended
type set is off, and to the clipboard when the page isn't running as a hosted
Artifact.

## State and moving it between devices

Check-ins are kept in `localStorage` under `gangway-checkin-v1`, so closing the
tab or losing signal doesn't lose the list.

There is **no server and no live sync** — nothing reconciles two devices on its
own. What exists instead is a portable state code: the board packs into 2 bits
per ticket (checked, and whether it was claimed via a seller rather than by
number), base64url'd with a checksum, giving a ~117-character string.

- The URL hash rewrites itself on every change, so the address in the bar always
  carries the current board. Open that address anywhere and the check-ins come
  with it.
- The **Sync** tab shows the code, copies it or a link, and takes a paste from
  another device.

Merging is a **union** — a check-in present on either side survives, and nothing
is ever un-checked. So merging is idempotent, safe in either direction, and safe
to repeat. Two people can work two doors on two phones and merge at the end.

A link is a snapshot of the moment it was copied, not a live feed.
