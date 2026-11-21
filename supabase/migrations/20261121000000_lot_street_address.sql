-- A lot's own street address, for OCs where each lot is a separate house or
-- townhouse (2 Sooty Lane) rather than a unit in one building (3B/12 Example St).
-- Null for apartment-style lots, which keep using unit_number + the OC address.
-- Street line only ("2 Sooty Lane"); the suburb and postcode come from the OC.
alter table public.lots add column if not exists street_address text;

comment on column public.lots.street_address is
  'Street line of this lot when it has its own address (townhouses). Null for units in one building. Suburb/postcode come from the OC address.';

-- unit_number was mandatory in the OC wizard, so townhouse OCs had the lot
-- number typed into it. It stays as data (it may be real for apartments);
-- the app hides a unit that equals the lot number and flags the OC instead.
comment on column public.lots.unit_number is
  'Apartment/unit label within one building, e.g. 3B. Optional. Not a street number.';
