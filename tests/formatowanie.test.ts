import { describe, expect, it, vi } from "vitest";

import {
  bezpiecznyBlad,
  minimalizujDane,
  ukryjSekretyWTekscie,
  wynikBledu,
  wynikSukcesu,
} from "../src/formatowanie.js";
import { BladEstiCRM } from "../src/typy.js";

describe("minimalizacja odpowiedzi EstiCRM", () => {
  it("przetwarza szeroki obiekt bez materializowania pełnej listy pól", () => {
    const szerokiObiekt: Record<string, number> = {};
    for (let indeks = 0; indeks < 60_000; indeks += 1) {
      szerokiObiekt[`pole_${indeks}`] = indeks;
    }

    const szpiegWpisow = vi.spyOn(Object, "entries").mockClear();
    const szpiegKluczy = vi.spyOn(Object, "keys").mockClear();
    let wynik: ReturnType<typeof minimalizujDane> | undefined;
    let liczbaWywolanWpisow = -1;
    let liczbaWywolanKluczy = -1;
    try {
      wynik = minimalizujDane(szerokiObiekt);
      liczbaWywolanWpisow = szpiegWpisow.mock.calls.length;
      liczbaWywolanKluczy = szpiegKluczy.mock.calls.length;
    } finally {
      szpiegKluczy.mockRestore();
      szpiegWpisow.mockRestore();
    }

    expect(liczbaWywolanWpisow).toBe(0);
    expect(liczbaWywolanKluczy).toBe(0);
    expect(Object.keys(wynik?.dane as Record<string, unknown>)).toHaveLength(100);
    expect(wynik?.obcieto).toBe(true);
  });

  it("ogranicza każdą listę i zaznacza obcięcie", () => {
    const wynik = minimalizujDane(
      {
        oferty: [{ id: 1 }, { id: 2 }, { id: 3 }],
        grupy: [["a", "b", "c"]],
      },
      { limitRekordow: 2 },
    );

    expect(wynik).toEqual({
      dane: {
        oferty: [{ id: 1 }, { id: 2 }],
        grupy: [["a", "b"]],
      },
      obcieto: true,
    });
  });

  it("zawsze ukrywa sekrety, a dane kontaktowe domyślnie", () => {
    const wynik = minimalizujDane({
      token: "sekretny-token",
      api_key: "sekretny-klucz",
      email: "jan@example.com",
      telefon: "+48 123 456 789",
      nazwa: "Jan Kowalski",
    });

    expect(wynik.dane).toEqual({
      token: "[ukryto]",
      api_key: "[ukryto]",
      email: "[ukryto]",
      telefon: "[ukryto]",
      nazwa: "Jan Kowalski",
    });
  });

  it("pozwala jawnie pokazać kontakt, ale nadal nie pokazuje tokenu", () => {
    const wynik = minimalizujDane(
      {
        token: "sekret",
        email: "jan@example.com",
      },
      { ukryjDaneKontaktowe: false },
    );

    expect(wynik.dane).toEqual({
      token: "[ukryto]",
      email: "jan@example.com",
    });
  });

  it("normalizuje warianty nazw pól z sekretami", () => {
    const wynik = minimalizujDane({
      company: "firma-testowa",
      companyId: "firma-testowa",
      "company-id": "firma-testowa",
      company_id: "firma-testowa",
      accessToken: "token-testowy",
    });

    expect(wynik.dane).toEqual({
      company: "[ukryto]",
      companyId: "[ukryto]",
      "company-id": "[ukryto]",
      company_id: "[ukryto]",
      accessToken: "[ukryto]",
    });
  });

  it("usuwa sekrety osadzone w tekście i adresie URL", () => {
    const tekst =
      "Błąd https://client-api.esticrm.pl/test?company=firma-7&token=abc123 api_key=xyz";

    expect(ukryjSekretyWTekscie(tekst)).not.toContain("abc123");
    expect(ukryjSekretyWTekscie(tekst)).not.toContain("xyz");
    expect(ukryjSekretyWTekscie(tekst)).not.toContain("firma-7");
    expect(ukryjSekretyWTekscie(tekst)).toContain("[ukryto]");
  });
});

describe("wyniki narzędzi MCP", () => {
  it("zwraca tekst i structuredContent dla poprawnej odpowiedzi", () => {
    const wynik = wynikSukcesu("Pobrano oferty.", [{ id: 1 }], {
      limitRekordow: 5,
    });

    expect(wynik.content).toEqual([
      {
        type: "text",
        text: 'Pobrano oferty.\n\n[\n  {\n    "id": 1\n  }\n]',
      },
    ]);
    expect(wynik.structuredContent).toEqual({
      ok: true,
      opis: "Pobrano oferty.",
      dane: [{ id: 1 }],
      metadane: { obcieto: false, limit_rekordow: 5 },
    });
  });

  it("nie kopiuje treści nieznanego błędu do odpowiedzi", () => {
    const wynik = wynikBledu(
      new Error("token=super-sekret https://client-api.esticrm.pl"),
    );
    const calosc = JSON.stringify(wynik);

    expect(wynik.isError).toBe(true);
    expect(calosc).not.toContain("super-sekret");
    expect(calosc).not.toContain("client-api.esticrm.pl");
    expect(calosc).toContain("BLAD_WEWNETRZNY");
  });

  it("mapuje kontrolowany kod klienta na bezpieczny polski komunikat", () => {
    const blad = new BladEstiCRM(
      "Nie ujawniaj token=abc",
      "PRZEKROCZONY_CZAS",
    );

    expect(bezpiecznyBlad(blad)).toEqual({
      kod: "PRZEKROCZONY_CZAS",
      komunikat: "Przekroczono czas oczekiwania na odpowiedź EstiCRM.",
    });
  });
});
