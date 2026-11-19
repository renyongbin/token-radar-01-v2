// Token Radar entrypoint.
//
// Reads the sealed snapshot, ranks the pre-token protocols by implied value,
// and writes the graded outputs:
//   <out>/board.json            the ranked board (the gate reads this)
//   <out>/dashboard/            the page (index.html, app.css, app.js, data.js)
//   <out>/screenshots/          the three dashboard screenshots
//   <out>/dossier.json          buildDossier of the dashboard + screenshots
//
// Usage: node main.ts --input /input/snapshot.json
//        (MAKEFUN_OUTPUT_DIR or --output names the output directory;
//         defaults are /input/snapshot.json and /output.)
// Standard library only; no network. The two grading runs must write the
// same bytes, so nothing here depends on the time, the locale or randomness.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoard } from './lib/model.ts';
import type { BoardRow, Snapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));

function flagValue(argv: string[], name: string): string | null {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1]! : null;
}

/** The compact row the dashboard renders (factors are recomputed by the page). */
function compactRow(r: BoardRow): Record<string, unknown> {
  return {
    s: r.slug,
    n: r.name,
    c: r.category,
    h: r.chains,
    t: r.tvl_usd,
    g: r.change_7d,
    l: r.listed_at,
    v: r.implied_value_usd,
    r: r.rank,
    w: r.watchlist ? 1 : 0,
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  const input = flagValue(argv, '--input') ?? '/input/snapshot.json';
  const out = flagValue(argv, '--output') ?? process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

  const snapshot = JSON.parse(readFileSync(input, 'utf8')) as Snapshot;
  const board = buildBoard(snapshot);

  mkdirSync(out, { recursive: true });
  const dashOut = join(out, 'dashboard');
  const shotsOut = join(out, 'screenshots');
  rmSync(dashOut, { recursive: true, force: true });
  rmSync(shotsOut, { recursive: true, force: true });
  cpSync(join(REPO_ROOT, 'dashboard'), dashOut, { recursive: true });
  cpSync(join(REPO_ROOT, 'screenshots'), shotsOut, { recursive: true });

  // The board, whole: the gate reads slug, name, rank, implied_value_usd,
  // farm_steps, and the extra fields are the derivation the page shows.
  const boardDoc = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    excluded_count: board.excludedCount,
    rows: board.rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      rank: r.rank,
      implied_value_usd: r.implied_value_usd,
      farm_steps: r.farm_steps,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      age_days: r.age_days,
      multiple: r.multiple,
      growth_factor: r.growth_factor,
      age_factor: r.age_factor,
      chain_factor: r.chain_factor,
      watchlist: r.watchlist,
    })),
  };
  writeFileSync(join(out, 'board.json'), JSON.stringify(boardDoc, null, 2) + '\n', 'utf8');

  // The dashboard's data: compact rows plus the multiples the page uses to
  // show each row's derivation, and the traded comps behind the multiples.
  const dataDoc = {
    asOf: snapshot.as_of,
    floorUsd: snapshot.floor_usd,
    preToken: board.preTokenCount,
    watchlist: board.watchlistCount,
    excluded: board.excludedCount,
    multiples: {
      byCategory: board.multiples.byCategory,
      global: board.multiples.global,
    },
    traded: board.tradedTop,
    rows: board.rows.map(compactRow),
  };
  writeFileSync(
    join(dashOut, 'data.js'),
    'window.TOKEN_RADAR_DATA = ' + JSON.stringify(dataDoc) + ';\n',
    'utf8',
  );

  const dossier = buildDossier(out, { text_max_bytes: 65536 });
  writeFileSync(join(out, 'dossier.json'), dossier);
  const shotCount = board.rows.length;
  console.log(
    `token-radar: ${shotCount} rows (${board.watchlistCount} watchlist, ${board.preTokenCount} pre-token in snapshot) -> ${out}`,
  );
}

main();
