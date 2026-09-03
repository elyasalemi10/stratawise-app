// Today, in Melbourne, as an ISO date.
//
// Used to cap date pickers at "not in the future" and to enforce the same
// on the server, because a client can always be lied to.
//
// Melbourne rather than UTC because the OCs are Victorian: at 9am on the 3rd
// in Melbourne it is still the 2nd in UTC, so a same-day entry would be
// rejected as being in the future.
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
  }).format(new Date());
}
