"use client";

import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// VIC-only address autocomplete using Google's Places API (New).
//
// Uses AutocompleteSuggestion.fetchAutocompleteSuggestions / Place.fetchFields
// rather than the legacy AutocompleteService — Google deprecated the legacy
// API and new GCP projects often don't have it enabled even with a billed
// key. The new API ships with both "Maps JavaScript API" and "Places API
// (New)" enabled in GCP.
//
// Strictly rejects non-VIC selections — predictions ARE biased to VIC via
// locationBias, but Google sometimes returns NSW/SA border addresses, so we
// double-check administrative_area_level_1 === "VIC" on select.

export type ParsedAddress = {
  street_number: string;
  street_name: string;
  suburb: string;
  state: "VIC";
  postcode: string;
  formatted: string;
};

interface Props {
  value: ParsedAddress;
  onChange: (next: ParsedAddress) => void;
  id?: string;
}

interface Suggestion {
  placeId: string;
  description: string;
}

// Minimal typings for the new Places API surface we touch. `@types/google.maps`
// hasn't fully caught up; this avoids a flurry of any-casts.
interface NewPlaceAddressComponent {
  types: string[];
  longText: string | null;
  shortText: string | null;
}
interface NewPlace {
  fetchFields(opts: { fields: string[] }): Promise<unknown>;
  formattedAddress: string | null;
  addressComponents: NewPlaceAddressComponent[] | null;
}
interface NewPlacePrediction {
  placeId: string;
  text: { text: string };
  toPlace(): NewPlace;
}
interface NewAutocompleteResponse {
  suggestions: Array<{ placePrediction: NewPlacePrediction | null }>;
}
interface NewAutocompleteSuggestionCtor {
  fetchAutocompleteSuggestions(opts: {
    input: string;
    sessionToken?: unknown;
    includedRegionCodes?: string[];
    includedPrimaryTypes?: string[];
    locationBias?: {
      rectangle: { low: { latitude: number; longitude: number }; high: { latitude: number; longitude: number } };
    };
  }): Promise<NewAutocompleteResponse>;
}
interface AutocompleteSessionTokenCtor {
  new (): unknown;
}

let _placesPromise: Promise<google.maps.PlacesLibrary> | null = null;
let _optionsSet = false;

function loadPlaces(): Promise<google.maps.PlacesLibrary> | null {
  if (typeof window === "undefined") return null;
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  if (!_optionsSet) {
    setOptions({ key, v: "weekly" });
    _optionsSet = true;
  }
  if (!_placesPromise) _placesPromise = importLibrary("places");
  return _placesPromise;
}

function joinFormatted(p: ParsedAddress): string {
  return `${p.street_number} ${p.street_name}, ${p.suburb} ${p.state} ${p.postcode}`.replace(/\s+/g, " ").trim();
}

function pickComponent(
  comps: NewPlaceAddressComponent[],
  types: string[],
  short = false,
): string {
  const c = comps.find((c) => types.every((t) => c.types.includes(t)));
  if (!c) return "";
  return (short ? c.shortText : c.longText) ?? "";
}

function componentsToParsed(
  comps: NewPlaceAddressComponent[],
  formatted: string,
): ParsedAddress | null {
  const state = pickComponent(comps, ["administrative_area_level_1"], true);
  if (state !== "VIC") return null;
  return {
    street_number: pickComponent(comps, ["street_number"]),
    street_name: pickComponent(comps, ["route"]),
    suburb:
      pickComponent(comps, ["locality"]) ||
      pickComponent(comps, ["postal_town"]) ||
      pickComponent(comps, ["sublocality"]),
    state: "VIC",
    postcode: pickComponent(comps, ["postal_code"]),
    formatted,
  };
}

export function VicAddressAutocomplete({ value, onChange, id }: Props) {
  const apiKeyConfigured = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const hasParsedValue = !!(value.street_number || value.street_name || value.suburb || value.postcode);
  const [mode, setMode] = useState<"search" | "manual">(hasParsedValue ? "manual" : "search");
  const [searchInput, setSearchInput] = useState(value.formatted || joinFormatted(value));
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [searchError, setSearchError] = useState<string | null>(null);

  const sdkRef = useRef<{
    AutocompleteSuggestion: NewAutocompleteSuggestionCtor;
    AutocompleteSessionToken: AutocompleteSessionTokenCtor;
  } | null>(null);
  const sessionTokenRef = useRef<unknown>(null);
  const predictionByIdRef = useRef<Map<string, NewPlacePrediction>>(new Map());
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tracks whether the Places SDK actually loaded. We can't tell *why* a load
  // fails from inside the browser (the JS loader rejects with a generic
  // `ApiNotActivatedMapError` regardless of which API is missing), so we just
  // surface a "search is unavailable" hint when this stays false and let the
  // user fall back to manual entry.
  const [sdkFailed, setSdkFailed] = useState(false);

  useEffect(() => {
    const p = loadPlaces();
    if (!p) {
      // Diagnostic — most common cause is a NEXT_PUBLIC_* env var set after
      // `next dev` was started (those bake at build time and require a
      // server restart). Mirror to console.warn so the operator can see it.
      if (typeof window !== "undefined") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        console.warn(
          "VicAddressAutocomplete: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing at runtime. "
          + "If it's set in .env.local you need to RESTART `next dev` after editing — "
          + "NEXT_PUBLIC_* vars are baked at build time."
        );
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSdkFailed(true);
      return;
    }
    p.then((places) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lib = places as any;
      if (!lib.AutocompleteSuggestion) {
        // The Maps JS bundle loaded but doesn't include AutocompleteSuggestion
        // — usually means "Places API (New)" isn't enabled in GCP for this
        // key, OR the key lacks "Maps JavaScript API" entirely.
        console.error(
          "[VicAddressAutocomplete] Places API (New) not available.\n"
          + "Fix in Google Cloud Console:\n"
          + " 1. APIs & Services → Library → enable 'Places API (New)' and 'Maps JavaScript API'.\n"
          + " 2. APIs & Services → Credentials → your key → Application restrictions: 'HTTP referrers' "
          + "must include http://localhost:* and your prod domain (or temporarily set to 'None' to test).\n"
          + " 3. Billing must be enabled on the project."
        );
        setSdkFailed(true);
        return;
      }
      sdkRef.current = {
        AutocompleteSuggestion: lib.AutocompleteSuggestion,
        AutocompleteSessionToken: lib.AutocompleteSessionToken,
      };
      sessionTokenRef.current = new lib.AutocompleteSessionToken();
    }).catch((err) => {
      console.error(
        "[VicAddressAutocomplete] Places SDK failed to load. Likely causes: "
        + "API key restrictions blocking this origin, billing not enabled, or 'Places API (New)' "
        + "not enabled in GCP. Raw error:",
        err,
      );
      setSdkFailed(true);
    });
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // When the Places SDK fails to load (key missing, API not enabled), drop
  // the user into manual entry automatically so they're not stuck typing into
  // a search box that never returns results.
  useEffect(() => {
    if (sdkFailed && mode === "search") setMode("manual");
  }, [sdkFailed, mode]);

  async function fetchSuggestions(input: string) {
    if (!sdkRef.current || input.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    try {
      const resp = await sdkRef.current.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: sessionTokenRef.current ?? undefined,
        includedRegionCodes: ["au"],
        includedPrimaryTypes: ["address"],
        locationBias: {
          rectangle: {
            low: { latitude: -39.16, longitude: 140.96 },
            high: { latitude: -33.98, longitude: 149.98 },
          },
        },
      });
      const items: Suggestion[] = [];
      predictionByIdRef.current.clear();
      for (const s of resp.suggestions.slice(0, 5)) {
        if (!s.placePrediction) continue;
        items.push({ placeId: s.placePrediction.placeId, description: s.placePrediction.text.text });
        predictionByIdRef.current.set(s.placePrediction.placeId, s.placePrediction);
      }
      setSuggestions(items);
      setActiveIdx(0);
      setOpen(items.length > 0);
    } catch (err) {
      console.error("VicAddressAutocomplete: fetchAutocompleteSuggestions failed", err);
      setSuggestions([]);
      setOpen(false);
    }
  }

  function onInput(v: string) {
    setSearchInput(v);
    setSearchError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchSuggestions(v), 200);
  }

  async function selectSuggestion(s: Suggestion) {
    const prediction = predictionByIdRef.current.get(s.placeId);
    if (!prediction || !sdkRef.current) {
      setSearchError("Couldn't load address details — try entering manually.");
      return;
    }
    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ["formattedAddress", "addressComponents"] });
      if (!place.addressComponents) {
        setSearchError("Couldn't load address details — try entering manually.");
        return;
      }
      const parsed = componentsToParsed(place.addressComponents, place.formattedAddress ?? s.description);
      if (!parsed) {
        setSearchError("That address isn't in Victoria. Try a VIC address or enter manually.");
        return;
      }
      onChange(parsed);
      setSearchInput(parsed.formatted);
      setOpen(false);
      // Rotate the session token so the next search starts a new billable session.
      if (sdkRef.current) {
        sessionTokenRef.current = new sdkRef.current.AutocompleteSessionToken();
      }
      setMode("manual");
    } catch (err) {
      console.error("VicAddressAutocomplete: fetchFields failed", err);
      setSearchError("Couldn't load address details — try entering manually.");
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); void selectSuggestion(suggestions[activeIdx]); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  function updateField(field: keyof ParsedAddress, v: string) {
    const next = { ...value, [field]: v } as ParsedAddress;
    next.formatted = joinFormatted(next);
    onChange(next);
  }

  if (mode === "manual") {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-[120px_1fr] gap-3">
          <div className="space-y-1">
            <Label htmlFor={`${id}-no`} className="text-xs text-muted-foreground">Street no.</Label>
            <Input id={`${id}-no`} value={value.street_number} onChange={(e) => updateField("street_number", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-name`} className="text-xs text-muted-foreground">Street name</Label>
            <Input id={`${id}-name`} value={value.street_name} onChange={(e) => updateField("street_name", e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-[1fr_100px_120px] gap-3">
          <div className="space-y-1">
            <Label htmlFor={`${id}-suburb`} className="text-xs text-muted-foreground">Suburb</Label>
            <Input id={`${id}-suburb`} value={value.suburb} onChange={(e) => updateField("suburb", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">State</Label>
            <Input value="VIC" readOnly className="text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-postcode`} className="text-xs text-muted-foreground">Postcode</Label>
            <Input
              id={`${id}-postcode`}
              inputMode="numeric"
              maxLength={4}
              value={value.postcode}
              onChange={(e) => updateField("postcode", e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </div>
        </div>
        {apiKeyConfigured && !sdkFailed && (
          <button
            type="button"
            onClick={() => { setMode("search"); setSearchInput(""); }}
            className="text-xs text-primary hover:underline cursor-pointer"
          >
            Search by address instead
          </button>
        )}
        {sdkFailed && (
          <p className="text-xs text-amber-700">
            Address search is temporarily unavailable. Enter the address manually.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div ref={wrapperRef} className="relative">
        <Input
          id={id}
          value={searchInput}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Start typing a Victorian address…"
          autoComplete="off"
        />
        {open && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border bg-popover shadow-md">
            {suggestions.map((s, i) => (
              <button
                key={s.placeId}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); void selectSuggestion(s); }}
                onMouseEnter={() => setActiveIdx(i)}
                className={cn(
                  "block w-full truncate px-3 py-2 text-left text-sm cursor-pointer",
                  i === activeIdx ? "bg-muted text-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                {s.description}
              </button>
            ))}
          </div>
        )}
      </div>
      {searchError && <p className="text-xs text-amber-700">{searchError}</p>}
      <button
        type="button"
        onClick={() => setMode("manual")}
        className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
      >
        Enter manually
      </button>
    </div>
  );
}
