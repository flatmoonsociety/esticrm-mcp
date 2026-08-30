import type { CallToolResult } from "@modelcontextprotocol/server";

import { BladEstiCRM, type WartoscJson } from "./typy.js";

export const DOMYSLNY_LIMIT_REKORDOW = 20;
export const MAKSYMALNY_LIMIT_REKORDOW = 50;

const MAKSYMALNA_GLEBOKOSC = 8;
const MAKSYMALNA_LICZBA_POL = 100;
const MAKSYMALNA_DLUGOSC_TEKSTU = 4_000;

const UKRYTA_WARTOSC = "[ukryto]";
const POMINIETA_WARTOSC = "[pominięto]";

const NAZWY_SEKRETOW = new Set([
  "authorization",
  "access_token",
  "cookie",
  "company",
  "haslo",
  "password",
  "secret",
  "token",
  "tokenapi",
  "api_token",
  "apikey",
  "api_key",
  "kluczapi",
  "klucz_api",
  "company_id",
  "identyfikatorfirmy",
  "identyfikator_firmy",
]);

const NAZWY_DANYCH_KONTAKTOWYCH = new Set([
  "adres",
  "address",
  "email",
  "e-mail",
  "mobile",
  "phone",
  "telefon",
]);

export interface OpcjeMinimalizacji {
  /** Maksymalna liczba elementów w każdej tablicy odpowiedzi. */
  readonly limitRekordow?: number;
  /** Domyślnie dane kontaktowe są zastępowane bezpiecznym znacznikiem. */
  readonly ukryjDaneKontaktowe?: boolean;
}

export interface ZminimalizowaneDane {
  readonly dane: WartoscJson;
  readonly obcieto: boolean;
}

export interface BezpiecznyBlad {
  readonly kod: string;
  readonly komunikat: string;
}

interface StanMinimalizacji {
  obcieto: boolean;
  readonly odwiedzone: WeakSet<object>;
}

function ujednoliconaNazwaPola(nazwa: string): string {
  return nazwa
    .normalize("NFKC")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLocaleLowerCase("pl-PL")
    .replace(/[.\s-]+/g, "_")
    .replace(/_+/g, "_");
}

function czySekret(nazwa: string): boolean {
  const klucz = ujednoliconaNazwaPola(nazwa);
  return (
    NAZWY_SEKRETOW.has(klucz) ||
    /(^|_)(token|secret|password|haslo|api_?key|klucz_?api|company_?id|identyfikator_?firmy)($|_)/u.test(klucz)
  );
}

function czyDaneKontaktowe(nazwa: string): boolean {
  const klucz = ujednoliconaNazwaPola(nazwa);
  return (
    NAZWY_DANYCH_KONTAKTOWYCH.has(klucz) ||
    /(^|_)(email|e_mail|phone|telefon|mobile|adres|address)($|_)/u.test(klucz)
  );
}

/** Usuwa sekrety z tekstów, w tym z parametrów zapytania w adresach URL. */
export function ukryjSekretyWTekscie(tekst: string): string {
  return tekst
    .replace(
      /([?&\s](?:token|api[_-]?key|authorization|password|haslo|company(?:[_-]?id)?)=)[^&#\s]*/giu,
      `$1${UKRYTA_WARTOSC}`,
    )
    .replace(
      /((?:token|api[_-]?key|authorization|password|haslo|company(?:[_-]?id)?)\s*[:=]\s*)[^,;\s]+/giu,
      `$1${UKRYTA_WARTOSC}`,
    );
}

function ograniczTekst(tekst: string, stan: StanMinimalizacji): string {
  const bezSekretow = ukryjSekretyWTekscie(tekst);
  if (bezSekretow.length <= MAKSYMALNA_DLUGOSC_TEKSTU) {
    return bezSekretow;
  }

  stan.obcieto = true;
  return `${bezSekretow.slice(0, MAKSYMALNA_DLUGOSC_TEKSTU)}… [obcięto]`;
}

function doBezpiecznegoJson(
  wartosc: unknown,
  opcje: Required<OpcjeMinimalizacji>,
  stan: StanMinimalizacji,
  glebokosc: number,
): WartoscJson {
  if (wartosc === null) {
    return null;
  }

  switch (typeof wartosc) {
    case "string":
      return ograniczTekst(wartosc, stan);
    case "number":
      return Number.isFinite(wartosc) ? wartosc : String(wartosc);
    case "boolean":
      return wartosc;
    case "bigint":
      return wartosc.toString();
    case "undefined":
    case "function":
    case "symbol":
      stan.obcieto = true;
      return POMINIETA_WARTOSC;
  }

  if (glebokosc >= MAKSYMALNA_GLEBOKOSC) {
    stan.obcieto = true;
    return "[pominięto zbyt głęboką strukturę]";
  }

  if (wartosc instanceof Date) {
    return wartosc.toISOString();
  }

  if (stan.odwiedzone.has(wartosc)) {
    stan.obcieto = true;
    return "[pominięto cykliczne odwołanie]";
  }

  stan.odwiedzone.add(wartosc);
  try {
    if (Array.isArray(wartosc)) {
      const elementy = wartosc.slice(0, opcje.limitRekordow);
      if (elementy.length < wartosc.length) {
        stan.obcieto = true;
      }

      return elementy.map((element) =>
        doBezpiecznegoJson(element, opcje, stan, glebokosc + 1),
      );
    }

    const obiekt = wartosc as Record<string, unknown>;
    const wynik: Record<string, WartoscJson> = {};
    let liczbaPol = 0;
    for (const nazwa in obiekt) {
      if (!Object.hasOwn(obiekt, nazwa)) {
        continue;
      }
      if (liczbaPol >= MAKSYMALNA_LICZBA_POL) {
        stan.obcieto = true;
        break;
      }
      liczbaPol += 1;
      const element = obiekt[nazwa];
      if (czySekret(nazwa)) {
        wynik[nazwa] = UKRYTA_WARTOSC;
      } else if (opcje.ukryjDaneKontaktowe && czyDaneKontaktowe(nazwa)) {
        wynik[nazwa] = UKRYTA_WARTOSC;
      } else {
        wynik[nazwa] = doBezpiecznegoJson(element, opcje, stan, glebokosc + 1);
      }
    }

    return wynik;
  } finally {
    stan.odwiedzone.delete(wartosc);
  }
}

/**
 * Zamienia nieznaną odpowiedź API na ograniczony, bezpieczny JSON.
 * Sekrety są ukrywane zawsze, również gdy pokazanie danych kontaktowych jest dozwolone.
 */
export function minimalizujDane(
  wartosc: unknown,
  opcje: OpcjeMinimalizacji = {},
): ZminimalizowaneDane {
  const limitRekordow = Math.min(
    Math.max(opcje.limitRekordow ?? DOMYSLNY_LIMIT_REKORDOW, 1),
    MAKSYMALNY_LIMIT_REKORDOW,
  );
  const pelneOpcje: Required<OpcjeMinimalizacji> = {
    limitRekordow,
    ukryjDaneKontaktowe: opcje.ukryjDaneKontaktowe ?? true,
  };
  const stan: StanMinimalizacji = {
    obcieto: false,
    odwiedzone: new WeakSet<object>(),
  };

  return {
    dane: doBezpiecznegoJson(wartosc, pelneOpcje, stan, 0),
    obcieto: stan.obcieto,
  };
}

/** Zwraca stabilny komunikat, który nie kopiuje sekretów ani odpowiedzi z API. */
export function bezpiecznyBlad(blad: unknown): BezpiecznyBlad {
  if (blad instanceof BladEstiCRM) {
    const komunikaty: Record<BladEstiCRM["kod"], string> = {
      KONFIGURACJA: "Konfiguracja EstiCRM jest niepełna lub nieprawidłowa.",
      ZAPIS_WYLACZONY: "Operacje zapisu w EstiCRM są wyłączone.",
      BRAK_UPRAWNIEN: "Konto EstiCRM nie ma uprawnień do tej operacji.",
      BLAD_API: "EstiCRM odrzucił operację.",
      BLAD_HTTP: "EstiCRM zwrócił nieoczekiwany błąd HTTP.",
      NIEPOPRAWNA_ODPOWIEDZ: "EstiCRM zwrócił odpowiedź w nieobsługiwanym formacie.",
      ZBYT_DUZA_ODPOWIEDZ: "Odpowiedź EstiCRM przekroczyła bezpieczny limit rozmiaru.",
      PRZECIAZENIE: "Serwer ma zbyt wiele aktywnych operacji EstiCRM.",
      PRZEKROCZONY_CZAS: "Przekroczono czas oczekiwania na odpowiedź EstiCRM.",
      BLAD_SIECI: "Nie udało się połączyć z EstiCRM.",
    };

    return { kod: blad.kod, komunikat: komunikaty[blad.kod] };
  }

  return {
    kod: "BLAD_WEWNETRZNY",
    komunikat: "Nie udało się wykonać operacji w EstiCRM.",
  };
}

function tekstWyniku(opis: string, dane: WartoscJson): string {
  return `${opis}\n\n${JSON.stringify(dane, null, 2)}`;
}

/** Tworzy zgodny z MCP wynik z tekstem dla człowieka i structuredContent dla klienta. */
export function wynikSukcesu(
  opis: string,
  wartosc: unknown,
  opcje: OpcjeMinimalizacji = {},
): CallToolResult {
  const { dane, obcieto } = minimalizujDane(wartosc, opcje);
  const structuredContent = {
    ok: true as const,
    opis,
    dane,
    metadane: {
      obcieto,
      limit_rekordow: Math.min(
        Math.max(opcje.limitRekordow ?? DOMYSLNY_LIMIT_REKORDOW, 1),
        MAKSYMALNY_LIMIT_REKORDOW,
      ),
    },
  };

  return {
    content: [{ type: "text", text: tekstWyniku(opis, dane) }],
    structuredContent,
  };
}

/** Tworzy kontrolowany błąd narzędzia bez danych uwierzytelniających. */
export function wynikBledu(blad: unknown): CallToolResult {
  const bezpieczny = bezpiecznyBlad(blad);
  const structuredContent = {
    ok: false as const,
    opis: bezpieczny.komunikat,
    blad: bezpieczny,
  };

  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `${bezpieczny.komunikat} (kod: ${bezpieczny.kod})`,
      },
    ],
    structuredContent,
  };
}
