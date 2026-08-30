import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, type McpServer } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { stworzSerwerMcp, type UslugaEstiCrm } from "../src/serwer.js";
import { BladEstiCRM } from "../src/typy.js";

function syntetycznaUsluga(
  nadpisania: Partial<UslugaEstiCrm> = {},
): UslugaEstiCrm {
  return {
    listaOfert: async () => [],
    szczegolyOferty: async () => ({}),
    klient: async () => ({}),
    ofertyKlienta: async () => [],
    listaAgentow: async () => [],
    wyszukajLokalizacje: async () => [],
    slownikOfert: async () => ({}),
    mapowanieOfert: async () => ({}),
    slownikSystemowy: async () => ({}),
    sprawdzTermin: async () => ({ dostepny: true }),
    wydarzeniaKalendarza: async () => [],
    listaInwestycji: async () => [],
    listaBiur: async () => [],
    utworzZapytanie: async () => ({ id: 1 }),
    utworzTermin: async () => ({ id: 1 }),
    ...nadpisania,
  };
}

interface PolaczenieTestowe {
  readonly klient: Client;
  readonly serwer: McpServer;
}

const aktywnePolaczenia: PolaczenieTestowe[] = [];

async function polacz(serwer: McpServer): Promise<PolaczenieTestowe> {
  const [transportKlienta, transportSerwera] = InMemoryTransport.createLinkedPair();
  const klient = new Client({ name: "klient-testowy", version: "1.0.0" });

  await serwer.connect(transportSerwera);
  await klient.connect(transportKlienta);

  const polaczenie = { klient, serwer };
  aktywnePolaczenia.push(polaczenie);
  return polaczenie;
}

afterEach(async () => {
  await Promise.allSettled(
    aktywnePolaczenia.splice(0).flatMap(({ klient, serwer }) => [
      klient.close(),
      serwer.close(),
    ]),
  );
});

describe("rejestracja narzędzi EstiCRM", () => {
  it("domyślnie udostępnia dokładnie 11 narzędzi tylko do odczytu", async () => {
    const { klient } = await polacz(
      stworzSerwerMcp({ usluga: syntetycznaUsluga() }),
    );

    const { tools } = await klient.listTools();

    expect(tools.map(({ name }) => name).sort()).toEqual([
      "esticrm_dane_klienta",
      "esticrm_lista_agentow",
      "esticrm_lista_biur",
      "esticrm_lista_inwestycji",
      "esticrm_lista_ofert",
      "esticrm_oferty_klienta",
      "esticrm_pobierz_slownik",
      "esticrm_sprawdz_termin",
      "esticrm_szczegoly_oferty",
      "esticrm_wydarzenia_kalendarza",
      "esticrm_wyszukaj_lokalizacje",
    ]);
    expect(tools.every((narzedzie) => narzedzie.annotations?.readOnlyHint)).toBe(
      true,
    );
    expect(tools.every((narzedzie) => narzedzie.annotations?.destructiveHint === false)).toBe(
      true,
    );
    expect(tools.every((narzedzie) => narzedzie.annotations?.openWorldHint)).toBe(
      true,
    );
  });

  it("rejestruje dwa narzędzia zapisu wyłącznie po jawnym włączeniu", async () => {
    const { klient } = await polacz(
      stworzSerwerMcp({
        usluga: syntetycznaUsluga(),
        wlaczZapisy: true,
      }),
    );

    const { tools } = await klient.listTools();
    const narzedziaZapisu = tools.filter(({ name }) =>
      name.startsWith("esticrm_utworz_"),
    );

    expect(narzedziaZapisu.map(({ name }) => name).sort()).toEqual([
      "esticrm_utworz_termin",
      "esticrm_utworz_zapytanie",
    ]);
    expect(
      narzedziaZapisu.every(
        (narzedzie) =>
          narzedzie.annotations?.readOnlyHint === false &&
          narzedzie.annotations?.idempotentHint === false &&
          narzedzie.annotations?.destructiveHint === false,
      ),
    ).toBe(true);
  });
});

describe("wywołania narzędzi EstiCRM", () => {
  it("mapuje polskie argumenty listy, ogranicza wynik i zwraca dwie reprezentacje", async () => {
    const listaOfert = vi.fn(async () => [
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);
    const { klient } = await polacz(
      stworzSerwerMcp({
        usluga: syntetycznaUsluga({ listaOfert }),
      }),
    );

    const wynik = await klient.callTool({
      name: "esticrm_lista_ofert",
      arguments: {
        limit: 2,
        strona: 3,
      },
    });

    expect(listaOfert).toHaveBeenCalledWith({
      limit: 2,
      strona: 3,
    });
    expect(wynik.isError).not.toBe(true);
    expect(wynik.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Pobrano listę ofert"),
    });
    expect(wynik.structuredContent).toMatchObject({
      ok: true,
      dane: [{ id: 1 }, { id: 2 }],
      metadane: { obcieto: true, limit_rekordow: 2 },
    });
  });

  it("ukrywa kontakt klienta domyślnie i pokazuje go po jawnym ustawieniu parametru", async () => {
    const usluga = syntetycznaUsluga({
      klient: async () => ({
        id: 7,
        email: "jan@example.com",
        telefon: "+48 123 456 789",
        token: "nigdy-nie-pokazuj",
      }),
    });
    const { klient } = await polacz(stworzSerwerMcp({ usluga }));

    const ukryty = await klient.callTool({
      name: "esticrm_dane_klienta",
      arguments: { id_klienta: 7 },
    });
    const jawny = await klient.callTool({
      name: "esticrm_dane_klienta",
      arguments: { id_klienta: 7, pokaz_dane_kontaktowe: true },
    });

    expect(ukryty.structuredContent).toMatchObject({
      dane: {
        email: "[ukryto]",
        telefon: "[ukryto]",
        token: "[ukryto]",
      },
    });
    expect(jawny.structuredContent).toMatchObject({
      dane: {
        email: "jan@example.com",
        telefon: "+48 123 456 789",
        token: "[ukryto]",
      },
    });
  });

  it("zwraca kontrolowany błąd bez sekretu z klienta API", async () => {
    const { klient } = await polacz(
      stworzSerwerMcp({
        usluga: syntetycznaUsluga({
          szczegolyOferty: async () => {
            throw new BladEstiCRM(
              "https://client-api.esticrm.pl?token=sekret",
              "BLAD_API",
            );
          },
        }),
      }),
    );

    const wynik = await klient.callTool({
      name: "esticrm_szczegoly_oferty",
      arguments: { id_oferty: 123 },
    });
    const calosc = JSON.stringify(wynik);

    expect(wynik.isError).toBe(true);
    expect(calosc).toContain("EstiCRM odrzucił operację");
    expect(calosc).not.toContain("sekret");
    expect(calosc).not.toContain("client-api.esticrm.pl");
  });

  it("odrzuca limit większy niż 50 przed wywołaniem usługi", async () => {
    const listaBiur = vi.fn(async () => []);
    const { klient } = await polacz(
      stworzSerwerMcp({
        usluga: syntetycznaUsluga({ listaBiur }),
      }),
    );

    const wynik = await klient.callTool({
      name: "esticrm_lista_biur",
      arguments: { limit: 51 },
    });

    expect(wynik.isError).toBe(true);
    expect(listaBiur).not.toHaveBeenCalled();
  });

  it("zwraca po polsku błąd walidacji przed wywołaniem usługi", async () => {
    const wyszukajLokalizacje = vi.fn(async () => []);
    const { klient } = await polacz(
      stworzSerwerMcp({
        usluga: syntetycznaUsluga({ wyszukajLokalizacje }),
      }),
    );

    const wynik = await klient.callTool({
      name: "esticrm_wyszukaj_lokalizacje",
      arguments: { fraza: "", limit: 10 },
    });

    expect(wynik.isError).toBe(true);
    expect(JSON.stringify(wynik)).toContain("Za mała wartość");
    expect(wyszukajLokalizacje).not.toHaveBeenCalled();
  });

  it("odrzuca adres e-mail dłuższy niż 254 znaki przed wywołaniem usługi", async () => {
    const sprawdzTermin = vi.fn(async () => ({ dostepny: true }));
    const { klient } = await polacz(
      stworzSerwerMcp({
        usluga: syntetycznaUsluga({ sprawdzTermin }),
      }),
    );

    const wynik = await klient.callTool({
      name: "esticrm_sprawdz_termin",
      arguments: {
        kalendarz: `${"a".repeat(244)}@example.pl`,
        od: "2026-01-02 10:00:00",
        do: "2026-01-02 11:00:00",
      },
    });

    expect(wynik.isError).toBe(true);
    expect(JSON.stringify(wynik)).toContain(
      "Adres e-mail nie może przekraczać 254 znaków.",
    );
    expect(sprawdzTermin).not.toHaveBeenCalled();
  });

  it("mapuje udokumentowane pola obu narzędzi zapisu", async () => {
    const utworzZapytanie = vi.fn(async () => ({ result: true }));
    const utworzTermin = vi.fn(async () => ({ result: true }));
    const { klient } = await polacz(
      stworzSerwerMcp({
        usluga: syntetycznaUsluga({ utworzZapytanie, utworzTermin }),
        wlaczZapisy: true,
      }),
    );

    const wynikZapytania = await klient.callTool({
      name: "esticrm_utworz_zapytanie",
      arguments: {
        email_agenta: "agent@example.pl",
        transakcja: 1,
        rynek: 2,
        id_typu: 3,
        wiadomosc: "Proszę o kontakt",
        numer_oferty: "TEST42",
      },
    });
    const wynikTerminu = await klient.callTool({
      name: "esticrm_utworz_termin",
      arguments: {
        tytul: "Prezentacja",
        kalendarz: "agent@example.pl",
        od: "2026-01-02 10:15",
        do: "2026-01-02 11:45",
        numer_oferty: "TEST42",
        dane_klienta: { email: "klient@example.pl" },
      },
    });

    expect(wynikZapytania.isError).not.toBe(true);
    expect(utworzZapytanie).toHaveBeenCalledWith({
      imie: undefined,
      nazwisko: undefined,
      email: undefined,
      telefon: undefined,
      emailAgenta: "agent@example.pl",
      transakcja: 1,
      rynek: 2,
      idTypu: 3,
      wiadomosc: "Proszę o kontakt",
      numerOferty: "TEST42",
    });
    expect(wynikTerminu.isError).not.toBe(true);
    expect(utworzTermin).toHaveBeenCalledWith({
      tytul: "Prezentacja",
      kalendarz: "agent@example.pl",
      dataOd: "2026-01-02 10:15",
      dataDo: "2026-01-02 11:45",
      typ: 1,
      numerOferty: "TEST42",
      daneKlienta: { email: "klient@example.pl" },
      opis: undefined,
      calyDzien: false,
    });
  });
});
