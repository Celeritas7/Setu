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
    revision: '2026-11-22.1',
    templates: [
      {
        id: 'discover',
        step: 1,
        title: 'Discover the destination',
        description: 'Research sourced places and save a structured draft for Setu.',
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

Group places into real geographic hubs and sub-hubs. Show a concise hub overview and key selections in the readable response; retain every useful candidate in structured research data rather than pasting an enormous repeated list. For every candidate record Japanese name, address, Maps link, evidence source and checked date, approximate access, cost type and amount (unknown is not ¥0), hours, visit-duration estimate, indoor/outdoor, rain suitability and limitations. Label quiet/crowded expectations as verified, reported or estimated, never as a personal review.

Setu supports multiple practical tags (Quiet, Indoor, Free, Long-stay, Wi-Fi, Study-friendly, Rain shelter) and separate experiential tags (Igloo, Cocoon, Hideout). A place may be a Potential Cocoon before my visit, but personal Confirmed Cocoon must wait for my on-site review. Keep unvisited recommendations separate from personally visited locations.

Show the five strongest initial choices with explicit prices and reasons, keep the wider candidate inventory in the JSON, and identify stops needing transport verification. If the date is not chosen, ask before checking schedules or weather; no timed itinerary.

RESEARCH HANDOFF — Use the connected Google Drive folder Claude_Workspace/#Data_storage/Setu_research/<destination>/, following the real folder names (for example Setu_research/Ogose). Find the existing setu_research_handoff_v1.schema.json, and create or increment the versioned research JSON conforming to it (format setu_research_handoff, schema_version 1.0.0). Include all hubs, source URLs, checked dates and per-field uncertainty. All new places start suggested, unvisited, accepted=false, with no personally confirmed experience tags. Never invent coordinates, verified prices, study permissions or visit history. Save as a NEW version; don't overwrite previous research or user notes. Verify the Drive upload and exact parent folder before claiming success. If Drive or schema access is unavailable, provide downloadable JSON and disclose that no Drive upload occurred. Do not write to GitHub or Supabase.`,
      },
      {
        id: 'transport',
        step: 2,
        title: 'Transport and return backups',
        description: 'Check date-specific services and save transport evidence separately.',
        body: `Continue planning my trip to {{destination}} from {{origin}} on {{travel_date}}.
My desired trip style is {{travel_style}}.

I have an Ageo–Warabi commuter pass. Use the latest explicitly confirmed starting station, not an older example. Confirm the pass's registered route and validity on the travel date before calculating eligible JR fare savings; do not assume Tobu or local bus coverage. If the date is undecided, ask first: do not present date-specific train/bus timetables, last departures, sunset or weather as verified.

Investigate:
1. Practical rail routes, transfer stations, fare (including any commuter-pass coverage), travel time, and weekend frequency.
2. Local buses: official route/stop names, route maps, fares, payment methods, weekend timetables, last departures and any 運休, 廃止 or seasonal restrictions. Do not treat old timetables as current.
3. Walking routes, safe roadside access, hiking difficulty/elevation, shared or rented bicycles (HELLO CYCLING only if actually present), and taxis.
4. A realistic way to reach and return from each shortlisted attraction without a car.

Prepare a reliable return plan from the most remote proposed destination. Check sunset, expected duration, the last and second-to-last viable bus/train, and a safe time to leave each remote stop. Include reasonable buffers rather than planning to catch the last departure exactly.

Create separate backups for (A) a missed local bus, (B) an interrupted or missed train connection and (C) bad weather, unavailable bicycle sharing, flat battery or no internet. Research viable taxis, accommodation and any genuinely permitted late-night waiting locations. A 24-hour convenience store is not automatically a suitable overnight shelter.

Use official operator sources for actual service times and provide a source URL, checked date and applicable service date. If a route or fallback cannot be verified, say so explicitly. Show a transport comparison and safest budget-conscious recommendation; do not invent times, services, prices or availability.

TRANSPORT HANDOFF — Reuse the destination's current research JSON in Google Drive (Claude_Workspace/#Data_storage/Setu_research/<destination>/) instead of rediscovering all places. Save dated operator evidence as a SEPARATE versioned transport JSON file with source URL, operator, stops, service calendar, checked date, applicability and uncertainty. Do not merge stale services into timeless place facts. If the selected date is null, record transport_verification_pending instead of a fictitious safe leave-by time. Never overwrite existing research JSON, personally reviewed facts or prior timetable snapshots; verify upload and parent folder, otherwise provide a downloadable file. Do not write to GitHub or Supabase.`,
      },
      {
        id: 'itinerary',
        step: 3,
        title: 'Build flexible itineraries',
        description: 'Plan flexible alternatives and export the versioned Setu research JSON.',
        body: `Using the verified place research and transport findings for {{destination}}, prepare my one-day plan.

Starting point: {{origin}}. Date: {{travel_date}}. Preferred mood: {{travel_style}}.

Lessons from my Kawagoe trip: spontaneous detours are important; famous crowded sights can be enjoyable, but I need peaceful recovery stops; opening hours can end earlier than expected; I want prices visible before choosing food; free long-stay seating saves money; local groceries and unexpected parks are worthwhile discoveries.

Develop three alternatives:
A. Relaxed town, culture, food and gardens.
B. Nature, walking, waterfalls or viewpoints with difficulty and daylight checks.
C. Quiet, low-cost exploration with free resting places and inexpensive food.

For each, provide a realistic sequence grouped by hub, a Google Maps route, verified opening/transport times, travel and visit duration, the cost of attractions/food/transport shown separately, toilets and sheltered rest stops, a rainy-day substitution, and a safe return deadline. Mark unknown prices and do not count them as free.

At major stops, list five changing next-place options ranked by time until closing, realistic distance, weather, crowd expectations, my mood, budget and the remaining safe return window. Let me take detours without losing the return journey.

Finish with a comparison of three plans, your recommendation, a compact mobile checklist, known spending versus unknowns, and a hard warning about unverified last buses or darkness. Do not require every stop. If the date remains undecided, produce UNTIMED provisional alternatives; do not claim verified schedules, sunset or weather.

RESEARCH EXPORT — Do not repeat the entire earlier place inventory in chat. Update the existing destination research JSON using setu_research_handoff_v1.schema.json, preserving all candidates, source metadata, unresolved facts, and past versions. Save a NEW versioned JSON plus a short readable itinerary/report and change log in Claude_Workspace/#Data_storage/Setu_research/<destination>/ after verifying the exact folder and upload. Keep date-specific transport evidence in its separate file. Mark every researched place suggested/unvisited/accepted=false; Potential Igloo/Cocoon/Hideout never becomes Personally Confirmed without my actual review. If Drive is inaccessible, return downloadable files and state that they were not uploaded. This prepares Setu IMPORT DRAFTS, not direct updates to Setu/GitHub/Supabase.`,
      },
      {
        id: 'live-review',
        step: 4,
        title: 'Live trip and Setu reviews',
        description: 'Record only actual experiences and prepare review changes for Setu.',
        body: `Act as my live travel companion for {{destination}}. The original plan starts at {{origin}}, with travel date {{travel_date}} and preferred style {{travel_style}}.

As I send my current spot, photographs, the time, the weather, personal impressions or unexpected detours, offer five next destinations with a reason, known price, opening/closing risk, realistic travel time, and whether I can still safely return. Include a quieter or sheltered alternative when practical. Re-evaluate any last bus/train risk whenever I move to a remote area.

Record a review for each location only from what I actually tell you. Distinguish Visited, Passed nearby, Did not enter, Suggested and Personally reviewed. For places I tested, ask about quietness, crowd, comfort, seating, free/paid status, 30–90 minute stay, study/laptop/Wi-Fi rules, food/drink permissions and whether I would return.

Use Setu's practical tags and separate Igloo / Cocoon / Hideout experience tags. Do not turn a Potential Cocoon into a Confirmed Cocoon until my own review supports it. Do not assume a room was used merely because I visited the building.

At the end, report planned versus actual stops, good detours, missed locations, known spending (unknown remains unknown), transport issues, best quiet/free resting places and lessons for future trips. Prepare Setu place/review drafts with sources and confidence, but do not write to GitHub or Supabase without my separate approval.

REVIEW HANDOFF — Use the existing research IDs and the latest research JSON in Claude_Workspace/#Data_storage/Setu_research/<destination>/. Prepare a SEPARATE versioned review-change file containing only observations I actually described, including date, place/room scope, entered versus passed nearby, quiet/crowd, seating, cost, duration, study/Wi-Fi/food rules and whether I would return. Leave unasked or unobserved fields unknown. Preserve the original research and previous personal reviews. No automatic confirmation of Igloo, Cocoon or Hideout from GPS, an outside photo or a suggested tag. Save the review draft and trip summary to the exact Drive destination folder only if connected and authorized, verify the upload, otherwise provide downloadable files and say no upload occurred. The Setu app must preview and request approval before importing anything.`,
      },
    ],
  };
})(typeof window === 'undefined' ? globalThis : window);
