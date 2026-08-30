/** Typy JSON obsługiwane przez API EstiCRM. */
export type WartoscJson =
  | string
  | number
  | boolean
  | null
  | WartoscJson[]
  | { [klucz: string]: WartoscJson };

export type ObiektJson = { [klucz: string]: WartoscJson | undefined };

export type IdEstiCRM = string | number;

export type ParametrZapytania = string | number | boolean | null | undefined;

export interface ParametryListyOfert {
  limit?: number;
  strona?: number;
  skip?: number;
  take?: number;
}

export interface ZakresKalendarza {
  start?: string;
  end?: string;
  calendar?: string;
  dataOd?: string;
  dataDo?: string;
  kalendarz?: string;
  emailAgenta?: string;
  limit?: number;
}

export interface PolskieDaneZapytania {
  emailAgenta: string;
  transakcja: IdEstiCRM;
  rynek: IdEstiCRM;
  idTypu: IdEstiCRM;
  imie?: string;
  nazwisko?: string;
  email?: string;
  telefon?: string;
  wiadomosc: string;
  numerOferty?: IdEstiCRM;
}

export interface PolskieDaneTerminu {
  tytul: string;
  dataOd: string;
  dataDo: string;
  typ?: IdEstiCRM;
  kalendarz?: string;
  emailAgenta?: string;
  numerOferty?: IdEstiCRM;
  daneKlienta?: PolskieDaneKlientaTerminu;
  opis?: string;
  calyDzien?: boolean;
}

export interface PolskieDaneKlientaTerminu {
  imie?: string;
  nazwisko?: string;
  email?: string;
  telefon?: string;
}

/**
 * EstiCRM dopuszcza różne zestawy pól przy rejestracji zapytania.
 * Znane pola są opisane, a pozostałe pozostają jawnymi danymi JSON.
 */
export interface DaneZapytania extends ObiektJson {
  agent_email?: string;
  transaction?: string | number;
  market?: string | number;
  type_id?: string | number;
  content?: string;
  firstname?: string;
  lastname?: string;
  email?: string;
  phone?: string;
  message?: string;
  offer_number?: string | number;
}

export interface DaneKlientaTerminu {
  firstname?: string;
  lastname?: string;
  email?: string;
  phone?: string;
}

/** Dane wysyłane do calendar/store zgodnie z oficjalną kolekcją APIClient. */
export interface DaneTerminu extends ObiektJson {
  type: string | number;
  name: string;
  begin_date: string;
  begin_time: string;
  end_date: string;
  end_time: string;
  calendar: string;
  offer_number?: string | number;
  client_data?: WartoscJson;
  description?: string;
  allday?: 0 | 1;
}

export type KodBleduEstiCRM =
  | "KONFIGURACJA"
  | "ZAPIS_WYLACZONY"
  | "BRAK_UPRAWNIEN"
  | "BLAD_API"
  | "BLAD_HTTP"
  | "NIEPOPRAWNA_ODPOWIEDZ"
  | "ZBYT_DUZA_ODPOWIEDZ"
  | "PRZECIAZENIE"
  | "PRZEKROCZONY_CZAS"
  | "BLAD_SIECI";

/** Kontrolowany błąd, który nigdy nie zawiera adresu URL ani danych dostępowych. */
export class BladEstiCRM extends Error {
  public readonly kod: KodBleduEstiCRM;
  public readonly statusHttp?: number;

  public constructor(
    komunikat: string,
    kod: KodBleduEstiCRM,
    statusHttp?: number,
  ) {
    super(komunikat);
    this.name = "BladEstiCRM";
    this.kod = kod;
    this.statusHttp = statusHttp;
  }
}
