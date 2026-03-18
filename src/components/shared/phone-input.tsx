"use client";

import { useState, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  const [selectedCode, setSelectedCode] = useState(countryCodes[0]);
  const [localNumber, setLocalNumber] = useState("");

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

  function handleSelect(country: typeof countryCodes[0]) {
    setSelectedCode(country);
    onChange(`${country.code} ${localNumber}`);
  }

  function handleNumberChange(num: string) {
    setLocalNumber(num);
    onChange(`${selectedCode.code} ${num}`);
  }

  return (
    <div className="flex gap-0">
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-l-md rounded-r-none border border-r-0 border-border bg-background px-2.5 text-sm transition-colors hover:bg-muted outline-none",
            error && "border-destructive"
          )}
        >
          <span className="text-base leading-none">{selectedCode.flag}</span>
          <span className="text-muted-foreground">{selectedCode.code}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <ScrollArea className="h-64">
            {countryCodes.map((country) => (
              <DropdownMenuItem
                key={country.code + country.country}
                onClick={() => handleSelect(country)}
              >
                <span className="text-base leading-none mr-2">{country.flag}</span>
                <span className="flex-1">{country.label}</span>
                <span className="text-muted-foreground text-sm">{country.code}</span>
                {selectedCode.code === country.code && (
                  <Check className="ml-2 h-4 w-4 text-primary" />
                )}
              </DropdownMenuItem>
            ))}
          </ScrollArea>
        </DropdownMenuContent>
      </DropdownMenu>

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
