# Token Radar

A token launch radar: it ranks the protocols that record no token by what
their token would be worth, and shows how to farm each one.

## What it does

`main.ts` reads the sealed DefiLlama snapshot (`/input/snapshot.json`), ranks
the 180 pre-token protocols with the highest implied value — always including
all 40 of the snapshot's watchlist — and writes:

- `board.json` — the ranked board (slug, rank, implied value, farm steps)
- `dashboard/` — the page (board, detail view, filters) and its data
- `screenshots/` — board, detail and filtered views of the page
- `dossier.json` — the dossier of the dashboard and screenshots

## The model

Implied value = TVL x category multiple x growth factor x age factor x chain
factor. The category multiple is the median market-cap / TVL of the protocols
in the same category whose token already trades (global median when a category
has too few traded comps); the growth factor comes from the 7-day TVL change;
the age factor from how long the protocol has run with no token; the chain
factor from how many chains it runs on. Nothing is hardcoded by name: every
input is a field of the snapshot. Wrapped, staked and bridged products of a
token that already trades, and versioned builds of a protocol, are set aside
before ranking: they are not protocols still waiting on a launch of their own.
The dashboard's method section shows the multiples and the traded comps
behind them, and each protocol's detail view shows its own derivation.

Farm plans are five concrete steps per protocol, written for its category's
mechanics (swaps and pools for a DEX, supplying and borrowing for a lender,
bridging for a bridge, and so on), each with what it costs and how long it
takes.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to>/snapshot.json
```

Node 22 or later, standard library only, no network. The program is
deterministic: two runs write the same bytes.

## Caveat

"Records no token" means DefiLlama's record carries no token for the
protocol; it is not proof the protocol has none. An implied value is this
radar's own claim about what a token would be worth if the protocol's record
stayed as it is — not a prediction that a token will be issued, or when, and
not investment advice.
