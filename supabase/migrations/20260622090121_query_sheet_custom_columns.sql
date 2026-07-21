-- ===========================================================================
-- Operator-defined ("custom") columns on a query sheet, plus column REORDERING.
--
-- A query sheet is scratch work, so the operator needs columns the catalogue registry doesn't
-- have — a note, a lead time, whatever this particular query needs. Those live per sheet:
--
--   custom_columns : [{ "key": "c:<uuid>", "label": "Lead time", "kind": "text" }, ...]
--
-- Keys are namespaced with "c:" so a custom column can never collide with a built-in registry
-- key, now or after a future registry addition. Their VALUES need no schema change at all —
-- query_sheet_rows.cells is already a free-form jsonb blob keyed by column key (090110), which
-- is exactly why it was built that way.
--
-- Reordering needs no new column either: query_sheets.columns (090111) is already an ORDERED
-- jsonb array of keys. What changes is the client — resolveColumns() used to force declaration
-- order so a sheet read like the catalogue; it now honours the stored order, which is what makes
-- dragging a column stick. Existing sheets are unaffected: their stored array was written in
-- declaration order, so they render exactly as before until someone drags something.
--
-- As with `columns`, the shape is guarded here but the SEMANTICS are the client's — validating
-- which `kind` values exist would mean a migration every time the grid learns a new cell type.
-- ===========================================================================

alter table query_sheets add column custom_columns jsonb not null default '[]'::jsonb;

alter table query_sheets
  add constraint query_sheets_custom_columns_is_array check (jsonb_typeof(custom_columns) = 'array');

comment on column query_sheets.custom_columns is
  'Operator-defined columns for this sheet: [{key:"c:<uuid>", label, kind}]. Values live in query_sheet_rows.cells under the same key.';
comment on column query_sheets.columns is
  'ORDERED list of column keys — the sheet''s layout. Built-in keys come from the client registry; "c:"-prefixed keys refer to custom_columns.';
