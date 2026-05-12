"use client";

import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

// VIC, Australia–biased address autocomplete.
//
// Uses Google Maps Places JS API (AutocompleteSuggestion → returns formatted
// address). The key lives in NEXT_PUBLIC_GOOGLE_MAPS_API_KEY; if it's absent
// the component degrades to a plain Input so dev/preview environments don't
// hard-fail.
//
// We bias to ROUTE/PREMISE types with a viewport biased to Victoria.

interface PlacesAutocompleteProps {
  value: string;
  onChange: (formatted: string) => void;
  placeholder?: string;
  id?: string;
  invalid?: boolean;
  /** When false, the component renders a plain Input — useful for tests. */
  enabled?: boolean;
}

interface Prediction {
  placeId: string;
  description: string;
}

// Cached across instances so we don't re-bootstrap the SDK between mounts.
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
  if (!_placesPromise) {
    _placesPromise = importLibrary("places");
  }
  return _placesPromise;
}

export function PlacesAutocomplete({
  value,
  onChange,
  placeholder,
  id,
  invalid,
  enabled = true,
}: PlacesAutocompleteProps) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const tokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const serviceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load Google SDK once on mount
  useEffect(() => {
    const promise = loadPlaces();
    if (!promise) return;
    promise
      .then((places) => {
        serviceRef.current = new places.AutocompleteService();
        placesServiceRef.current = new places.PlacesService(
          document.createElement("div"),
        );
        tokenRef.current = new places.AutocompleteSessionToken();
      })
      .catch((err) => {
        console.error("Failed to load Google Places SDK:", err);
      });
  }, []);

  // Click outside closes the dropdown
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function fetchPredictions(input: string) {
    if (!serviceRef.current || input.length < 3) {
      setPredictions([]);
      setOpen(false);
      return;
    }
    serviceRef.current.getPlacePredictions(
      {
        input,
        sessionToken: tokenRef.current ?? undefined,
        componentRestrictions: { country: "au" },
        types: ["address"],
        // Bias to Victoria's bounding box
        locationBias: {
          north: -33.98,
          south: -39.16,
          west: 140.96,
          east: 149.98,
        },
      },
      (results, status) => {
        if (
          status !== google.maps.places.PlacesServiceStatus.OK ||
          !results
        ) {
          setPredictions([]);
          setOpen(false);
          return;
        }
        setPredictions(
          results.slice(0, 5).map((r) => ({
            placeId: r.place_id,
            description: r.description,
          })),
        );
        setActiveIdx(0);
        setOpen(true);
      },
    );
  }

  function handleInput(v: string) {
    onChange(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPredictions(v), 200);
  }

  function selectPrediction(p: Prediction) {
    if (!placesServiceRef.current) {
      onChange(p.description);
      setOpen(false);
      return;
    }
    placesServiceRef.current.getDetails(
      {
        placeId: p.placeId,
        fields: ["formatted_address"],
        sessionToken: tokenRef.current ?? undefined,
      },
      (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && place?.formatted_address) {
          onChange(place.formatted_address);
        } else {
          onChange(p.description);
        }
        setOpen(false);
        // Rotate the session token so the next search is a new billable session
        tokenRef.current = new google.maps.places.AutocompleteSessionToken();
      },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || predictions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, predictions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectPrediction(predictions[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // No key or disabled → degrade to a plain Input
  if (!enabled || !process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    return (
      <Input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
      />
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        id={id}
        type="text"
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => predictions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={invalid || undefined}
      />
      {open && predictions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border bg-popover shadow-md">
          {predictions.map((p, i) => (
            <button
              key={p.placeId}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                selectPrediction(p);
              }}
              onMouseEnter={() => setActiveIdx(i)}
              className={cn(
                "block w-full truncate px-3 py-2 text-left text-sm",
                i === activeIdx ? "bg-muted text-foreground" : "text-foreground hover:bg-muted",
              )}
            >
              {p.description}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
