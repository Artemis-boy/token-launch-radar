# Token Radar

A token launch radar: it reads a sealed snapshot of the protocol universe
(DefiLlama, 2026-11-14), finds the protocols that record no token yet, ranks
them by what a launch would be worth, and hands in a web dashboard with the
board, a detail view for every protocol, and the steps to farm it.

Built for the make.fun bounty **"Build the best token launch radar"**
(`token-radar-01`). The winning dashboard is featured on make.fun's site.

## The model (radar-2)

Implied value follows from the snapshot's own figures, never from a list of
names:

```
implied = round(tvl_usd x category multiple
                x (1 + clamp(change_7d, -50, 100) / 100 x 0.6)
                x (0.7 + min(age_days, 1095) / 1095 x 0.5))
```

The **category multiple** is the market speaking: for each category, the
median market cap per dollar of TVL among the live-token protocols in the
snapshot. A category needs at least 3 live protocols before its own median
counts; a thinner one uses the market-wide median (0.1689, from 144
protocols). A counted median is pulled toward the market-wide one, and every
multiple is kept inside [0.03, 1.5]. Age is the time since the protocol was
first listed, the best record of how long it has run with no token.

The board covers the snapshot's whole 40-protocol watchlist and adds 138
pre-token protocols below the $50M floor, by TVL. Wrapped, staked and bridged
products of tokens that already trade are never ranked. Live-token protocols
are set aside and shown at their market caps.

Each row carries a six-step farm plan derived from the protocol's own record
(category, chains, TVL, age), with what each step costs and how long it
takes. Implied value is the entry's own claim, not a promise, and a protocol
on this board *records no token* rather than has none.

## Run it

Node.js 22.18 or later, standard library only, no network:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

That writes `out/board.json`, `out/data.js`, `out/dashboard/`,
`out/screenshots/` and `out/dossier.json`. The program runs twice in grading
and both runs write the same bytes.

## Verify it

```sh
node check-page.mjs   # the page's own recompute matches board.json, all 178 rows
node check-gate.mjs   # the seven gate rows, as the scorer checks them
```

## Layout

- `main.ts` — the entrypoint: reads the snapshot, writes the outputs.
- `lib/model.ts` — the model, the board, the farm plans, the snapshot parser.
- `vendor/makefun-board.ts` — make.fun's dossier library, byte for byte as
  the kit ships it.
- `dashboard/` — the static page: `index.html`, `app.css`, `app.js`. No
  network, no framework; the page re-derives every row it shows and says
  whether it matches the board.
- `screenshots/` — the board, a protocol's detail view, and a filtered view.

## License

MIT. See `LICENSE`.
