# Plan: data inventory, every County and City layer reviewed and why it is or is not used (issue #101)

Risk tier: Low. Documentation plus a hand-run script that never runs in CI or in the app; the
new script logic (parse the doc, compare names) is pure and fully unit testable. No user-visible
change.

Domain skills: superpowers:test-driven-development, invoke. Frontend, accessibility, React and
dataviz skills: not applicable because no UI or bundle code changes. humanizer: not applicable
because the doc prose follows the repo's existing data.md voice.

## Acceptance criteria

1. `docs/data.md` has a "Service inventory" section listing every layer the app reads (with what
   it is used for and a check date) and a "Reviewed and not used" part with the County and City
   tables from the issue, each entry with a reason and its check date.
2. Every service in the County org (`wkbq75VVf2MvUvs7`), the City org (`HZXbCkpCSqbGd0vK`) and
   the City Board's `maps6.stlouis-mo.gov` `BOE` folder is mentioned in `docs/data.md` with a
   reason, as a line of its own root's `services county|city|boe` block (which may use `*`),
   with the date the list was checked.
3. `node scripts/inspect-data.mjs` prints each service in those service lists that the doc does
   not mention, per org. `node scripts/inspect-data.mjs --inventory` does only that (no
   `docs/raw/` writes). With today's lists and doc, it prints none.
4. The inventory reads only the service directories (`?f=json` on the services root or folder).
   It never queries, or reads the metadata of, any service it lists, so
   `Table_Voter_Curbside_CheckIn` and the Board's forms are never touched.
5. Only the lines of a root's own ```` ```services <key> ```` blocks inside the "Service
   inventory" section count; code spans never do (revised after two review rounds: code spans
   include field names like `precincts` and `URL`, and one shared set let a name in one org
   hide the same name in another). A root that answers
   with an ArcGIS error body (HTTP 200) or no services list prints `fail`, not an empty org. A `*` alone, or a pattern with fewer than 4 literal characters, is ignored. A broader
   pattern that still has 4 (`*_view`, `BOE/*`) is guarded only by the doc's rule against
   family patterns (criterion revised at Low after the third finder: no shipped line uses `*`).
6. The St. Louis City part points at #57's comments (its closing comment and the `maps6` BOE
   findings) and at the existing St. Louis City section.
7. README: the election update steps say the inventory is re-checked before each election, and
   the Development list says what the script now prints.

## Files that change

- `scripts/inspect-data.mjs`: `INVENTORY_ROOTS` (the three service lists), exported pure
  functions `documentedServices(markdown)` and `undocumentedServices(names, documented)`, an
  `inventory()` step that fetches each root's `?f=json`, and an `--inventory` flag.
- `src/test/inspectData.test.js`: tests for the two pure functions (criteria 3, 5).
- `docs/data.md`: the new "Service inventory" section at the end; the intro line names it.
- `README.md`: the Development command line for the script, and step 2 of "Updating for a new
  election".

Not touched: `src/i18n/en.json` and the geocoder credits (#120 is open on them),
`docs/progress.md`.

## Order of work

1. Red tests for `documentedServices` and `undocumentedServices`; then implement them.
2. Wire `inventory()` and `--inventory` into the script; run it live and list every service.
3. Write the docs/data.md section from the live lists and the item titles from the orgs'
   public content search (titles only), until `--inventory` prints none.
4. README edits.

## Risks

- A glob that is too broad hides a future service (the issue's `polls_2027_*` case). Mitigation:
  past elections are listed by exact name (no `*` line ships); nothing is a
  bare family glob like `polls_*`. A test pins that `polls_2027_11_view` is reported against
  the shipped doc.
- The Board's forms (absentee applications, curbside check-in) hold voter personal data. The
  inventory reads only the directory listing; categorizing used the public item titles from the
  content search, never a query or layer metadata.
- The City org is the whole City government (159 unique services). Listing them is long; they sit in
  collapsed `<details>` blocks so the doc stays readable.

Chosen not to do: list the wait time org (`IeWM0VelvUwce9qE`), which is not one of the two
orgs; its one layer the app reads is in the "Read by the app" table. No stale-name check for
services the doc lists that are gone.

## Proof

- Criteria 3, 5: unit tests in `src/test/inspectData.test.js`, including one that reads the
  real `docs/data.md` and checks `polls_2027_11_view` and a made-up City election service are
  reported, while every name in the "Read by the app" table is documented.
- Criteria 2, 3, 4: live drive, `node scripts/inspect-data.mjs --inventory` prints the three
  roots with 0 undocumented each, and its code fetches only the roots.
- Criteria 1, 6, 7: review of the doc diff.
