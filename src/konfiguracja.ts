import { BladEstiCRM } from "./typy.js";

export const DOMYSLNY_LIMIT_CZASU_MS = 15_000;
export const DOMYSLNY_ODSTEP_ZADAN_MS = 1_100;
export const DOMYSLNY_MAKSYMALNY_ROZMIAR_ODPOWIEDZI_BAJTY = 2 * 1024 * 1024;
export const DOMYSLNA_MAKSYMALNA_LICZBA_AKTYWNYCH_ZADAN = 25;

export interface KonfiguracjaEstiCRM {
  readonly identyfikatorFirmy: string;
  readonly tokenApi: string;
  readonly zapisyWlaczone: boolean;
  readonly limitCzasuMs: number;
  readonly odstepZadanMs: number;
  readonly maksymalnyRozmiarOdpowiedziBajty: number;
  readonly maksymalnaLiczbaAktywnychZadan: number;
}

type Srodowisko = Readonly<Record<string, string | undefined>>;

function wymaganaWartosc(srodowisko: Srodowisko, nazwa: string): string {
  const wartosc = srodowisko[nazwa]?.trim();

  if (!wartosc) {
    throw new BladEstiCRM(
      `Brakuje wymaganej zmiennej środowiskowej ${nazwa}.`,
      "KONFIGURACJA",
    );
  }

  return wartosc;
}

function liczbaCalkowita(
  srodowisko: Srodowisko,
  nazwa: string,
  wartoscDomyslna: number,
  minimum: number,
): number {
  const tekst = srodowisko[nazwa]?.trim();
  if (tekst === undefined || tekst === "") {
    return wartoscDomyslna;
  }

  const wartosc = Number(tekst);
  if (!Number.isSafeInteger(wartosc) || wartosc < minimum) {
    throw new BladEstiCRM(
      `Zmienna ${nazwa} musi być liczbą całkowitą nie mniejszą niż ${minimum}.`,
      "KONFIGURACJA",
    );
  }

  return wartosc;
}

function flagaZapisow(srodowisko: Srodowisko): boolean {
  const tekst = srodowisko.ESTICRM_ENABLE_WRITES?.trim().toLocaleLowerCase("pl-PL");

  if (tekst === undefined || tekst === "" || tekst === "false" || tekst === "0" || tekst === "nie") {
    return false;
  }

  if (tekst === "true" || tekst === "1" || tekst === "tak") {
    return true;
  }

  throw new BladEstiCRM(
    "Zmienna ESTICRM_ENABLE_WRITES musi mieć wartość true/false, 1/0 albo tak/nie.",
    "KONFIGURACJA",
  );
}

/** Wczytuje i sprawdza konfigurację bez ujawniania wartości sekretów w błędach. */
export function wczytajKonfiguracje(
  srodowisko: Srodowisko = process.env,
): KonfiguracjaEstiCRM {
  const konfiguracja: KonfiguracjaEstiCRM = {
    identyfikatorFirmy: wymaganaWartosc(srodowisko, "ESTICRM_COMPANY_ID"),
    tokenApi: wymaganaWartosc(srodowisko, "ESTICRM_API_TOKEN"),
    zapisyWlaczone: flagaZapisow(srodowisko),
    limitCzasuMs: liczbaCalkowita(
      srodowisko,
      "ESTICRM_TIMEOUT_MS",
      DOMYSLNY_LIMIT_CZASU_MS,
      1,
    ),
    odstepZadanMs: liczbaCalkowita(
      srodowisko,
      "ESTICRM_REQUEST_INTERVAL_MS",
      DOMYSLNY_ODSTEP_ZADAN_MS,
      0,
    ),
    maksymalnyRozmiarOdpowiedziBajty: liczbaCalkowita(
      srodowisko,
      "ESTICRM_MAX_RESPONSE_BYTES",
      DOMYSLNY_MAKSYMALNY_ROZMIAR_ODPOWIEDZI_BAJTY,
      1_024,
    ),
    maksymalnaLiczbaAktywnychZadan: liczbaCalkowita(
      srodowisko,
      "ESTICRM_MAX_ACTIVE_REQUESTS",
      DOMYSLNA_MAKSYMALNA_LICZBA_AKTYWNYCH_ZADAN,
      1,
    ),
  };

  return Object.freeze(konfiguracja);
}
