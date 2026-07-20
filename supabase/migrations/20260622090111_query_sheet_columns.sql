-- ===========================================================================
-- Per-sheet column selection. A query sheet is scratch work, so which of the catalogue's columns
-- it carries is the operator's choice — picked with tick boxes when the sheet is created, and
-- changeable afterwards. Stored as an ordered jsonb array of column KEYS (the keys declared in
-- components/invoicing/querySheetColumns.ts), not labels: renaming a header must not orphan a sheet.
--
-- Hiding a column never deletes its data — the values stay in each row's `cells` blob and reappear
-- if the column is ticked again. Existing sheets backfill to "every column", which is what they
-- were rendering before this migration.
-- ===========================================================================

alter table query_sheets add column columns jsonb not null default '[]'::jsonb;

-- An empty array means "not chosen" and the client falls back to the full catalogue set; the
-- backfill below makes that explicit for sheets created before column selection existed.
update query_sheets
set columns = '["name","qty","unitCostRmb","rmbRate","unitCost","totalCost","shipUnit","shipTotal","pkg","landedUnit","landedTotal","retail","reseller","mRetail","profitUnit","mReseller","sold","pr","remaining","itemPaidQ","shipPaidQ","itemPaidAmt","shipPaidAmt","totalPaid","itemPaidOn","shipPaidOn","vendor","status"]'::jsonb
where columns = '[]'::jsonb;

-- Guard the shape only (a json array of text). WHICH keys are valid is the client's column
-- registry, deliberately not duplicated here — adding a column there must not need a migration.
alter table query_sheets add constraint query_sheets_columns_is_array check (jsonb_typeof(columns) = 'array');
