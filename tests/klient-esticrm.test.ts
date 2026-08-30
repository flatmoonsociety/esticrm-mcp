import { afterEach, describe, expect, it, vi } from "vitest";

import type { KonfiguracjaEstiCRM } from "../src/konfiguracja.js";
import { KlientEstiCRM } from "../src/klient-esticrm.js";
import { BladEstiCRM } from "../src/typy.js";

type AtrapaFetch = (
  wejscie: string | URL | Request,
  inicjalizacja?: RequestInit,
) => Promise<Response>;

const konfiguracjaBazowa: KonfiguracjaEstiCRM = {
  identyfikatorFirmy: "firma/123",
  tokenApi: "token?bardzo&tajny",
  zapisyWlaczone: false,
  limitCzasuMs: 1_000,
  odstepZadanMs: 0,
  maksymalnyRozmiarOdpowiedziBajty: 2 * 1024 * 1024,
  maksymalnaLiczbaAktywnychZadan: 25,
};

function odpowiedzJson(dane: unknown, status = 200): Response {
  return new Response(JSON.stringify(dane), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function adresZWywolania(atrapaFetch: ReturnType<typeof vi.fn<AtrapaFetch>>): URL {
  const wywolanie = atrapaFetch.mock.calls[0];
  if (!wywolanie) {
    throw new Error("Oczekiwano wywołania syntetycznej funkcji fetch.");
  }
  const wejscie = wywolanie[0];
  return new URL(wejscie instanceof Request ? wejscie.url : String(wejscie));
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("KlientEstiCRM - odczyt", () => {
  it("używa stałego produkcyjnego adresu bazowego i koduje dane dostępowe", async () => {
    const atrapaFetch = vi.fn<AtrapaFetch>().mockResolvedValue(odpowiedzJson({ result: true }));
    const klient = new KlientEstiCRM(konfiguracjaBazowa, atrapaFetch);

    await klient.szczegolyOferty({ idOferty: "oferta/42" });

    const adres = adresZWywolania(atrapaFetch);
    expect(adres.origin).toBe("https://client-api.esticrm.pl");
    expect(adres.pathname).toBe("/apiClient/offer/details");
    expect(adres.searchParams.get("company")).toBe("firma/123");
    expect(adres.searchParams.get("token")).toBe("token?bardzo&tajny");
    expect(adres.searchParams.get("id")).toBe("oferta/42");
    expect(atrapaFetch.mock.calls[0]?.[1]?.redirect).toBe("error");
  });

  it("mapuje stronę i limit wyłącznie na udokumentowane parametry skip i take", async () => {
    const atrapaFetch = vi.fn<AtrapaFetch>().mockResolvedValue(odpowiedzJson([]));
    const klient = new KlientEstiCRM(konfiguracjaBazowa, atrapaFetch);

    await klient.listaOfert({
      limit: 25,
      strona: 3,
    });

    const adres = adresZWywolania(atrapaFetch);
    expect(adres.pathname).toBe("/apiClient/offer/list");
    expect(adres.searchParams.get("skip")).toBe("50");
    expect(adres.searchParams.get("take")).toBe("25");
    expect([...adres.searchParams.keys()].sort()).toEqual([
      "company",
      "skip",
      "take",
      "token",
    ]);
  });

  it("obsługuje wszystkie uzgodnione ścieżki wyłącznie przez syntetyczną funkcję fetch", async () => {
    const przypadki: Array<{
      sciezka: string;
      wywolaj: (klient: KlientEstiCRM) => Promise<unknown>;
    }> = [
      { sciezka: "/apiClient/client/get", wywolaj: (klient) => klient.klient({ idKlienta: 1 }) },
      { sciezka: "/apiClient/client/offer-list", wywolaj: (klient) => klient.ofertyKlienta({ idKlienta: 1, limit: 5 }) },
      { sciezka: "/apiClient/user/list", wywolaj: (klient) => klient.listaAgentow({ limit: 5 }) },
      { sciezka: "/apiClient/desktop/location", wywolaj: (klient) => klient.wyszukajLokalizacje({ fraza: "Gdynia", limit: 5 }) },
      { sciezka: "/apiClient/offer/dictionary", wywolaj: (klient) => klient.slownikOfert() },
      { sciezka: "/apiClient/offer/mapping", wywolaj: (klient) => klient.mapowanieOfert() },
      { sciezka: "/apiClient/desktop/dictionary", wywolaj: (klient) => klient.slownikSystemowy() },
      { sciezka: "/apiClient/calendar/check-term", wywolaj: (klient) => klient.sprawdzTermin({ dataOd: "2026-01-01 10:00:00", dataDo: "2026-01-01 11:00:00", emailAgenta: "agent@example.pl" }) },
      { sciezka: "/apiClient/calendar/events-by-range", wywolaj: (klient) => klient.wydarzeniaKalendarza({ dataOd: "2026-01-01 10:00:00", dataDo: "2026-01-01 11:00:00", emailAgenta: "agent@example.pl", limit: 5 }) },
      { sciezka: "/apiClient/investment/list", wywolaj: (klient) => klient.listaInwestycji({ limit: 5 }) },
      { sciezka: "/apiClient/office/list", wywolaj: (klient) => klient.listaBiur({ limit: 5 }) },
    ];

    for (const przypadek of przypadki) {
      const atrapaFetch = vi.fn<AtrapaFetch>().mockResolvedValue(odpowiedzJson([]));
      const klient = new KlientEstiCRM(konfiguracjaBazowa, atrapaFetch);

      await przypadek.wywolaj(klient);

      expect(adresZWywolania(atrapaFetch).pathname).toBe(przypadek.sciezka);
    }
  });

  it("ogranicza lokalnie listy, których punkt końcowy nie obsługuje parametru limit", async () => {
    const atrapaFetch = vi.fn<AtrapaFetch>().mockResolvedValue(odpowiedzJson({
      result: true,
      data: [{ id: 1 }, { id: 2 }, { id: 3 }],
    }));
    const klient = new KlientEstiCRM(konfiguracjaBazowa, atrapaFetch);

    await expect(klient.listaAgentow({ limit: 2 })).resolves.toEqual({
      result: true,
      data: [{ id: 1 }, { id: 2 }],
    });
  });

  it("zwraca wartość result: false jako biznesowy wynik sprawdzania terminu", async () => {
    const wynik = { result: false, message: "Termin jest zajęty" };
    const atrapaFetch = vi.fn<AtrapaFetch>().mockResolvedValue(odpowiedzJson(wynik));
    const klient = new KlientEstiCRM(konfiguracjaBazowa, atrapaFetch);

    await expect(klient.sprawdzTermin({
      start: "2026-01-01 10:00:00",
      end: "2026-01-01 11:00:00",
      calendar: "agent@example.pl",
    })).resolves.toEqual(wynik);
  });

  it("nie traktuje wartości success: false jako informacji o dostępności terminu", async () => {
    const atrapaFetch = vi.fn<AtrapaFetch>().mockResolvedValue(odpowiedzJson({
      success: false,
      message: "Błąd kalendarza",
    }));
    const klient = new KlientEstiCRM(konfiguracjaBazowa, atrapaFetch);

    await expect(klient.sprawdzTermin({
      start: "2026-01-01 10:00:00",
      end: "2026-01-01 11:00:00",
      calendar: "agent@example.pl",
    })).rejects.toMatchObject({ kod: "BLAD_API" });
  });

  it("odrzuca pozostałe negatywne wyniki biznesowe", async () => {
    const atrapaFetch = vi.fn<AtrapaFetch>().mockResolvedValue(odpowiedzJson({
      result: false,
      message: "Nie zapisano",
    }));
    const klient = new KlientEstiCRM(konfiguracjaBazowa, atrapaFetch);

    await expect(klient.klient({ idKlienta: 1 })).rejects.toMatchObject({
      kod: "BLAD_API",
    });
  });
});

describe("KlientEstiCRM - bezpieczeństwo", () => {
  it("wykrywa brak uprawnień przy HTTP 200, również bez polskich znaków", async () => {
    const atrapaFetch = vi.fn<AtrapaFetch>().mockResolvedValue(odpowiedzJson({
      result: false,
      message: "Brak uprawnien dla token?bardzo&tajny i firma/123",
    }));
    const klient = new KlientEstiCRM(konfiguracjaBazowa, atrapaFetch);

    let blad: unknown;
    try {
      await klient.klient({ idKlienta: 1 });
    } catch (przechwyconyBlad) {
      blad = przechwyconyBlad;
    }

    expect(blad).toBeInstanceOf(BladEstiCRM);
    expect(blad).toMatchObject({ kod: "BRAK_UPRAWNIEN" });
    expect(String(blad)).not.toContain(konfiguracjaBazowa.tokenApi);
    expect(String(blad)).not.toContain(konfiguracjaBazowa.identyfikatorFirmy);
  });

  it("wykrywa brak uprawnień przed limitem skanowania bardzo szerokiej tablicy", async () => {
    const szerokaOdpowiedz = ["Brak uprawnien", ...Array<number>(60_000).fill(0)];
    const atrapaFetch = vi.fn<AtrapaFetch>().mockResolvedValue(
      odpowiedzJson(szerokaOdpowiedz),
    );
    const klient = new KlientEstiCRM(konfiguracjaBazowa, atrapaFetch);

    await expect(klient.listaBiur()).rejects.toMatchObject({
      kod: "BRAK_UPRAWNIEN",
    });
  });

  it("anuluje niekończące się ciało odpowiedzi po błędzie HTTP", async () => {
    const anulowanie = vi.fn();
    const strumien = new ReadableStream<Uint8Array>({
      cancel() {
        anulowanie();
      },
    });
    const atrapaFetch = vi.fn<AtrapaFetch>().mockResolvedValue(new Response(strumien, {
      status: 503,
      headers: { "Content-Type": "application/json" },
    }));
    const klient = new KlientEstiCRM(konfiguracjaBazowa, atrapaFetch);

    await expect(klient.listaBiur()).rejects.toMatchObject({
      kod: "BLAD_HTTP",
    });
    expect(anulowanie).toHaveBeenCalledTimes(1);
  });

  it("nie ujawnia sekretów w błędzie HTTP ani błędzie sieci", async () => {
    const bladHttpFetch = vi.fn<AtrapaFetch>().mockResolvedValue(odpowiedzJson({}, 503));
    const klientHttp = new KlientEstiCRM(konfiguracjaBazowa, bladHttpFetch);

    await expect(klientHttp.listaBiur()).rejects.not.toThrow(konfiguracjaBazowa.tokenApi);

    const bladSieciFetch = vi.fn<AtrapaFetch>().mockRejectedValue(
      new Error(`Awaria pod adresem z ${konfiguracjaBazowa.tokenApi}`),
    );
    const klientSieci = new KlientEstiCRM(konfiguracjaBazowa, bladSieciFetch);

    let blad: unknown;
    try {
      await klientSieci.listaBiur();
    } catch (przechwyconyBlad) {
      blad = przechwyconyBlad;
    }
    expect(String(blad)).not.toContain(konfiguracjaBazowa.tokenApi);
    expect(String(blad)).not.toContain(konfiguracjaBazowa.identyfikatorFirmy);
  });

  it("blokuje zapis przed wywołaniem funkcji fetch, gdy flaga zapisów jest wyłączona", async () => {
    const atrapaFetch = vi.fn<AtrapaFetch>();
    const klient = new KlientEstiCRM(konfiguracjaBazowa, atrapaFetch);

    await expect(klient.utworzZapytanie({
      emailAgenta: "agent@example.pl",
      transakcja: 1,
      rynek: 2,
      idTypu: 3,
      wiadomosc: "Proszę o kontakt",
      email: "klient@example.pl",
    })).rejects.toMatchObject({ kod: "ZAPIS_WYLACZONY" });
    await expect(klient.utworzTermin({
      tytul: "Spotkanie",
      dataOd: "2026-01-01 10:00",
      dataDo: "2026-01-01 11:00",
      emailAgenta: "agent@example.pl",
    })).rejects.toMatchObject({ kod: "ZAPIS_WYLACZONY" });
    expect(atrapaFetch).not.toHaveBeenCalled();
  });

  it("przerywa zbyt długie zadanie bez ujawniania adresu", async () => {
    vi.useFakeTimers();
    const atrapaFetch = vi.fn<AtrapaFetch>().mockImplementation((_wejscie, opcje) => new Promise(
      (_rozwiaz, odrzuc) => {
        opcje?.signal?.addEventListener("abort", () => {
          odrzuc(new DOMException("Przerwano", "AbortError"));
        });
      },
    ));
    const klient = new KlientEstiCRM({
      ...konfiguracjaBazowa,
      limitCzasuMs: 50,
    }, atrapaFetch);

    const zadanie = klient.listaBiur();
    const sprawdzenie = expect(zadanie).rejects.toMatchObject({
      kod: "PRZEKROCZONY_CZAS",
    });
    await vi.advanceTimersByTimeAsync(50);
    await sprawdzenie;
  });

  it("obejmuje limitem czasu także pobieranie ciała odpowiedzi", async () => {
    vi.useFakeTimers();
    const koder = new TextEncoder();
    const atrapaFetch = vi.fn<AtrapaFetch>().mockImplementation((_wejscie, opcje) => {
      const strumien = new ReadableStream<Uint8Array>({
        start(kontroler) {
          kontroler.enqueue(koder.encode('{"result":'));
          opcje?.signal?.addEventListener("abort", () => {
            kontroler.error(new DOMException("Przerwano", "AbortError"));
          }, { once: true });
        },
      });
      return Promise.resolve(new Response(strumien, {
        headers: { "Content-Type": "application/json" },
      }));
    });
    const klient = new KlientEstiCRM({
      ...konfiguracjaBazowa,
      limitCzasuMs: 50,
    }, atrapaFetch);

    const zadanie = klient.listaBiur();
    const sprawdzenie = expect(zadanie).rejects.toMatchObject({
      kod: "PRZEKROCZONY_CZAS",
    });
    await vi.advanceTimersByTimeAsync(50);
    await sprawdzenie;
  });

  it("odrzuca odpowiedź większą niż limit faktycznych bajtów", async () => {
    const dane = { opis: "x".repeat(100) };
    const atrapaFetch = vi.fn<AtrapaFetch>().mockResolvedValue(odpowiedzJson(dane));
    const klient = new KlientEstiCRM({
      ...konfiguracjaBazowa,
      maksymalnyRozmiarOdpowiedziBajty: 32,
    }, atrapaFetch);

    await expect(klient.listaBiur()).rejects.toMatchObject({
      kod: "ZBYT_DUZA_ODPOWIEDZ",
    });
  });

  it("odrzuca zbyt duży nagłówek Content-Length przed odczytem", async () => {
    const anulowanie = vi.fn();
    const strumien = new ReadableStream<Uint8Array>({
      cancel() {
        anulowanie();
      },
    });
    const atrapaFetch = vi.fn<AtrapaFetch>().mockResolvedValue(new Response(strumien, {
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "4096",
      },
    }));
    const klient = new KlientEstiCRM({
      ...konfiguracjaBazowa,
      maksymalnyRozmiarOdpowiedziBajty: 1024,
    }, atrapaFetch);

    await expect(klient.listaBiur()).rejects.toMatchObject({
      kod: "ZBYT_DUZA_ODPOWIEDZ",
    });
    expect(anulowanie).toHaveBeenCalledTimes(1);
  });

  it("akceptuje odpowiedź równą limitowi bajtów", async () => {
    const tresc = JSON.stringify({ result: true });
    const rozmiar = new TextEncoder().encode(tresc).byteLength;
    const atrapaFetch = vi.fn<AtrapaFetch>().mockResolvedValue(new Response(tresc, {
      headers: { "Content-Type": "application/json" },
    }));
    const klient = new KlientEstiCRM({
      ...konfiguracjaBazowa,
      maksymalnyRozmiarOdpowiedziBajty: rozmiar,
    }, atrapaFetch);

    await expect(klient.listaBiur()).resolves.toEqual({ result: true });
  });

  it("odrzuca nowe wywołanie po osiągnięciu limitu aktywnych zadań", async () => {
    const rozwiazania: Array<(odpowiedz: Response) => void> = [];
    const atrapaFetch = vi.fn<AtrapaFetch>().mockImplementation(() => new Promise<Response>(
      (rozwiaz) => rozwiazania.push(rozwiaz),
    ));
    const klient = new KlientEstiCRM({
      ...konfiguracjaBazowa,
      maksymalnaLiczbaAktywnychZadan: 2,
    }, atrapaFetch);

    const pierwsze = klient.listaAgentow();
    const drugie = klient.listaBiur();
    await expect(klient.listaInwestycji()).rejects.toMatchObject({
      kod: "PRZECIAZENIE",
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(rozwiazania).toHaveLength(2);
    rozwiazania[0]?.(odpowiedzJson([]));
    rozwiazania[1]?.(odpowiedzJson([]));
    await Promise.all([pierwsze, drugie]);
  });
});

describe("KlientEstiCRM - zapisy i ograniczanie tempa", () => {
  it("wysyła zapytanie jako JSON po jawnym włączeniu zapisów", async () => {
    const atrapaFetch = vi.fn<AtrapaFetch>().mockResolvedValue(odpowiedzJson({ result: true }));
    const klient = new KlientEstiCRM({
      ...konfiguracjaBazowa,
      zapisyWlaczone: true,
    }, atrapaFetch);

    await klient.utworzZapytanie({
      emailAgenta: "agent@example.pl",
      transakcja: 1,
      rynek: 2,
      idTypu: 3,
      imie: "Jan",
      nazwisko: "Kowalski",
      email: "jan@example.pl",
      telefon: "500600700",
      wiadomosc: "Proszę o kontakt",
      numerOferty: "TEST42",
    });

    const adres = adresZWywolania(atrapaFetch);
    const inicjalizacja = atrapaFetch.mock.calls[0]?.[1];
    expect(adres.pathname).toBe("/apiClient/question/store");
    expect(inicjalizacja?.method).toBe("POST");
    expect(inicjalizacja?.headers).toMatchObject({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(inicjalizacja?.body))).toEqual({
      agent_email: "agent@example.pl",
      transaction: 1,
      market: 2,
      type_id: 3,
      firstname: "Jan",
      lastname: "Kowalski",
      email: "jan@example.pl",
      phone: "500600700",
      content: "Proszę o kontakt",
      offer_number: "TEST42",
    });
  });

  it("mapuje polski termin na format calendar/store", async () => {
    const atrapaFetch = vi.fn<AtrapaFetch>().mockResolvedValue(odpowiedzJson({ result: true }));
    const klient = new KlientEstiCRM({
      ...konfiguracjaBazowa,
      zapisyWlaczone: true,
    }, atrapaFetch);

    await klient.utworzTermin({
      tytul: "Spotkanie z klientem",
      dataOd: "2026-01-02 10:15",
      dataDo: "2026-01-02 11:45",
      emailAgenta: "agent@example.pl",
      numerOferty: "TEST42",
      daneKlienta: {
        imie: "Jan",
        nazwisko: "Kowalski",
        email: "jan@example.pl",
        telefon: "500600700",
      },
      opis: "Prezentacja mieszkania",
    });

    const adres = adresZWywolania(atrapaFetch);
    const body = JSON.parse(String(atrapaFetch.mock.calls[0]?.[1]?.body));
    expect(adres.pathname).toBe("/apiClient/calendar/store");
    expect(body).toMatchObject({
      type: 1,
      name: "Spotkanie z klientem",
      begin_date: "2026-01-02",
      begin_time: "10:15",
      end_date: "2026-01-02",
      end_time: "11:45",
      calendar: "agent@example.pl",
      offer_number: "TEST42",
      client_data: {
        firstname: "Jan",
        lastname: "Kowalski",
        email: "jan@example.pl",
        phone: "500600700",
      },
      description: "Prezentacja mieszkania",
      allday: 0,
    });
  });

  it("odrzuca nieudokumentowany format daty zakresu kalendarza", async () => {
    const atrapaFetch = vi.fn<AtrapaFetch>();
    const klient = new KlientEstiCRM(konfiguracjaBazowa, atrapaFetch);

    expect(() => klient.sprawdzTermin({
      start: "2026-01-01T10:00:00Z",
      end: "2026-01-01T11:00:00Z",
      calendar: "agent@example.pl",
    })).toThrowError(BladEstiCRM);
    expect(atrapaFetch).not.toHaveBeenCalled();
  });

  it("odrzuca zakres kalendarza dłuższy niż 31 dni", async () => {
    const atrapaFetch = vi.fn<AtrapaFetch>();
    const klient = new KlientEstiCRM(konfiguracjaBazowa, atrapaFetch);

    await expect(klient.wydarzeniaKalendarza({
      start: "2026-01-01 00:00:00",
      end: "2026-02-01 00:00:01",
      calendar: "agent@example.pl",
      limit: 5,
    })).rejects.toMatchObject({ kod: "KONFIGURACJA" });
    expect(atrapaFetch).not.toHaveBeenCalled();
  });

  it("odrzuca termin, którego koniec nie jest późniejszy od początku", async () => {
    const atrapaFetch = vi.fn<AtrapaFetch>();
    const klient = new KlientEstiCRM({
      ...konfiguracjaBazowa,
      zapisyWlaczone: true,
    }, atrapaFetch);

    await expect(klient.utworzTermin({
      tytul: "Spotkanie",
      dataOd: "2026-01-02 11:00",
      dataDo: "2026-01-02 10:00",
      emailAgenta: "agent@example.pl",
    })).rejects.toMatchObject({ kod: "KONFIGURACJA" });
    expect(atrapaFetch).not.toHaveBeenCalled();
  });

  it("wlicza oczekiwanie na odstęp do całego limitu czasu", async () => {
    vi.useFakeTimers({ now: 1_000 });
    const atrapaFetch = vi.fn<AtrapaFetch>().mockResolvedValue(odpowiedzJson([]));
    const klient = new KlientEstiCRM({
      ...konfiguracjaBazowa,
      limitCzasuMs: 50,
      odstepZadanMs: 100,
    }, atrapaFetch);

    const pierwsze = klient.listaAgentow();
    const drugie = klient.listaBiur();
    await vi.advanceTimersByTimeAsync(0);
    await pierwsze;

    const sprawdzenie = expect(drugie).rejects.toMatchObject({
      kod: "PRZEKROCZONY_CZAS",
    });
    await vi.advanceTimersByTimeAsync(50);
    await sprawdzenie;
    expect(atrapaFetch).toHaveBeenCalledTimes(1);
  });

  it("anulowane oczekiwanie nie rezerwuje późniejszego miejsca w kolejce", async () => {
    vi.useFakeTimers({ now: 1_000 });
    const chwileStartu: number[] = [];
    const atrapaFetch = vi.fn<AtrapaFetch>().mockImplementation(async () => {
      chwileStartu.push(Date.now());
      return odpowiedzJson([]);
    });
    const klient = new KlientEstiCRM({
      ...konfiguracjaBazowa,
      limitCzasuMs: 75,
      odstepZadanMs: 100,
    }, atrapaFetch);

    const pierwsze = klient.listaAgentow();
    const drugie = klient.listaBiur();
    await vi.advanceTimersByTimeAsync(0);
    await pierwsze;

    const sprawdzenieDrugiego = expect(drugie).rejects.toMatchObject({
      kod: "PRZEKROCZONY_CZAS",
    });
    await vi.advanceTimersByTimeAsync(75);
    await sprawdzenieDrugiego;

    const trzecie = klient.listaInwestycji();
    await vi.advanceTimersByTimeAsync(24);
    expect(atrapaFetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await trzecie;
    expect(chwileStartu).toEqual([1_000, 1_100]);
  });

  it("rozsuwa w czasie równoległe zadania", async () => {
    vi.useFakeTimers({ now: 1_000 });
    const chwileStartu: number[] = [];
    const atrapaFetch = vi.fn<AtrapaFetch>().mockImplementation(async () => {
      chwileStartu.push(Date.now());
      return odpowiedzJson([]);
    });
    const klient = new KlientEstiCRM({
      ...konfiguracjaBazowa,
      odstepZadanMs: 100,
    }, atrapaFetch);

    const pierwsze = klient.listaAgentow();
    const drugie = klient.listaBiur();
    await vi.advanceTimersByTimeAsync(0);
    expect(atrapaFetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(99);
    expect(atrapaFetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await Promise.all([pierwsze, drugie]);
    expect(chwileStartu).toEqual([1_000, 1_100]);
  });
});
