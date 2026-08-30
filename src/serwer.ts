import { McpServer, type CallToolResult, type ToolAnnotations } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  DOMYSLNY_LIMIT_REKORDOW,
  MAKSYMALNY_LIMIT_REKORDOW,
  type OpcjeMinimalizacji,
  wynikBledu,
  wynikSukcesu,
} from "./formatowanie.js";
import type {
  IdEstiCRM,
  ParametryListyOfert,
  PolskieDaneTerminu,
  PolskieDaneZapytania,
} from "./typy.js";

// Zod używa polskich komunikatów również dla reguł bez własnego opisu.
z.config(z.locales.pl());

interface ParametryLimitu {
  readonly limit?: number;
}

type ParametryIdentyfikatora<Klucz extends string> = Readonly<
  Record<Klucz, IdEstiCRM>
>;

interface ParametryLokalizacji extends ParametryLimitu {
  readonly fraza: string;
}

interface ParametrySlownika {
  readonly nazwa?: string;
}

interface ParametryZakresuKalendarza extends ParametryLimitu {
  readonly dataOd: string;
  readonly dataDo: string;
  readonly kalendarz: string;
}

interface ParametryInwestycji extends ParametryLimitu {
  readonly fraza?: string;
}

/**
 * Wąski kontrakt pomiędzy warstwą MCP i klientem API. Dzięki niemu serwer
 * można testować bez sieci i zastąpić inną implementacją klienta EstiCRM.
 */
export interface UslugaEstiCrm {
  listaOfert(parametry?: ParametryListyOfert): Promise<unknown>;
  szczegolyOferty(parametry: ParametryIdentyfikatora<"idOferty">): Promise<unknown>;
  klient(parametry: ParametryIdentyfikatora<"idKlienta">): Promise<unknown>;
  ofertyKlienta(
    parametry: ParametryIdentyfikatora<"idKlienta"> & ParametryLimitu,
  ): Promise<unknown>;
  listaAgentow(parametry?: ParametryLimitu): Promise<unknown>;
  wyszukajLokalizacje(parametry: ParametryLokalizacji): Promise<unknown>;
  slownikOfert(parametry?: ParametrySlownika): Promise<unknown>;
  mapowanieOfert(parametry?: ParametrySlownika): Promise<unknown>;
  slownikSystemowy(parametry?: ParametrySlownika): Promise<unknown>;
  sprawdzTermin(parametry: ParametryZakresuKalendarza): Promise<unknown>;
  wydarzeniaKalendarza(parametry: ParametryZakresuKalendarza): Promise<unknown>;
  listaInwestycji(parametry?: ParametryInwestycji): Promise<unknown>;
  listaBiur(parametry?: ParametryLimitu): Promise<unknown>;
  utworzZapytanie(dane: PolskieDaneZapytania): Promise<unknown>;
  utworzTermin(dane: PolskieDaneTerminu): Promise<unknown>;
}

export interface OpcjeSerweraMcp {
  readonly usluga: UslugaEstiCrm;
  /** Narzędzia zapisu nie są nawet rejestrowane, dopóki ta flaga nie ma wartości true. */
  readonly wlaczZapisy?: boolean;
}

const adnotacjeOdczytu = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} satisfies ToolAnnotations;

const adnotacjeZapisu = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} satisfies ToolAnnotations;

const schematId = z.union([
  z.string().trim().min(1, "Identyfikator nie może być pusty.").max(100),
  z.number().int().nonnegative(),
]);

const schematLimitu = z
  .number()
  .int("Limit musi być liczbą całkowitą.")
  .min(1, "Limit musi wynosić co najmniej 1.")
  .max(MAKSYMALNY_LIMIT_REKORDOW, `Limit nie może przekraczać ${MAKSYMALNY_LIMIT_REKORDOW}.`)
  .default(DOMYSLNY_LIMIT_REKORDOW)
  .describe("Maksymalna liczba rekordów w odpowiedzi.");

const schematTekstuKrotkiego = z.string().trim().min(1).max(200);
const MAKSYMALNA_DLUGOSC_EMAIL = 254;
const schematEmail = (komunikat: string) => z
  .string()
  .max(
    MAKSYMALNA_DLUGOSC_EMAIL,
    `Adres e-mail nie może przekraczać ${MAKSYMALNA_DLUGOSC_EMAIL} znaków.`,
  )
  .pipe(z.email(komunikat));
const schematDatyICzasuZakresu = z
  .string()
  .trim()
  .regex(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    "Podaj datę i czas w formacie RRRR-MM-DD GG:MM:SS.",
  )
  .describe("Lokalna data i czas EstiCRM w formacie RRRR-MM-DD GG:MM:SS.");

const schematDatyICzasuTerminu = z
  .string()
  .trim()
  .regex(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
    "Podaj datę i czas w formacie RRRR-MM-DD GG:MM.",
  )
  .describe("Lokalna data i czas EstiCRM w formacie RRRR-MM-DD GG:MM.");

const schematWyniku = z.object({
  ok: z.boolean(),
  opis: z.string(),
  dane: z.unknown().optional(),
  metadane: z
    .object({
      obcieto: z.boolean(),
      limit_rekordow: z.number().int(),
    })
    .optional(),
  blad: z
    .object({
      kod: z.string(),
      komunikat: z.string(),
    })
    .optional(),
});

const schematListyOfert = z
  .object({
    limit: schematLimitu,
    strona: z.number().int().min(1).max(10_000).default(1),
  })
  .strict();

const schematIdOferty = z.object({ id_oferty: schematId }).strict();
const schematIdKlienta = z
  .object({
    id_klienta: schematId,
    pokaz_dane_kontaktowe: z
      .boolean()
      .default(false)
      .describe("Ustaw true tylko wtedy, gdy dane kontaktowe są potrzebne do zadania."),
  })
  .strict();

const schematZakresuKalendarza = z
  .object({
    kalendarz: schematEmail("Kalendarz musi być adresem e-mail agenta."),
    od: schematDatyICzasuZakresu,
    do: schematDatyICzasuZakresu,
  })
  .strict();

async function wykonajBezpiecznie(
  opis: string,
  operacja: () => Promise<unknown>,
  opcje: OpcjeMinimalizacji = {},
): Promise<CallToolResult> {
  try {
    return wynikSukcesu(opis, await operacja(), opcje);
  } catch (blad: unknown) {
    return wynikBledu(blad);
  }
}

/** Tworzy serwer MCP z 11 wyspecjalizowanymi narzędziami odczytu i opcjonalnym zapisem. */
export function stworzSerwerMcp({
  usluga,
  wlaczZapisy = false,
}: OpcjeSerweraMcp): McpServer {
  const serwer = new McpServer({
    name: "esticrm-mcp",
    version: "0.1.0",
    title: "EstiCRM MCP",
  });

  serwer.registerTool(
    "esticrm_lista_ofert",
    {
      title: "Lista ofert EstiCRM",
      description:
        "Pobiera ograniczoną, stronicowaną listę ofert. Narzędzie jest tylko do odczytu.",
      inputSchema: schematListyOfert,
      outputSchema: schematWyniku,
      annotations: { ...adnotacjeOdczytu, title: "Lista ofert EstiCRM" },
    },
    ({ limit, strona }) =>
      wykonajBezpiecznie(
        `Pobrano listę ofert (strona ${strona}, limit ${limit}).`,
        () => usluga.listaOfert({ limit, strona }),
        { limitRekordow: limit },
      ),
  );

  serwer.registerTool(
    "esticrm_szczegoly_oferty",
    {
      title: "Szczegóły oferty EstiCRM",
      description: "Pobiera szczegóły jednej oferty po jej identyfikatorze.",
      inputSchema: schematIdOferty,
      outputSchema: schematWyniku,
      annotations: { ...adnotacjeOdczytu, title: "Szczegóły oferty EstiCRM" },
    },
    ({ id_oferty }) =>
      wykonajBezpiecznie("Pobrano szczegóły oferty.", () =>
        usluga.szczegolyOferty({ idOferty: id_oferty }),
      ),
  );

  serwer.registerTool(
    "esticrm_dane_klienta",
    {
      title: "Dane klienta EstiCRM",
      description:
        "Pobiera dane jednego klienta. Dane kontaktowe są domyślnie ukryte i pojawiają się tylko po jawnym ustawieniu parametru.",
      inputSchema: schematIdKlienta,
      outputSchema: schematWyniku,
      annotations: { ...adnotacjeOdczytu, title: "Dane klienta EstiCRM" },
    },
    ({ id_klienta, pokaz_dane_kontaktowe }) =>
      wykonajBezpiecznie(
        "Pobrano dane klienta.",
        () => usluga.klient({ idKlienta: id_klienta }),
        { ukryjDaneKontaktowe: !pokaz_dane_kontaktowe },
      ),
  );

  serwer.registerTool(
    "esticrm_oferty_klienta",
    {
      title: "Oferty klienta EstiCRM",
      description: "Pobiera ograniczoną listę ofert przypisanych do jednego klienta.",
      inputSchema: z
        .object({
          id_klienta: schematId,
          limit: schematLimitu,
        })
        .strict(),
      outputSchema: schematWyniku,
      annotations: { ...adnotacjeOdczytu, title: "Oferty klienta EstiCRM" },
    },
    ({ id_klienta, limit }) =>
      wykonajBezpiecznie(
        `Pobrano oferty klienta (limit ${limit}).`,
        () => usluga.ofertyKlienta({ idKlienta: id_klienta, limit }),
        { limitRekordow: limit },
      ),
  );

  serwer.registerTool(
    "esticrm_lista_agentow",
    {
      title: "Lista agentów EstiCRM",
      description: "Pobiera ograniczoną listę agentów bez ujawniania danych kontaktowych.",
      inputSchema: z.object({ limit: schematLimitu }).strict(),
      outputSchema: schematWyniku,
      annotations: { ...adnotacjeOdczytu, title: "Lista agentów EstiCRM" },
    },
    ({ limit }) =>
      wykonajBezpiecznie(
        `Pobrano listę agentów (limit ${limit}).`,
        () => usluga.listaAgentow({ limit }),
        { limitRekordow: limit },
      ),
  );

  serwer.registerTool(
    "esticrm_wyszukaj_lokalizacje",
    {
      title: "Wyszukiwanie lokalizacji EstiCRM",
      description: "Wyszukuje lokalizacje po krótkiej frazie i ogranicza liczbę wyników.",
      inputSchema: z
        .object({
          fraza: schematTekstuKrotkiego,
          limit: schematLimitu,
        })
        .strict(),
      outputSchema: schematWyniku,
      annotations: { ...adnotacjeOdczytu, title: "Wyszukiwanie lokalizacji EstiCRM" },
    },
    ({ fraza, limit }) =>
      wykonajBezpiecznie(
        `Wyszukano lokalizacje dla frazy „${fraza}” (limit ${limit}).`,
        () => usluga.wyszukajLokalizacje({ fraza, limit }),
        { limitRekordow: limit },
      ),
  );

  serwer.registerTool(
    "esticrm_pobierz_slownik",
    {
      title: "Słownik EstiCRM",
      description:
        "Pobiera jeden z trzech słowników: ofert, mapowania ofert albo systemowy. Nie pozwala wywołać dowolnej ścieżki API.",
      inputSchema: z
        .object({
          rodzaj: z.enum(["oferty", "mapowanie_ofert", "systemowy"]),
          nazwa: z.string().trim().min(1).max(100).optional(),
        })
        .strict(),
      outputSchema: schematWyniku,
      annotations: { ...adnotacjeOdczytu, title: "Słownik EstiCRM" },
    },
    ({ rodzaj, nazwa }) => {
      const operacja =
        rodzaj === "oferty"
          ? () => usluga.slownikOfert({ nazwa })
          : rodzaj === "mapowanie_ofert"
            ? () => usluga.mapowanieOfert({ nazwa })
            : () => usluga.slownikSystemowy({ nazwa });

      return wykonajBezpiecznie(`Pobrano słownik: ${rodzaj}.`, operacja, {
        limitRekordow: MAKSYMALNY_LIMIT_REKORDOW,
      });
    },
  );

  serwer.registerTool(
    "esticrm_sprawdz_termin",
    {
      title: "Sprawdzenie terminu EstiCRM",
      description:
        "Sprawdza dostępność terminu w kalendarzu wskazanym adresem e-mail agenta.",
      inputSchema: schematZakresuKalendarza,
      outputSchema: schematWyniku,
      annotations: { ...adnotacjeOdczytu, title: "Sprawdzenie terminu EstiCRM" },
    },
    ({ kalendarz, od, do: dataDo }) =>
      wykonajBezpiecznie("Sprawdzono dostępność terminu.", () =>
        usluga.sprawdzTermin({ kalendarz, dataOd: od, dataDo }),
      ),
  );

  serwer.registerTool(
    "esticrm_wydarzenia_kalendarza",
    {
      title: "Wydarzenia kalendarza EstiCRM",
      description:
        "Pobiera ograniczoną listę wydarzeń z kalendarza wskazanego adresem e-mail agenta.",
      inputSchema: schematZakresuKalendarza
        .extend({ limit: schematLimitu })
        .strict(),
      outputSchema: schematWyniku,
      annotations: { ...adnotacjeOdczytu, title: "Wydarzenia kalendarza EstiCRM" },
    },
    ({ kalendarz, od, do: dataDo, limit }) =>
      wykonajBezpiecznie(
        `Pobrano wydarzenia kalendarza (limit ${limit}).`,
        () =>
          usluga.wydarzeniaKalendarza({
            kalendarz,
            dataOd: od,
            dataDo,
            limit,
          }),
        { limitRekordow: limit },
      ),
  );

  serwer.registerTool(
    "esticrm_lista_inwestycji",
    {
      title: "Lista inwestycji EstiCRM",
      description: "Pobiera lub filtruje ograniczoną listę inwestycji.",
      inputSchema: z
        .object({
          fraza: z.string().trim().min(1).max(200).optional(),
          limit: schematLimitu,
        })
        .strict(),
      outputSchema: schematWyniku,
      annotations: { ...adnotacjeOdczytu, title: "Lista inwestycji EstiCRM" },
    },
    ({ fraza, limit }) =>
      wykonajBezpiecznie(
        `Pobrano listę inwestycji (limit ${limit}).`,
        () => usluga.listaInwestycji({ fraza, limit }),
        { limitRekordow: limit },
      ),
  );

  serwer.registerTool(
    "esticrm_lista_biur",
    {
      title: "Lista biur EstiCRM",
      description: "Pobiera ograniczoną listę biur.",
      inputSchema: z.object({ limit: schematLimitu }).strict(),
      outputSchema: schematWyniku,
      annotations: { ...adnotacjeOdczytu, title: "Lista biur EstiCRM" },
    },
    ({ limit }) =>
      wykonajBezpiecznie(
        `Pobrano listę biur (limit ${limit}).`,
        () => usluga.listaBiur({ limit }),
        { limitRekordow: limit },
      ),
  );

  if (wlaczZapisy) {
    serwer.registerTool(
      "esticrm_utworz_zapytanie",
      {
        title: "Utworzenie zapytania w EstiCRM",
        description:
          "Tworzy nowe zapytanie klienta. Narzędzie zmienia dane i jest dostępne tylko po jawnym włączeniu zapisów.",
        inputSchema: z
          .object({
            imie: z.string().trim().max(100).optional(),
            nazwisko: z.string().trim().max(100).optional(),
            email: schematEmail("Podaj poprawny adres e-mail.").optional(),
            telefon: z.string().trim().max(40).optional(),
            email_agenta: schematEmail("Podaj poprawny adres e-mail agenta."),
            transakcja: schematId,
            rynek: schematId,
            id_typu: schematId,
            wiadomosc: z.string().trim().min(1).max(4_000),
            numer_oferty: schematId.optional(),
          })
          .strict(),
        outputSchema: schematWyniku,
        annotations: {
          ...adnotacjeZapisu,
          title: "Utworzenie zapytania w EstiCRM",
        },
      },
      ({
        imie,
        nazwisko,
        email,
        telefon,
        email_agenta,
        transakcja,
        rynek,
        id_typu,
        wiadomosc,
        numer_oferty,
      }) =>
        wykonajBezpiecznie("Utworzono zapytanie w EstiCRM.", () =>
          usluga.utworzZapytanie({
            imie,
            nazwisko,
            email,
            telefon,
            emailAgenta: email_agenta,
            transakcja,
            rynek,
            idTypu: id_typu,
            wiadomosc,
            numerOferty: numer_oferty,
          }),
        ),
    );

    serwer.registerTool(
      "esticrm_utworz_termin",
      {
        title: "Utworzenie terminu w EstiCRM",
        description:
          "Tworzy termin w kalendarzu agenta. Narzędzie zmienia dane i jest dostępne tylko po jawnym włączeniu zapisów.",
        inputSchema: z
          .object({
            tytul: z.string().trim().min(1).max(200),
            kalendarz: schematEmail("Kalendarz musi być adresem e-mail agenta."),
            od: schematDatyICzasuTerminu,
            do: schematDatyICzasuTerminu,
            typ: schematId.default(1),
            numer_oferty: schematId.optional(),
            dane_klienta: z
              .object({
                imie: z.string().trim().max(100).optional(),
                nazwisko: z.string().trim().max(100).optional(),
                email: schematEmail("Podaj poprawny adres e-mail klienta.").optional(),
                telefon: z.string().trim().max(40).optional(),
              })
              .strict()
              .optional(),
            opis: z.string().trim().max(2_000).optional(),
            caly_dzien: z.boolean().default(false),
          })
          .strict(),
        outputSchema: schematWyniku,
        annotations: {
          ...adnotacjeZapisu,
          title: "Utworzenie terminu w EstiCRM",
        },
      },
      ({
        tytul,
        kalendarz,
        od,
        do: dataDo,
        typ,
        numer_oferty,
        dane_klienta,
        opis,
        caly_dzien,
      }) =>
        wykonajBezpiecznie("Utworzono termin w EstiCRM.", () =>
          usluga.utworzTermin({
            tytul,
            kalendarz,
            dataOd: od,
            dataDo,
            typ,
            numerOferty: numer_oferty,
            daneKlienta: dane_klienta,
            opis,
            calyDzien: caly_dzien,
          }),
        ),
    );
  }

  return serwer;
}

export const stworzSerwerEstiCrm = stworzSerwerMcp;
