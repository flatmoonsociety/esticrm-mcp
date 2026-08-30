import type { KonfiguracjaEstiCRM } from "./konfiguracja.js";
import {
  BladEstiCRM,
  type DaneTerminu,
  type DaneZapytania,
  type IdEstiCRM,
  type ObiektJson,
  type ParametrZapytania,
  type ParametryListyOfert,
  type PolskieDaneTerminu,
  type PolskieDaneZapytania,
  type WartoscJson,
  type ZakresKalendarza,
} from "./typy.js";

const ADRES_API = "https://client-api.esticrm.pl/apiClient";
const MAKSYMALNY_ZAKRES_KALENDARZA_MS = 31 * 24 * 60 * 60 * 1_000;
const MAKSYMALNA_GLEBOKOSC_SKANOWANIA_ODPOWIEDZI = 64;
const MAKSYMALNA_LICZBA_WEZLOW_SKANOWANIA = 50_000;

type ImplementacjaFetch = (
  wejscie: string | URL | Request,
  inicjalizacja?: RequestInit,
) => Promise<Response>;

interface OpcjeZadania {
  readonly metoda?: "GET" | "POST";
  readonly parametry?: Readonly<Record<string, ParametrZapytania>>;
  readonly dane?: ObiektJson;
  readonly pozwolNaNegatywnyWynik?: boolean;
}

type ParametryIdentyfikatora<Klucz extends string> = Record<Klucz, IdEstiCRM>;

interface ParametryLimitu {
  readonly limit?: number;
}

interface ParametryLokalizacji extends ParametryLimitu {
  readonly fraza: string;
}

interface ParametrySlownika {
  readonly nazwa?: string;
}

interface ParametryInwestycji extends ParametryLimitu {
  readonly fraza?: string;
}

function czyObiekt(wartosc: unknown): wartosc is Record<string, unknown> {
  return typeof wartosc === "object" && wartosc !== null && !Array.isArray(wartosc);
}

function bezPolskichZnakow(tekst: string): string {
  return tekst
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pl-PL");
}

function zawieraBrakUprawnien(wartosc: unknown): boolean {
  const kolejka: Array<{ readonly wartosc: unknown; readonly glebokosc: number }> = [
    { wartosc, glebokosc: 0 },
  ];
  let indeksNastepnego = 0;
  let odwiedzone = 0;

  while (
    indeksNastepnego < kolejka.length
    && odwiedzone < MAKSYMALNA_LICZBA_WEZLOW_SKANOWANIA
  ) {
    const element = kolejka[indeksNastepnego];
    if (!element) {
      break;
    }
    indeksNastepnego += 1;
    odwiedzone += 1;

    if (typeof element.wartosc === "string") {
      if (bezPolskichZnakow(element.wartosc).includes("brak uprawnien")) {
        return true;
      }
      continue;
    }

    if (element.glebokosc >= MAKSYMALNA_GLEBOKOSC_SKANOWANIA_ODPOWIEDZI) {
      continue;
    }

    const nastepnaGlebokosc = element.glebokosc + 1;
    if (Array.isArray(element.wartosc)) {
      for (const wartoscTablicy of element.wartosc) {
        if (
          odwiedzone + kolejka.length - indeksNastepnego
          >= MAKSYMALNA_LICZBA_WEZLOW_SKANOWANIA
        ) {
          break;
        }
        kolejka.push({ wartosc: wartoscTablicy, glebokosc: nastepnaGlebokosc });
      }
    } else if (czyObiekt(element.wartosc)) {
      for (const nazwaPola in element.wartosc) {
        if (!Object.hasOwn(element.wartosc, nazwaPola)) {
          continue;
        }
        if (
          odwiedzone + kolejka.length - indeksNastepnego
          >= MAKSYMALNA_LICZBA_WEZLOW_SKANOWANIA
        ) {
          break;
        }
        kolejka.push({
          wartosc: element.wartosc[nazwaPola],
          glebokosc: nastepnaGlebokosc,
        });
      }
    }
  }

  return false;
}

function milisekundyDatyICzasu(wartosc: string): number {
  const dopasowanie = wartosc.match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/,
  );
  if (!dopasowanie) {
    return Number.NaN;
  }

  const [, rok, miesiac, dzien, godzina, minuta, sekunda] = dopasowanie;
  return Date.UTC(
    Number(rok),
    Number(miesiac) - 1,
    Number(dzien),
    Number(godzina),
    Number(minuta),
    Number(sekunda),
  );
}

function przerwaneZadanie(): DOMException {
  return new DOMException("Przerwano oczekiwanie.", "AbortError");
}

async function odczekajZSygnalem(
  milisekundy: number,
  sygnal: AbortSignal,
): Promise<void> {
  if (sygnal.aborted) {
    throw przerwaneZadanie();
  }

  await new Promise<void>((rozwiaz, odrzuc) => {
    const zakoncz = (): void => {
      sygnal.removeEventListener("abort", przerwij);
      rozwiaz();
    };
    const przerwij = (): void => {
      clearTimeout(licznik);
      sygnal.removeEventListener("abort", przerwij);
      odrzuc(przerwaneZadanie());
    };
    const licznik = setTimeout(zakoncz, milisekundy);
    sygnal.addEventListener("abort", przerwij, { once: true });
  });
}

async function odczekajNaObietniceZSygnalem(
  obietnica: Promise<void>,
  sygnal: AbortSignal,
): Promise<void> {
  if (sygnal.aborted) {
    throw przerwaneZadanie();
  }

  let przerwij = (): void => undefined;
  const przerwanie = new Promise<never>((_rozwiaz, odrzuc) => {
    przerwij = (): void => odrzuc(przerwaneZadanie());
    sygnal.addEventListener("abort", przerwij, { once: true });
  });

  try {
    await Promise.race([obietnica, przerwanie]);
  } finally {
    sygnal.removeEventListener("abort", przerwij);
  }
}

async function anulujCialoOdpowiedzi(odpowiedz: Response): Promise<void> {
  await odpowiedz.body?.cancel().catch(() => undefined);
}

async function odczytajOgraniczonyJson(
  odpowiedz: Response,
  maksymalnaLiczbaBajtow: number,
  sygnal: AbortSignal,
): Promise<unknown> {
  const dlugoscNaglowka = odpowiedz.headers.get("content-length");
  if (dlugoscNaglowka !== null) {
    const deklarowanaDlugosc = Number(dlugoscNaglowka);
    if (
      Number.isSafeInteger(deklarowanaDlugosc)
      && deklarowanaDlugosc > maksymalnaLiczbaBajtow
    ) {
      await anulujCialoOdpowiedzi(odpowiedz);
      throw new BladEstiCRM(
        "Odpowiedź EstiCRM przekroczyła bezpieczny limit rozmiaru.",
        "ZBYT_DUZA_ODPOWIEDZ",
      );
    }
  }

  if (!odpowiedz.body) {
    throw new SyntaxError("Brak ciała odpowiedzi JSON.");
  }

  const czytnik = odpowiedz.body.getReader();
  const fragmenty: Uint8Array[] = [];
  let liczbaBajtow = 0;
  let przerwano = sygnal.aborted;
  const przerwij = (): void => {
    przerwano = true;
    void czytnik.cancel().catch(() => undefined);
  };
  sygnal.addEventListener("abort", przerwij, { once: true });

  try {
    while (true) {
      if (przerwano) {
        throw przerwaneZadanie();
      }

      const { done, value } = await czytnik.read();
      if (przerwano) {
        throw przerwaneZadanie();
      }
      if (done) {
        break;
      }

      liczbaBajtow += value.byteLength;
      if (liczbaBajtow > maksymalnaLiczbaBajtow) {
        await czytnik.cancel().catch(() => undefined);
        throw new BladEstiCRM(
          "Odpowiedź EstiCRM przekroczyła bezpieczny limit rozmiaru.",
          "ZBYT_DUZA_ODPOWIEDZ",
        );
      }
      fragmenty.push(value);
    }
  } finally {
    sygnal.removeEventListener("abort", przerwij);
    czytnik.releaseLock();
  }

  const polaczone = new Uint8Array(liczbaBajtow);
  let przesuniecie = 0;
  for (const fragment of fragmenty) {
    polaczone.set(fragment, przesuniecie);
    przesuniecie += fragment.byteLength;
  }

  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(polaczone)) as unknown;
}

function idZArgumentu<Klucz extends string>(
  argument: IdEstiCRM | ParametryIdentyfikatora<Klucz>,
  klucz: Klucz,
): IdEstiCRM {
  return czyObiekt(argument) ? (argument[klucz] as IdEstiCRM) : argument;
}

function sprawdzLimit(limit: number | undefined): number | undefined {
  if (limit === undefined) {
    return undefined;
  }

  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new BladEstiCRM(
      "Limit wyników musi być dodatnią liczbą całkowitą.",
      "KONFIGURACJA",
    );
  }

  return limit;
}

function ograniczWyniki(wartosc: WartoscJson, limit: number | undefined): WartoscJson {
  const poprawnyLimit = sprawdzLimit(limit);
  if (poprawnyLimit === undefined) {
    return wartosc;
  }

  if (Array.isArray(wartosc)) {
    return wartosc.slice(0, poprawnyLimit);
  }

  if (czyObiekt(wartosc) && Array.isArray(wartosc.data)) {
    return { ...wartosc, data: wartosc.data.slice(0, poprawnyLimit) } as WartoscJson;
  }

  if (czyObiekt(wartosc) && typeof wartosc.data === "string") {
    return {
      ...wartosc,
      data: wartosc.data.split(",").slice(0, poprawnyLimit).join(","),
    } as WartoscJson;
  }

  return wartosc;
}

function wybierzZeSlownika(
  wartosc: WartoscJson,
  nazwa: string | undefined,
): WartoscJson {
  if (!nazwa || !czyObiekt(wartosc)) {
    return wartosc;
  }

  const wybranaWartosc = wartosc[nazwa];
  return (wybranaWartosc ?? null) as WartoscJson;
}

function rozdzielDateICzas(wartosc: string): readonly [string, string] {
  const dopasowanie = wartosc.trim().match(
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/,
  );

  if (!dopasowanie?.[1] || !dopasowanie[2] || !czyPoprawnaDataICzas(`${dopasowanie[1]} ${dopasowanie[2]}:00`)) {
    throw new BladEstiCRM(
      "Data terminu musi mieć format RRRR-MM-DD GG:MM.",
      "KONFIGURACJA",
    );
  }

  return [dopasowanie[1], dopasowanie[2]];
}

function czyPoprawnaDataICzas(wartosc: string): boolean {
  const dopasowanie = wartosc.match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/,
  );
  if (!dopasowanie) {
    return false;
  }

  const [, rokTekst, miesiacTekst, dzienTekst, godzinaTekst, minutaTekst, sekundaTekst] = dopasowanie;
  const rok = Number(rokTekst);
  const miesiac = Number(miesiacTekst);
  const dzien = Number(dzienTekst);
  const godzina = Number(godzinaTekst);
  const minuta = Number(minutaTekst);
  const sekunda = Number(sekundaTekst);
  const data = new Date(Date.UTC(rok, miesiac - 1, dzien, godzina, minuta, sekunda));

  return data.getUTCFullYear() === rok
    && data.getUTCMonth() === miesiac - 1
    && data.getUTCDate() === dzien
    && data.getUTCHours() === godzina
    && data.getUTCMinutes() === minuta
    && data.getUTCSeconds() === sekunda;
}

function sprawdzDateZakresu(wartosc: string | undefined, nazwa: string): string {
  if (!wartosc || !czyPoprawnaDataICzas(wartosc)) {
    throw new BladEstiCRM(
      `${nazwa} musi mieć format RRRR-MM-DD GG:MM:SS i wskazywać poprawną datę.`,
      "KONFIGURACJA",
    );
  }

  return wartosc;
}

/**
 * Klient oficjalnego APIClient EstiCRM. Adres bazowy API jest stały, a dane
 * uwierzytelniające nigdy nie są dołączane do komunikatów błędów.
 */
export class KlientEstiCRM {
  private readonly konfiguracja: KonfiguracjaEstiCRM;
  private readonly wykonajFetch: ImplementacjaFetch;
  private najwczesniejszyStart = 0;
  private kolejkaStartow: Promise<void> = Promise.resolve();
  private liczbaAktywnychZadan = 0;

  public constructor(
    konfiguracja: KonfiguracjaEstiCRM,
    wykonajFetch: ImplementacjaFetch = globalThis.fetch,
  ) {
    this.konfiguracja = konfiguracja;
    this.wykonajFetch = wykonajFetch;
  }

  public async listaOfert(parametry: ParametryListyOfert = {}): Promise<WartoscJson> {
    const limit = sprawdzLimit(parametry.limit ?? parametry.take ?? 10);
    const strona = parametry.strona ?? 1;
    if (!Number.isSafeInteger(strona) || strona < 1) {
      throw new BladEstiCRM(
        "Numer strony musi być dodatnią liczbą całkowitą.",
        "KONFIGURACJA",
      );
    }

    const skip = parametry.skip ?? (strona - 1) * (limit ?? 10);
    return this.zadanie("offer/list", {
      parametry: {
        skip,
        take: limit,
      },
    });
  }

  public szczegolyOferty(
    argument: IdEstiCRM | ParametryIdentyfikatora<"idOferty">,
  ): Promise<WartoscJson> {
    return this.zadanie("offer/details", {
      parametry: { id: idZArgumentu(argument, "idOferty") },
    });
  }

  public klient(
    argument: IdEstiCRM | ParametryIdentyfikatora<"idKlienta">,
  ): Promise<WartoscJson> {
    return this.zadanie("client/get", {
      parametry: { id: idZArgumentu(argument, "idKlienta") },
    });
  }

  public async ofertyKlienta(
    argument:
      | IdEstiCRM
      | (ParametryIdentyfikatora<"idKlienta"> & ParametryLimitu),
  ): Promise<WartoscJson> {
    const odpowiedz = await this.zadanie("client/offer-list", {
      parametry: { id: idZArgumentu(argument, "idKlienta") },
    });
    const limit = czyObiekt(argument) ? (argument.limit as number | undefined) : undefined;
    return ograniczWyniki(odpowiedz, limit);
  }

  public async listaAgentow(parametry: ParametryLimitu = {}): Promise<WartoscJson> {
    return ograniczWyniki(
      await this.zadanie("user/list"),
      parametry.limit,
    );
  }

  public async wyszukajLokalizacje(
    argument: string | ParametryLokalizacji,
  ): Promise<WartoscJson> {
    const fraza = typeof argument === "string" ? argument : argument.fraza;
    const limit = typeof argument === "string" ? undefined : argument.limit;
    return ograniczWyniki(
      await this.zadanie("desktop/location", { parametry: { phrase: fraza } }),
      limit,
    );
  }

  public async slownikOfert(parametry: ParametrySlownika = {}): Promise<WartoscJson> {
    return wybierzZeSlownika(
      await this.zadanie("offer/dictionary"),
      parametry.nazwa,
    );
  }

  public async mapowanieOfert(parametry: ParametrySlownika = {}): Promise<WartoscJson> {
    return wybierzZeSlownika(
      await this.zadanie("offer/mapping"),
      parametry.nazwa,
    );
  }

  public async slownikSystemowy(parametry: ParametrySlownika = {}): Promise<WartoscJson> {
    return wybierzZeSlownika(
      await this.zadanie("desktop/dictionary"),
      parametry.nazwa,
    );
  }

  public sprawdzTermin(parametry: ZakresKalendarza): Promise<WartoscJson> {
    const zakres = this.parametryZakresu(parametry);
    return this.zadanie("calendar/check-term", {
      parametry: zakres,
      pozwolNaNegatywnyWynik: true,
    });
  }

  public async wydarzeniaKalendarza(
    parametry: ZakresKalendarza,
  ): Promise<WartoscJson> {
    return ograniczWyniki(
      await this.zadanie("calendar/events-by-range", {
        parametry: this.parametryZakresu(parametry),
      }),
      parametry.limit,
    );
  }

  public async listaInwestycji(
    parametry: ParametryInwestycji = {},
  ): Promise<WartoscJson> {
    const odpowiedz = await this.zadanie("investment/list");
    const fraza = parametry.fraza?.trim().toLocaleLowerCase("pl-PL");
    const przefiltrowane = fraza
      ? this.filtrujListe(odpowiedz, fraza)
      : odpowiedz;
    return ograniczWyniki(przefiltrowane, parametry.limit);
  }

  public async listaBiur(parametry: ParametryLimitu = {}): Promise<WartoscJson> {
    return ograniczWyniki(
      await this.zadanie("office/list"),
      parametry.limit,
    );
  }

  public async utworzZapytanie(
    dane: DaneZapytania | PolskieDaneZapytania,
  ): Promise<WartoscJson> {
    this.wymagajZapisow();
    return this.zadanie("question/store", {
      metoda: "POST",
      dane: this.daneZapytania(dane),
    });
  }

  public async utworzTermin(
    dane: DaneTerminu | PolskieDaneTerminu,
  ): Promise<WartoscJson> {
    this.wymagajZapisow();
    return this.zadanie("calendar/store", {
      metoda: "POST",
      dane: this.daneTerminu(dane),
    });
  }

  private async zadanie(
    sciezka: string,
    opcje: OpcjeZadania = {},
  ): Promise<WartoscJson> {
    if (
      this.liczbaAktywnychZadan
      >= this.konfiguracja.maksymalnaLiczbaAktywnychZadan
    ) {
      throw new BladEstiCRM(
        "Lokalny serwer MCP ma zbyt wiele oczekujących zadań EstiCRM.",
        "PRZECIAZENIE",
      );
    }
    this.liczbaAktywnychZadan += 1;

    const kontroler = new AbortController();
    const licznikCzasu = setTimeout(
      () => kontroler.abort(),
      this.konfiguracja.limitCzasuMs,
    );

    try {
      await this.odczekajNaLimit(kontroler.signal);

      const adres = new URL(`${ADRES_API}/${sciezka}`);
      adres.searchParams.set("company", this.konfiguracja.identyfikatorFirmy);
      adres.searchParams.set("token", this.konfiguracja.tokenApi);

      for (const [klucz, wartosc] of Object.entries(opcje.parametry ?? {})) {
        if (wartosc !== undefined && wartosc !== null && wartosc !== "") {
          adres.searchParams.set(klucz, String(wartosc));
        }
      }

      let odpowiedz: Response;
      try {
        odpowiedz = await this.wykonajFetch(adres, {
          method: opcje.metoda ?? "GET",
          headers: {
            Accept: "application/json",
            ...(opcje.metoda === "POST" ? { "Content-Type": "application/json" } : {}),
          },
          body: opcje.metoda === "POST" ? JSON.stringify(opcje.dane ?? {}) : undefined,
          signal: kontroler.signal,
          redirect: "error",
        });
      } catch {
        if (kontroler.signal.aborted) {
          throw new BladEstiCRM(
            "Przekroczono limit czasu połączenia z EstiCRM.",
            "PRZEKROCZONY_CZAS",
          );
        }

        throw new BladEstiCRM(
          "Nie udało się połączyć z EstiCRM.",
          "BLAD_SIECI",
        );
      }

      if (!odpowiedz.ok) {
        await anulujCialoOdpowiedzi(odpowiedz);
        throw new BladEstiCRM(
          `EstiCRM zwrócił błąd HTTP ${odpowiedz.status}.`,
          "BLAD_HTTP",
          odpowiedz.status,
        );
      }

      let tresc: unknown;
      try {
        tresc = await odczytajOgraniczonyJson(
          odpowiedz,
          this.konfiguracja.maksymalnyRozmiarOdpowiedziBajty,
          kontroler.signal,
        );
      } catch (blad: unknown) {
        if (blad instanceof BladEstiCRM) {
          throw blad;
        }
        if (kontroler.signal.aborted) {
          throw new BladEstiCRM(
            "Przekroczono limit czasu połączenia z EstiCRM.",
            "PRZEKROCZONY_CZAS",
          );
        }
        throw new BladEstiCRM(
          "EstiCRM zwrócił odpowiedź, która nie jest poprawnym JSON-em.",
          "NIEPOPRAWNA_ODPOWIEDZ",
        );
      }

      if (zawieraBrakUprawnien(tresc)) {
        throw new BladEstiCRM(
          "EstiCRM odmówił dostępu do tej operacji.",
          "BRAK_UPRAWNIEN",
        );
      }

      if (
        czyObiekt(tresc)
        && (
          tresc.success === false
          || (!opcje.pozwolNaNegatywnyWynik && tresc.result === false)
        )
      ) {
        throw new BladEstiCRM(
          "EstiCRM odrzucił operację.",
          "BLAD_API",
        );
      }

      return tresc as WartoscJson;
    } catch (blad: unknown) {
      if (blad instanceof BladEstiCRM) {
        throw blad;
      }
      if (kontroler.signal.aborted) {
        throw new BladEstiCRM(
          "Przekroczono limit czasu połączenia z EstiCRM.",
          "PRZEKROCZONY_CZAS",
        );
      }
      throw new BladEstiCRM(
        "Nie udało się połączyć z EstiCRM.",
        "BLAD_SIECI",
      );
    } finally {
      clearTimeout(licznikCzasu);
      this.liczbaAktywnychZadan -= 1;
    }
  }

  private async odczekajNaLimit(sygnal: AbortSignal): Promise<void> {
    let zwolnijKolejke = (): void => undefined;
    const mojaKolej = new Promise<void>((rozwiaz) => {
      zwolnijKolejke = rozwiaz;
    });
    const poprzedniaKolej = this.kolejkaStartow;
    this.kolejkaStartow = poprzedniaKolej.then(
      () => mojaKolej,
      () => mojaKolej,
    );

    try {
      await odczekajNaObietniceZSygnalem(poprzedniaKolej, sygnal);

      const oczekiwanie = Math.max(0, this.najwczesniejszyStart - Date.now());
      if (oczekiwanie > 0) {
        await odczekajZSygnalem(oczekiwanie, sygnal);
      } else if (sygnal.aborted) {
        throw przerwaneZadanie();
      }

      this.najwczesniejszyStart = Date.now() + this.konfiguracja.odstepZadanMs;
    } finally {
      zwolnijKolejke();
    }
  }

  private wymagajZapisow(): void {
    if (!this.konfiguracja.zapisyWlaczone) {
      throw new BladEstiCRM(
        "Operacje zapisu są wyłączone. Ustaw ESTICRM_ENABLE_WRITES=true, aby je włączyć.",
        "ZAPIS_WYLACZONY",
      );
    }
  }

  private parametryZakresu(
    parametry: ZakresKalendarza,
  ): Record<string, ParametrZapytania> {
    const start = sprawdzDateZakresu(
      parametry.start ?? parametry.dataOd,
      "Początek zakresu kalendarza",
    );
    const end = sprawdzDateZakresu(
      parametry.end ?? parametry.dataDo,
      "Koniec zakresu kalendarza",
    );
    const calendar = parametry.calendar
      ?? parametry.kalendarz
      ?? parametry.emailAgenta;

    if (calendar === undefined || calendar === "") {
      throw new BladEstiCRM(
        "Zakres kalendarza wymaga kalendarza agenta.",
        "KONFIGURACJA",
      );
    }

    const poczatekMs = milisekundyDatyICzasu(start);
    const koniecMs = milisekundyDatyICzasu(end);
    if (koniecMs <= poczatekMs) {
      throw new BladEstiCRM(
        "Koniec zakresu kalendarza musi być późniejszy niż jego początek.",
        "KONFIGURACJA",
      );
    }
    if (koniecMs - poczatekMs > MAKSYMALNY_ZAKRES_KALENDARZA_MS) {
      throw new BladEstiCRM(
        "Zakres kalendarza nie może przekraczać 31 dni.",
        "KONFIGURACJA",
      );
    }

    return { start, end, calendar };
  }

  private daneZapytania(dane: DaneZapytania | PolskieDaneZapytania): ObiektJson {
    if ("wiadomosc" in dane) {
      const polskieDane = dane as PolskieDaneZapytania;
      return {
        agent_email: polskieDane.emailAgenta,
        transaction: polskieDane.transakcja,
        market: polskieDane.rynek,
        type_id: polskieDane.idTypu,
        firstname: polskieDane.imie,
        lastname: polskieDane.nazwisko,
        email: polskieDane.email,
        phone: polskieDane.telefon,
        content: polskieDane.wiadomosc,
        ...(polskieDane.numerOferty !== undefined
          ? { offer_number: polskieDane.numerOferty }
          : {}),
      };
    }

    return { ...dane };
  }

  private daneTerminu(dane: DaneTerminu | PolskieDaneTerminu): ObiektJson {
    if ("tytul" in dane) {
      const polskieDane = dane as PolskieDaneTerminu;
      const [dataPoczatkowa, czasPoczatkowy] = rozdzielDateICzas(polskieDane.dataOd);
      const [dataKoncowa, czasKoncowy] = rozdzielDateICzas(polskieDane.dataDo);
      const poczatekMs = milisekundyDatyICzasu(`${dataPoczatkowa} ${czasPoczatkowy}:00`);
      const koniecMs = milisekundyDatyICzasu(`${dataKoncowa} ${czasKoncowy}:00`);
      if (koniecMs <= poczatekMs) {
        throw new BladEstiCRM(
          "Koniec terminu musi być późniejszy niż jego początek.",
          "KONFIGURACJA",
        );
      }
      const calendar = polskieDane.kalendarz
        ?? polskieDane.emailAgenta;

      if (calendar === undefined || calendar === "") {
        throw new BladEstiCRM(
          "Utworzenie terminu wymaga kalendarza agenta.",
          "KONFIGURACJA",
        );
      }

      return {
        type: polskieDane.typ ?? 1,
        name: polskieDane.tytul,
        begin_date: dataPoczatkowa,
        begin_time: czasPoczatkowy,
        end_date: dataKoncowa,
        end_time: czasKoncowy,
        calendar,
        description: polskieDane.opis ?? "",
        allday: polskieDane.calyDzien ? 1 : 0,
        ...(polskieDane.numerOferty !== undefined
          ? { offer_number: polskieDane.numerOferty }
          : {}),
        ...(polskieDane.daneKlienta
          ? {
              client_data: {
                firstname: polskieDane.daneKlienta.imie ?? "",
                lastname: polskieDane.daneKlienta.nazwisko ?? "",
                email: polskieDane.daneKlienta.email ?? "",
                phone: polskieDane.daneKlienta.telefon ?? "",
              },
            }
          : {}),
      };
    }

    return { ...dane };
  }

  private filtrujListe(wartosc: WartoscJson, fraza: string): WartoscJson {
    const pasuje = (element: WartoscJson): boolean => JSON.stringify(element)
      .toLocaleLowerCase("pl-PL")
      .includes(fraza);

    if (Array.isArray(wartosc)) {
      return wartosc.filter(pasuje);
    }

    if (czyObiekt(wartosc) && Array.isArray(wartosc.data)) {
      return { ...wartosc, data: wartosc.data.filter(pasuje) } as WartoscJson;
    }

    return wartosc;
  }
}
