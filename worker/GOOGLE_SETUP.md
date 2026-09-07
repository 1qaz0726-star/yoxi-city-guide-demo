# Google Maps integration

## Cloudflare Worker secrets

- `GOOGLE_MAPS_BROWSER_KEY`: browser key. Enable Maps JavaScript API. Restrict HTTP referrers to `https://yoxi-city-guide-demo.pages.dev/*`, and localhost development origins as needed.
- `GOOGLE_MAPS_SERVER_KEY`: separate server-only key. Enable Places API (New) and Routes API. Do not set browser/referrer restrictions on this key. Apply API restrictions and project quotas. Never send this key to the frontend.
- `OPENROUTER_API_KEY`: existing AI selection key; optional. Failure uses deterministic ranking with explicit provenance.

Secrets belong to `yoxi-city-rhythm-api`, not merely Pages settings. Google Cloud project needs billing enabled. Setting secrets does not prove APIs are enabled; verify real requests after configuration.

Google is preferred only when both Google keys are configured, keeping the basemap and place provider consistent. Otherwise existing Geoapify remains an explicitly labeled fallback. A configured Google provider returning an error is not silently substituted. A Google browser key is separate from the server key.

## API additions

`GET /api/config`: `provider`, `mapProvider`, `browserApiKey`, `googleMapsBrowserKey` (Google only), `placesProvider`.

`POST /api/plan`: existing origin/preferences/timeMinutes plus `returnToOrigin: boolean`, `excludePlaceIds: string[]` (up to 30), optional `plannerMode: "rules"`.

Response preserves existing fields. `route.walkMinutes + stayMinutes + bufferMinutes + freeMinutes = totalMinutes` (user budget). `plannedMinutes = walkMinutes + stayMinutes`. Return walking is included in all totals and geometry; `returnLeg` supplies the separate return segment.

Places expose `provider`, `source`, `openingStatus`, `googleMapsUri`, and attribution data. `openingStatus` reflects the provider's current query result, not guaranteed future arrival status. Unknown is never converted to open. Quietness, seating, queues and safety are not verified.

`provenance.yoxiSignals = "not_connected"`: no official aggregate or personal ride-history integration is claimed.

## Operational boundaries

- Nearby Search requests current opening hours (Enterprise field tier). Review Google pricing and set daily quotas before wider launch.
- Up to three Nearby Search calls and six initial walking calculations per plan, plus connecting/return legs and optional AI. No persistent Google content cache is added.
- Browser CORS restrictions are not authentication or sufficient abuse protection. Configure Cloudflare rate limiting before broad public promotion.
- Google attribution must remain visible. Opening Google Maps navigation is a handoff, not evidence the user actually walked or arrived.
- Privacy/terms and Google attribution policies require review before formal launch.

## Verification

Run `node --test worker/tests/plan.test.mjs` from the demo directory. Tests mock provider responses and do not prove a production Google key is valid. Main integration must also perform a live smoke test when keys are configured.

## Official references

- https://developers.google.com/maps/documentation/places/web-service/nearby-search
- https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes
- https://developers.google.com/maps/documentation/places/web-service/policies
- https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
