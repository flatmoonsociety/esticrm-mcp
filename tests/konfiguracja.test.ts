import { describe, expect, it } from "vitest";

import {
  DOMYSLNY_LIMIT_CZASU_MS,
  DOMYSLNA_MAKSYMALNA_LICZBA_AKTYWNYCH_ZADAN,
  DOMYSLNY_MAKSYMALNY_ROZMIAR_ODPOWIEDZI_BAJTY,
  DOMYSLNY_ODSTEP_ZADAN_MS,
  wczytajKonfiguracje,
} from "../src/konfiguracja.js";
import { BladEstiCRM } from "../src/typy.js";

describe("wczytajKonfiguracje", () => {
  it("wczytuje wymagane sekrety i bezpieczne wartości domyślne", () => {
    const konfiguracja = wczytajKonfiguracje({
      ESTICRM_COMPANY_ID: "  firma-123  ",
      ESTICRM_API_TOKEN: "  token-abc  ",
    });

    expect(konfiguracja).toEqual({
      identyfikatorFirmy: "firma-123",
      tokenApi: "token-abc",
      zapisyWlaczone: false,
      limitCzasuMs: DOMYSLNY_LIMIT_CZASU_MS,
      odstepZadanMs: DOMYSLNY_ODSTEP_ZADAN_MS,
      maksymalnyRozmiarOdpowiedziBajty:
        DOMYSLNY_MAKSYMALNY_ROZMIAR_ODPOWIEDZI_BAJTY,
      maksymalnaLiczbaAktywnychZadan:
        DOMYSLNA_MAKSYMALNA_LICZBA_AKTYWNYCH_ZADAN,
    });
    expect(Object.isFrozen(konfiguracja)).toBe(true);
  });

  it("obsługuje jawne włączenie zapisów, limit czasu i odstęp między zadaniami", () => {
    const konfiguracja = wczytajKonfiguracje({
      ESTICRM_COMPANY_ID: "123",
      ESTICRM_API_TOKEN: "sekret",
      ESTICRM_ENABLE_WRITES: "TAK",
      ESTICRM_TIMEOUT_MS: "2500",
      ESTICRM_REQUEST_INTERVAL_MS: "25",
      ESTICRM_MAX_RESPONSE_BYTES: "4096",
      ESTICRM_MAX_ACTIVE_REQUESTS: "7",
    });

    expect(konfiguracja.zapisyWlaczone).toBe(true);
    expect(konfiguracja.limitCzasuMs).toBe(2500);
    expect(konfiguracja.odstepZadanMs).toBe(25);
    expect(konfiguracja.maksymalnyRozmiarOdpowiedziBajty).toBe(4096);
    expect(konfiguracja.maksymalnaLiczbaAktywnychZadan).toBe(7);
  });

  it("pozostawia zapisy wyłączone dla bezpiecznych wariantów wartości fałszywej", () => {
    for (const wartosc of [undefined, "", "false", "0", "nie"]) {
      const konfiguracja = wczytajKonfiguracje({
        ESTICRM_COMPANY_ID: "123",
        ESTICRM_API_TOKEN: "sekret",
        ESTICRM_ENABLE_WRITES: wartosc,
      });

      expect(konfiguracja.zapisyWlaczone).toBe(false);
    }
  });

  it("odrzuca brak identyfikatora firmy lub tokenu", () => {
    expect(() => wczytajKonfiguracje({ ESTICRM_API_TOKEN: "sekret" }))
      .toThrowError("ESTICRM_COMPANY_ID");
    expect(() => wczytajKonfiguracje({ ESTICRM_COMPANY_ID: "123" }))
      .toThrowError("ESTICRM_API_TOKEN");
  });

  it("odrzuca niepoprawne wartości liczbowe i flagę zapisów", () => {
    const podstawa = {
      ESTICRM_COMPANY_ID: "123",
      ESTICRM_API_TOKEN: "sekret",
    };

    expect(() => wczytajKonfiguracje({
      ...podstawa,
      ESTICRM_TIMEOUT_MS: "0",
    })).toThrowError(BladEstiCRM);
    expect(() => wczytajKonfiguracje({
      ...podstawa,
      ESTICRM_REQUEST_INTERVAL_MS: "-1",
    })).toThrowError(BladEstiCRM);
    expect(() => wczytajKonfiguracje({
      ...podstawa,
      ESTICRM_ENABLE_WRITES: "może",
    })).toThrowError(BladEstiCRM);
    expect(() => wczytajKonfiguracje({
      ...podstawa,
      ESTICRM_MAX_RESPONSE_BYTES: "1023",
    })).toThrowError(BladEstiCRM);
    expect(() => wczytajKonfiguracje({
      ...podstawa,
      ESTICRM_MAX_ACTIVE_REQUESTS: "0",
    })).toThrowError(BladEstiCRM);
  });

  it("nigdy nie umieszcza sekretów w błędach konfiguracji", () => {
    const identyfikatorFirmy = "FIRMA-SUPER-SEKRETNA";
    const token = "TOKEN-SUPER-SEKRETNY";

    let blad: unknown;
    try {
      wczytajKonfiguracje({
        ESTICRM_COMPANY_ID: identyfikatorFirmy,
        ESTICRM_API_TOKEN: token,
        ESTICRM_TIMEOUT_MS: "nie-liczba",
      });
    } catch (przechwyconyBlad) {
      blad = przechwyconyBlad;
    }

    expect(blad).toBeInstanceOf(BladEstiCRM);
    expect(String(blad)).not.toContain(identyfikatorFirmy);
    expect(String(blad)).not.toContain(token);
  });
});
