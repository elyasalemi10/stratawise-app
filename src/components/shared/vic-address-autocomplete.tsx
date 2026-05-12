"use client";

import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// VIC-only address autocomplete with structured-component extraction.
//
// Usage pattern: collapsed by default (single search box). Once a suggestion
// is picked, we extract street_number/street_name/suburb/state/postcode and
// hand them up via onSelect. There's also a "Enter manually" link that
// reveals the individual boxes for tricky cases (new estates, addresses not
// yet on Google).
//
// Strictly rejects non-VIC selections — predictions ARE biased to VIC via
// locationBias, but Google sometimes still returns NSW/SA border addresses,
// so we double-check administrative_area_level_1 === "Victoria" on select.

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

interface Prediction {
  placeId: string;
  description: string;
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

function emptyAddress(state: "VIC" = "VIC"): ParsedAddress {
  return { street_number: "", street_name: "", suburb: "", state, postcode: "", formatted: "" };
}

function joinFormatted(p: ParsedAddress): string {
  return `${p.street_number} ${p.street_name}, ${p.suburb} ${p.state} ${p.postcode}`.replace(/\s+/g, " ").trim();
}

function pick(comps: google.maps.GeocoderAddressComponent[], types: string[]): string {
  const c = comps.find((c) => types.every((t) => c.types.includes(t)));
  return c?.long_name ?? "";
}
function pickShort(comps: google.maps.GeocoderAddressComponent[], types: string[]): string {
  const c = comps.find((c) => types.every((t) => c.types.includes(t)));
  return c?.short_name ?? "";
}

function componentsToParsed(comps: google.maps.GeocoderAddressComponent[], formatted: string): ParsedAddress | null {
  const state = pickShort(comps, ["administrative_area_level_1"]);
  if (state !== "VIC") return null;
  return {
    street_number: pick(comps, ["street_number"]),
    street_name: pick(comps, ["route"]),
    suburb: pick(comps, ["locality"]) || pick(comps, ["postal_town"]) || pick(comps, ["sublocality"]),
    state: "VIC",
    postcode: pick(comps, ["postal_code"]),
    formatted,
  };
}

export function VicAddressAutocomplete({ value, onChange, id }: Props) {
  const apiKeyConfigured = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const hasParsedValue = !!(value.street_number || value.street_name || value.suburb || value.postcode);
  const [mode, setMode] = useState<"search" | "manual">(hasParsedValue ? "manual" : "search");
  const [searchInput, setSearchInput] = useState(value.formatted || joinFormatted(value));
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [searchError, setSearchError] = useState<string | null>(null);

  const tokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const acService = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const p = loadPlaces();
    if (!p) return;
    p.then((places) => {
      acService.current = new places.AutocompleteService();
      placesService.current = new places.PlacesService(document.createElement("div"));
      tokenRef.current = new places.AutocompleteSessionToken();
    }).catch((err) => console.error("VicAddressAutocomplete: Places SDK failed to load", err));
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function fetchPredictions(input: string) {
    if (!acService.current || input.length < 3) {
      setPredictions([]);
      setOpen(false);
      return;
    }
    acService.current.getPlacePredictions(
      {
        input,
        sessionToken: tokenRef.current ?? undefined,
        componentRestrictions: { country: "au" },
        types: ["address"],
        locationBias: { north: -33.98, south: -39.16, west: 140.96, east: 149.98 },
      },
      (results, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !results) {
          setPredictions([]);
          setOpen(false);
          return;
        }
        setPredictions(results.slice(0, 5).map((r) => ({ placeId: r.place_id, description: r.description })));
        setActiveIdx(0);
        setOpen(true);
      },
    );
  }

  function onInput(v: string) {
    setSearchInput(v);
    setSearchError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPredictions(v), 200);
  }

  function selectPrediction(p: Prediction) {
    if (!placesService.current) {
      setSearchError("Couldn't load address details — try entering manually.");
      return;
    }
    placesService.current.getDetails(
      {
        placeId: p.placeId,
        fields: ["formatted_address", "address_components"],
        sessionToken: tokenRef.current ?? undefined,
      },
      (place, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place?.address_components) {
          setSearchError("Couldn't load address details — try entering manually.");
          return;
        }
        const parsed = componentsToParsed(place.address_components, place.formatted_address ?? p.description);
        if (!parsed) {
          setSearchError("That address isn't in Victoria. Try a VIC address or enter manually.");
          return;
        }
        onChange(parsed);
        setSearchInput(parsed.formatted);
        setOpen(false);
        // Rotate the session token so the next search starts a new billable session.
        tokenRef.current = new google.maps.places.AutocompleteSessionToken();
        // Lock to manual view so users can edit if needed.
        setMode("manual");
      },
    );
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || predictions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, predictions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); selectPrediction(predictions[activeIdx]); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  function updateField(field: keyof ParsedAddress, v: string) {
    const next = { ...value, [field]: v } as ParsedAddress;
    next.formatted = joinFormatted(next);
    onChange(next);
  }

  // Manual mode — show the 5 boxes.
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
        {apiKeyConfigured && (
          <button
            type="button"
            onClick={() => { setMode("search"); setSearchInput(""); }}
            className="text-xs text-primary hover:underline cursor-pointer"
          >
            Search by address instead
          </button>
        )}
      </div>
    );
  }

  // Search mode.
  return (
    <div className="space-y-1.5">
      <div ref={wrapperRef} className="relative">
        <Input
          id={id}
          value={searchInput}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => predictions.length > 0 && setOpen(true)}
          placeholder="Start typing a Victorian address…"
          autoComplete="off"
        />
        {open && predictions.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border bg-popover shadow-md">
            {predictions.map((p, i) => (
              <button
                key={p.placeId}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); selectPrediction(p); }}
                onMouseEnter={() => setActiveIdx(i)}
                className={cn(
                  "block w-full truncate px-3 py-2 text-left text-sm cursor-pointer",
                  i === activeIdx ? "bg-muted text-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                {p.description}
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
