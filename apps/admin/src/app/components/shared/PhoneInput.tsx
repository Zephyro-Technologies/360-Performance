// Phone entry with a country selector.
//
// The dial code is PICKED, never typed, so every number reaches the DB in one
// canonical `+<dial> <national>` shape instead of the free-form mix ("0300…",
// "92300…", "+92-300-…") that hand-typed fields accumulate. The hint line tells
// the user how many digits are still owed for the country they chose.
//
// The stored value stays a plain string in the existing `phone` column — no
// schema change. Legacy values are parsed on open (see `nationalOf`), so editing
// an old record silently normalises it rather than mangling it.
import { useEffect, useState } from "react";
import { Input } from "@360/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@360/ui/select";
import { cn } from "@360/ui/utils";

export interface Country {
  iso: string;
  name: string;
  dial: string;
  /** Expected national digit count (the range covers countries with variable lengths). */
  min: number;
  max: number;
  example: string;
}

// Pakistan first (the default), then the markets this business actually buys
// from and sells to. Kept deliberately short — a 200-entry list is harder to use
// than a curated one, and "Other" is covered by picking the nearest dial code.
export const COUNTRIES: Country[] = [
  { iso: "PK", name: "Pakistan", dial: "92", min: 10, max: 10, example: "3001234567" },
  { iso: "AE", name: "United Arab Emirates", dial: "971", min: 9, max: 9, example: "501234567" },
  { iso: "AU", name: "Australia", dial: "61", min: 9, max: 9, example: "412345678" },
  { iso: "BH", name: "Bahrain", dial: "973", min: 8, max: 8, example: "36001234" },
  { iso: "CA", name: "Canada", dial: "1", min: 10, max: 10, example: "4161234567" },
  { iso: "CN", name: "China", dial: "86", min: 11, max: 11, example: "13012345678" },
  { iso: "DE", name: "Germany", dial: "49", min: 10, max: 11, example: "15112345678" },
  { iso: "HK", name: "Hong Kong", dial: "852", min: 8, max: 8, example: "51234567" },
  { iso: "IN", name: "India", dial: "91", min: 10, max: 10, example: "9812345678" },
  { iso: "JP", name: "Japan", dial: "81", min: 10, max: 10, example: "9012345678" },
  { iso: "KR", name: "South Korea", dial: "82", min: 9, max: 10, example: "1012345678" },
  { iso: "KW", name: "Kuwait", dial: "965", min: 8, max: 8, example: "50123456" },
  { iso: "MY", name: "Malaysia", dial: "60", min: 9, max: 10, example: "123456789" },
  { iso: "OM", name: "Oman", dial: "968", min: 8, max: 8, example: "92123456" },
  { iso: "QA", name: "Qatar", dial: "974", min: 8, max: 8, example: "33123456" },
  { iso: "SA", name: "Saudi Arabia", dial: "966", min: 9, max: 9, example: "501234567" },
  { iso: "SG", name: "Singapore", dial: "65", min: 8, max: 8, example: "81234567" },
  { iso: "TH", name: "Thailand", dial: "66", min: 9, max: 9, example: "812345678" },
  { iso: "TR", name: "Türkiye", dial: "90", min: 10, max: 10, example: "5301234567" },
  { iso: "TW", name: "Taiwan", dial: "886", min: 9, max: 9, example: "912345678" },
  { iso: "GB", name: "United Kingdom", dial: "44", min: 10, max: 10, example: "7400123456" },
  { iso: "US", name: "United States", dial: "1", min: 10, max: 10, example: "2125551234" },
];

const DEFAULT_ISO = "PK";
const byIso = (iso: string) => COUNTRIES.find((c) => c.iso === iso) ?? COUNTRIES[0];

/** Flag emoji from the ISO code — pure unicode, no image assets to ship. */
function flag(iso: string) {
  return String.fromCodePoint(...[...iso].map((ch) => 0x1f1a5 + ch.charCodeAt(0)));
}

/** Longest-prefix dial-code match, but only for values written internationally. */
function detect(raw: string): Country | null {
  if (!raw.trim().startsWith("+")) return null;
  const digits = raw.replace(/\D/g, "");
  return (
    [...COUNTRIES]
      .sort((a, b) => b.dial.length - a.dial.length)
      .find((c) => digits.startsWith(c.dial)) ?? null
  );
}

/**
 * The national part of a stored value, for the chosen country.
 *
 * A leading dial code is only stripped when the value was written as an
 * international number, or when what remains is a plausible national length —
 * otherwise a US number like "1234567890" would lose its first digit to the
 * "+1" dial code. Leading trunk zeros ("0300…") are dropped, since they are
 * never dialled together with a country code.
 */
function nationalOf(raw: string, country: Country): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith(country.dial)) {
    const rest = digits.slice(country.dial.length);
    if (raw.trim().startsWith("+") || (rest.length >= country.min && rest.length <= country.max)) {
      digits = rest;
    }
  }
  return digits.replace(/^0+/, "");
}

export function PhoneInput({
  value,
  onChange,
  id,
  autoFocus,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  id?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [iso, setIso] = useState(() => detect(value)?.iso ?? DEFAULT_ISO);

  // Dialogs reuse one mounted instance across records (the form is refilled on
  // open), so re-sync the country whenever an incoming value carries one.
  useEffect(() => {
    const found = detect(value);
    if (found && found.iso !== iso) setIso(found.iso);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- syncing FROM value only
  }, [value]);

  const country = byIso(iso);
  const national = nationalOf(value, country);

  // An empty field must emit "" and not "+92 ", or every skipped phone box would
  // save a junk dial-code-only number instead of null.
  function emit(nextIso: string, nextNational: string) {
    const c = byIso(nextIso);
    const digits = nextNational.replace(/\D/g, "").replace(/^0+/, "");
    onChange(digits ? `+${c.dial} ${digits}` : "");
  }

  const typed = national.length;
  const tooMany = typed > country.max;
  const hint =
    typed === 0
      ? `${country.min} digits after +${country.dial} — e.g. ${country.example}`
      : typed < country.min
        ? `${country.min - typed} more digit${country.min - typed === 1 ? "" : "s"}`
        : tooMany
          ? `${typed - country.max} digit${typed - country.max === 1 ? "" : "s"} too many`
          : "Looks complete";

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex gap-2">
        <Select value={iso} onValueChange={(next) => { setIso(next); emit(next, national); }}>
          <SelectTrigger className="w-[110px] shrink-0" aria-label="Country code">
            <span className="flex items-center gap-1.5">
              <span aria-hidden>{flag(country.iso)}</span>
              <span>+{country.dial}</span>
            </span>
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => (
              <SelectItem key={c.iso} value={c.iso}>
                <span className="flex items-center gap-2">
                  <span aria-hidden>{flag(c.iso)}</span>
                  <span>{c.name}</span>
                  <span className="text-muted-foreground">+{c.dial}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          id={id}
          autoFocus={autoFocus}
          inputMode="tel"
          className="flex-1"
          value={national}
          onChange={(e) => emit(iso, e.target.value)}
          placeholder={country.example}
        />
      </div>
      <p className={cn("text-xs", tooMany ? "text-[#cc0000]" : "text-muted-foreground")}>{hint}</p>
    </div>
  );
}
