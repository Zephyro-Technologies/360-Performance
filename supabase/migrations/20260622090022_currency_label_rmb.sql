-- ===========================================================================
-- 360 Performance — display the Chinese currency as "RMB", never "CNY".
-- The ISO code "CNY" is PRESERVED as the currencies PK / FK (products.cost_currency,
-- suppliers.currency, exchange_rates.currency) AND the open.er-api.com FX lookup key —
-- only the human-facing label (currencies.name) changes. The UI renders the label
-- (mirrored client-side in CURRENCY_LABEL / displayCurrency).
-- ===========================================================================
update currencies set name = 'RMB' where code = 'CNY';
