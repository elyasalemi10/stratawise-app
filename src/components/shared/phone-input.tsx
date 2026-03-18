"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const countryCodes = [
  { code: "+61", country: "AU", flag: "🇦🇺", label: "Australia" },
  { code: "+64", country: "NZ", flag: "🇳🇿", label: "New Zealand" },
  { code: "+1", country: "US", flag: "🇺🇸", label: "United States" },
  { code: "+44", country: "GB", flag: "🇬🇧", label: "United Kingdom" },
  { code: "+91", country: "IN", flag: "🇮🇳", label: "India" },
  { code: "+86", country: "CN", flag: "🇨🇳", label: "China" },
  { code: "+81", country: "JP", flag: "🇯🇵", label: "Japan" },
  { code: "+65", country: "SG", flag: "🇸🇬", label: "Singapore" },
  { code: "+60", country: "MY", flag: "🇲🇾", label: "Malaysia" },
  { code: "+63", country: "PH", flag: "🇵🇭", label: "Philippines" },
  { code: "+62", country: "ID", flag: "🇮🇩", label: "Indonesia" },
  { code: "+66", country: "TH", flag: "🇹🇭", label: "Thailand" },
  { code: "+82", country: "KR", flag: "🇰🇷", label: "South Korea" },
  { code: "+49", country: "DE", flag: "🇩🇪", label: "Germany" },
  { code: "+33", country: "FR", flag: "🇫🇷", label: "France" },
];

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  id?: string;
}

export function PhoneInput({ value, onChange, error, id }: PhoneInputProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCode, setSelectedCode] = useState(countryCodes[0]);
  const [localNumber, setLocalNumber] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Parse initial value
  useEffect(() => {
    if (value) {
      const found = countryCodes.find((c) => value.startsWith(c.code));
      if (found) {
        setSelectedCode(found);
        setLocalNumber(value.slice(found.code.length).trim());
      } else {
        setLocalNumber(value);
      }
    }
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Focus search when opened
  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  function handleSelect(country: typeof countryCodes[0]) {
    setSelectedCode(country);
    setOpen(false);
    setSearch("");
    onChange(`${country.code} ${localNumber}`);
  }

  function handleNumberChange(num: string) {
    setLocalNumber(num);
    onChange(`${selectedCode.code} ${num}`);
  }

  const filtered = countryCodes.filter(
    (c) =>
      c.label.toLowerCase().includes(search.toLowerCase()) ||
      c.code.includes(search) ||
      c.country.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex gap-0" ref={dropdownRef}>
      {/* Country code selector */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-l-md border border-r-0 border-border bg-background px-2.5 text-sm transition-colors hover:bg-muted",
            error && "border-destructive"
          )}
        >
          <span className="text-base leading-none">{selectedCode.flag}</span>
          <span className="text-muted-foreground">{selectedCode.code}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>

        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-border bg-card shadow-lg">
            <div className="p-2">
              <input
                ref={searchRef}
                type="text"
                placeholder="Search country..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filtered.map((country) => (
                <button
                  key={country.code + country.country}
                  type="button"
                  onClick={() => handleSelect(country)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors",
                    selectedCode.code === country.code && "bg-primary/5 text-primary"
                  )}
                >
                  <span className="text-base leading-none">{country.flag}</span>
                  <span className="flex-1 text-left">{country.label}</span>
                  <span className="text-muted-foreground">{country.code}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">No results</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Phone number input */}
      <Input
        id={id}
        type="tel"
        placeholder="412 345 678"
        value={localNumber}
        onChange={(e) => handleNumberChange(e.target.value)}
        className={cn("rounded-l-none", error && "border-destructive")}
      />
    </div>
  );
}
