/*
 * Setu Prompt Library — the single, versioned source for travel prompts.
 *
 * Edit the template text here when the planning workflow changes. The Prompt
 * Library loads this file on every visit with a cache-busting URL, so an app
 * release can update the prompts without modifying the interface.
 *
 * Placeholders: {{destination}}, {{origin}}, {{travel_date}}, {{travel_style}}.
 * This file is ordinary JavaScript to keep file:// exports usable offline.
 */
(function (root) {
  'use strict';

  root.SetuTravelPromptCatalog = {
    schema: 1,
    revision: '2026-11-19.1',
    templates: [
      {
        id: 'discover',
        step: 1,
        title: 'Discover the destination',
        description: 'Collect places, free seating, local food and experience tags before designing a route.',
        body: `I am researching a one-day trip to {{destination}} in Japan for my Setu travel planner.

Starting point: {{origin}}.
Travel date: {{travel_date}}.
Preferred trip style: {{travel_style}}.

Research the destination and realistic nearby areas before building an itinerary. Use current Japanese-language and official sources where possible. Verify addresses, weekday/weekend hours, admission, seasonal conditions and closures; distinguish verified facts, estimates and unknowns.

Discover:
1. Natural attractions, parks, quiet gardens, rivers, waterfalls, viewpoints and safe walking or hiking routes.
2. Shrines, temples, heritage, museums and distinctive local experiences.
3. Affordable restaurants, bakeries, local-produce markets, supermarkets, and convenience stores suitable for picking up milk for my own coffee. I do not eat beef.
4. Libraries, study seats, free sheltered seating, station waiting rooms, benches, toilets and long-stay alternatives to expensive cafés. Never assume a library allows independent study, laptops or Wi-Fi; verify each facility and any library-card restrictions.
5. JR East DAY OFF destinations when relevant; distinguish this discovery source with its own tag.

Group places into geographically meaningful hubs and sub-hubs, not one enormous list. For each candidate include the Japanese name, Maps link, source, approximate walking/transit access, cost, hours, suggested visit duration, indoor/outdoor and rain suitability. Include quiet/crowded expectations only with evidence or as clearly labelled estimates.

Setu supports multiple practical tags (Quiet, Indoor, Free, Long-stay, Wi-Fi, Study-friendly, Rain shelter) and separate experiential tags (Igloo, Cocoon, Hideout). A place may be a Potential Cocoon before my visit, but personal Confirmed Cocoon must wait for my on-site review. Keep unvisited recommendations separate from personally visited locations.

Show my five best initial choices with clear costs and reasons, while preserving the wider candidate list for exploration. End by identifying which locations require transport verification. Do not finalize a timed itinerary yet.`,
      },
      {
        id: 'transport',
        step: 2,
        title: 'Transport and return backups',
        description: 'Verify rail, bus, bicycle options, last services and emergency alternatives.',
        body: `Continue planning my trip to {{destination}} from {{origin}} on {{travel_date}}.
My desired trip style is {{travel_style}}.

I currently have an Ageo–Warabi commuter pass. Calculate eligible rail fare savings accurately; do not assume that pass covers other railway operators or all transfers. Confirm the departure station and date if still undecided.

Investigate:
1. Practical rail routes, transfer stations, fare (including any commuter-pass coverage), travel time, and weekend frequency.
2. Local buses: official route/stop names, route maps, fares, payment methods, weekend timetables, last departures and any 運休, 廃止 or seasonal restrictions. Do not treat old timetables as current.
3. Walking routes, safe roadside access, hiking difficulty/elevation, shared or rented bicycles (HELLO CYCLING only if actually present), and taxis.
4. A realistic way to reach and return from each shortlisted attraction without a car.

Prepare a reliable return plan from the most remote proposed destination. Check sunset, expected duration, the last and second-to-last viable bus/train, and a safe time to leave each remote stop. Include reasonable buffers rather than planning to catch the last departure exactly.

Create separate backups for (A) a missed local bus, (B) an interrupted or missed train connection and (C) bad weather, unavailable bicycle sharing, flat battery or no internet. Research viable taxis, accommodation and any genuinely permitted late-night waiting locations. A 24-hour convenience store is not automatically a suitable overnight shelter.

Use official operator sources for actual service times and provide a source URL and checked date. If a route or fallback cannot be verified, say so explicitly. Show a transport comparison and your safest budget-conscious recommendation. Do not invent times, services, prices or availability.`,
      },
      {
        id: 'itinerary',
        step: 3,
        title: 'Build flexible itineraries',
        description: 'Compare relaxed, nature-focused and budget-conscious days with five next-place choices.',
        body: `Using the verified place research and transport findings for {{destination}}, prepare my one-day plan.

Starting point: {{origin}}. Date: {{travel_date}}. Preferred mood: {{travel_style}}.

Lessons from my Kawagoe trip: spontaneous detours are important; famous crowded sights can be enjoyable, but I need peaceful recovery stops; opening hours can end earlier than expected; I want prices visible before choosing food; free long-stay seating saves money; local groceries and unexpected parks are worthwhile discoveries.

Develop three alternatives:
A. Relaxed town, culture, food and gardens.
B. Nature, walking, waterfalls or viewpoints with difficulty and daylight checks.
C. Quiet, low-cost exploration with free resting places and inexpensive food.

For each, provide a realistic sequence grouped by hub, a Google Maps route, verified opening/transport times, travel and visit duration, the cost of attractions/food/transport shown separately, toilets and sheltered rest stops, a rainy-day substitution, and a safe return deadline. Mark unknown prices and do not count them as free.

At major stops, list five changing next-place options ranked by time until closing, realistic distance, weather, crowd expectations, my mood, budget and the remaining safe return window. Let me take detours without losing the return journey.

Finish with a comparison of the three plans, your recommendation, a compact mobile checklist, total known cost plus unknowns, and a hard warning for any itinerary depending on unverified last buses or difficult walking in darkness. Do not require me to visit every place.`,
      },
      {
        id: 'live-review',
        step: 4,
        title: 'Live trip and Setu reviews',
        description: 'Use on-the-day updates, collect personal impressions and propose Setu drafts.',
        body: `Act as my live travel companion for {{destination}}. The original plan starts at {{origin}}, with travel date {{travel_date}} and preferred style {{travel_style}}.

As I send my current spot, photographs, the time, the weather, personal impressions or unexpected detours, offer five next destinations with a reason, known price, opening/closing risk, realistic travel time, and whether I can still safely return. Include a quieter or sheltered alternative when practical. Re-evaluate any last bus/train risk whenever I move to a remote area.

Record a review for each location only from what I actually tell you. Distinguish Visited, Passed nearby, Did not enter, Suggested and Personally reviewed. For places I tested, ask about quietness, crowd, comfort, seating, free/paid status, 30–90 minute stay, study/laptop/Wi-Fi rules, food/drink permissions and whether I would return.

Use Setu's practical tags and separate Igloo / Cocoon / Hideout experience tags. Do not turn a Potential Cocoon into a Confirmed Cocoon until my own review supports it. Do not assume a room was used merely because I visited the building.

At the end, report planned versus actual stops, good detours, missed locations, known spending, transport issues, best quiet/free resting places and lessons for future trips. Prepare Setu place/review suggestions as drafts with sources and confidence, but do not write to GitHub or Supabase without my separate approval.`,
      },
    ],
  };
})(typeof window === 'undefined' ? globalThis : window);
