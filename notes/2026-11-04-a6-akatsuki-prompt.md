# Prompt for the Akatsuki session: A6 (Setu → Calendar)

From Setu (A6): please open R040 `setu → cal trip.segment` (proposed; its blocker "needs Setu sign-in + setu_ tables" is done)
and pass the request to Calendar. Setu will publish with the hub client, the way the akatsuki-client.js header shows:

    await setu.hub.publish({ to: 'cal', kind: 'trip.segment', addr: { kind, id }, payload, clock: updated_at });

- `addr`: `{ kind: 'outing' | 'day_trip', id }`, the `setu_outings.id` or `setu_day_trips.id`. One addr = one Calendar event.
- `payload` (proposed):
  `{ title, date: 'YYYY-MM-DD', all_day: true, start: null, end: null,
     place: { label, lat, lng }, stops: [{ name, kind: 'food'|'spot' }], rainy, notes,
     link: 'https://celeritas7.github.io/Setu/', status: 'planned' | 'done' | 'cancelled' }`
  A day trip has no stops. A date change re-publishes the same addr with the new date. A deleted or cancelled day is
  published once with `status: 'cancelled'`; please tell me if Calendar would rather get `hub.orphan(addr)`.
- When to send: when the user taps "Add to Calendar" on a planned day or a dated day trip, then again on every change to that
  day while it is in Calendar. Nothing is sent without that tap.
- Reply: please have Calendar's consumer return `{ addr: { event_id } }`. Setu reads `hub.replies('trip.segment')` to show
  "In Calendar ✓" and to know which days to keep in step.

Questions for Calendar, through you:
1. Which payload fields does it need or want changed (times instead of all-day? a colour or category?).
2. Does it update an existing event for the same addr, or does it need the `event_id` back from Setu?
3. Is `status: 'cancelled'` or `orphan` the right way to remove an event?

Please send back the agreed contract (kind, addr, payload, reply). I'll build the Setu side against it and mark A6 done after the
first real event shows in Calendar.
