// Today, in Melbourne, as an ISO date.
//
// A settlement is recorded once it has happened, so its date is today and
// only today. Two things follow from that: the picker offers no other day,
// and the server refuses one, because a client can always be lied to.
//
// Melbourne rather than UTC because the OCs are Victorian: at 9am on the 3rd
// in Melbourne it is still the 2nd in UTC, and a settlement dated yesterday
// would be rejected by its own rule.
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
  }).format(new Date());
}
