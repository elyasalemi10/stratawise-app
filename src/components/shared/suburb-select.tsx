"use client";

import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

// Top Victorian suburbs/postcodes
const VIC_SUBURBS = [
  "Abbotsford 3067","Albert Park 3206","Alphington 3078","Altona 3018","Armadale 3143",
  "Ascot Vale 3032","Ashburton 3147","Ashwood 3147","Balwyn 3103","Balwyn North 3104",
  "Bayswater 3153","Beaumaris 3193","Bentleigh 3204","Bentleigh East 3165","Berwick 3806",
  "Black Rock 3193","Blackburn 3130","Blackburn North 3130","Blackburn South 3130",
  "Bonbeach 3196","Box Hill 3128","Box Hill North 3129","Box Hill South 3128",
  "Braeside 3195","Briar Hill 3088","Brighton 3186","Brighton East 3187",
  "Broadmeadows 3047","Brunswick 3056","Brunswick East 3057","Brunswick West 3055",
  "Bulleen 3105","Bundoora 3083","Burwood 3125","Burwood East 3151",
  "Camberwell 3124","Canterbury 3126","Carlton 3053","Carlton North 3054",
  "Carnegie 3163","Caroline Springs 3023","Caulfield 3162","Caulfield East 3145",
  "Caulfield North 3161","Caulfield South 3162","Chadstone 3148",
  "Chelsea 3196","Cheltenham 3192","Chirnside Park 3116","Clayton 3168",
  "Clayton South 3169","Clifton Hill 3068","Coburg 3058","Coburg North 3058",
  "Collingwood 3066","Craigieburn 3064","Cranbourne 3977","Cremorne 3121",
  "Dandenong 3175","Dandenong North 3175","Darebin 3070","Deer Park 3023",
  "Diamond Creek 3089","Dingley Village 3172","Docklands 3008","Doncaster 3108",
  "Doncaster East 3109","Donvale 3111","Doreen 3754","Doveton 3177",
  "East Melbourne 3002","Edithvale 3196","Elsternwick 3185","Eltham 3095",
  "Eltham North 3095","Elwood 3184","Endeavour Hills 3802","Epping 3076",
  "Essendon 3040","Essendon North 3041","Fairfield 3078","Fawkner 3060",
  "Ferntree Gully 3156","Fitzroy 3065","Fitzroy North 3068","Flemington 3031",
  "Footscray 3011","Forest Hill 3131","Frankston 3199","Frankston North 3200",
  "Frankston South 3199","Glen Huntly 3163","Glen Iris 3146","Glen Waverley 3150",
  "Glenroy 3046","Greensborough 3088","Greenvale 3059","Hawthorn 3122",
  "Hawthorn East 3123","Heidelberg 3084","Heidelberg Heights 3081",
  "Heidelberg West 3081","Highett 3190","Hoppers Crossing 3029",
  "Hughesdale 3166","Huntingdale 3166","Ivanhoe 3079","Ivanhoe East 3079",
  "Keilor 3036","Keilor Downs 3038","Keilor East 3033","Kensington 3031",
  "Kew 3101","Kew East 3102","Keysborough 3173","Kilsyth 3137",
  "Knoxfield 3180","Kooyong 3144","Lalor 3075","Laverton 3028",
  "Lower Plenty 3093","Lysterfield 3156","Macleod 3085","Malvern 3144",
  "Malvern East 3145","Maribyrnong 3032","Melbourne 3000","Melbourne CBD 3000",
  "Mentone 3194","Mernda 3754","Middle Park 3206","Mill Park 3082",
  "Mitcham 3132","Mont Albert 3127","Mont Albert North 3129",
  "Montmorency 3094","Moonee Ponds 3039","Moorabbin 3189",
  "Mooroolbark 3138","Mordialloc 3195","Mornington 3931",
  "Mount Waverley 3149","Mulgrave 3170","Murrumbeena 3163",
  "Narre Warren 3805","Narre Warren North 3804","Newport 3015",
  "Niddrie 3042","Noble Park 3174","Noble Park North 3174",
  "North Melbourne 3051","Northcote 3070","Notting Hill 3168",
  "Nunawading 3131","Oak Park 3046","Oakleigh 3166","Oakleigh East 3166",
  "Oakleigh South 3167","Ormond 3204","Pakenham 3810",
  "Parkdale 3195","Parkville 3052","Pascoe Vale 3044","Pascoe Vale South 3044",
  "Patterson Lakes 3197","Point Cook 3030","Port Melbourne 3207",
  "Prahran 3181","Preston 3072","Reservoir 3073","Richmond 3121",
  "Ringwood 3134","Ringwood East 3135","Ringwood North 3134",
  "Ripponlea 3185","Rosanna 3084","Rowville 3178","Sandringham 3191",
  "Scoresby 3179","Seaholme 3018","Seddon 3011","South Melbourne 3205",
  "South Morang 3752","South Yarra 3141","Southbank 3006",
  "Spotswood 3015","Springvale 3171","Springvale South 3172",
  "St Albans 3021","St Kilda 3182","St Kilda East 3183","St Kilda West 3182",
  "Strathmore 3041","Sunshine 3020","Sunshine North 3020",
  "Sunshine West 3020","Surrey Hills 3127","Tarneit 3029",
  "Templestowe 3106","Templestowe Lower 3107","Thornbury 3071",
  "Toorak 3142","Truganina 3029","Tullamarine 3043",
  "Vermont 3133","Vermont South 3133","Viewbank 3084",
  "Wantirna 3152","Wantirna South 3152","Warrandyte 3113",
  "Waterways 3195","Watsonia 3087","Werribee 3030",
  "West Footscray 3012","West Melbourne 3003","Wheelers Hill 3150",
  "Williamstown 3016","Windsor 3181","Wollert 3750",
  "Wyndham Vale 3024","Yarraville 3013",
  "Ballarat 3350","Bendigo 3550","Geelong 3220","Geelong West 3218",
  "Lara 3212","Leopold 3224","Mildura 3500","Shepparton 3630",
  "Traralgon 3844","Wangaratta 3677","Warrnambool 3280","Wodonga 3690",
];

interface SuburbSelectProps {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  id?: string;
}

export function SuburbSelect({ value, onChange, error, id }: SuburbSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearch(value);
  }, [value]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = search
    ? VIC_SUBURBS.filter((s) =>
        s.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 50)
    : VIC_SUBURBS.slice(0, 50);

  function handleSelect(suburb: string) {
    onChange(suburb);
    setSearch(suburb);
    setOpen(false);
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Input
          id={id}
          placeholder="Search suburb or postcode..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
            if (!e.target.value) onChange("");
          }}
          onFocus={() => setOpen(true)}
          className={cn("pr-8", error && "border-destructive")}
          autoComplete="off"
        />
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          <ScrollArea className="h-48">
            <div className="p-1">
              {filtered.map((suburb) => (
                <button
                  key={suburb}
                  type="button"
                  onClick={() => handleSelect(suburb)}
                  className={cn(
                    "flex w-full items-center rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-muted text-left",
                    value === suburb && "bg-primary/5 text-primary"
                  )}
                >
                  {suburb}
                  {value === suburb && (
                    <Check className="ml-auto h-4 w-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
