-- Air/sea (logistics) vendors now use the SAME form as product vendors — so vendor_accounts
-- gets the same contact fields suppliers have (contact / phone / country / currency). All
-- nullable-or-defaulted so existing rows (incl. the supplier-mirror rows with role null) are
-- untouched. currency mirrors suppliers' default ('CNY') and references the currencies table.
alter table vendor_accounts
  add column contact  text,
  add column phone    text,
  add column country  text,
  add column currency char(3) not null default 'CNY' references currencies(code);
