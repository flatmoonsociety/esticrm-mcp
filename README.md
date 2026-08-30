# Połącz EstiCRM z klientem MCP

Ten projekt uruchamia lokalny serwer Model Context Protocol (MCP), który udostępnia wybrane operacje EstiCRM w Codexie, Claude Code i Claude Desktop. Każda osoba używa własnego identyfikatora firmy oraz tokenu API, a narzędzia zapisujące dane pozostają domyślnie wyłączone.

> [!WARNING]
> To projekt społecznościowy, nieoficjalny i niepowiązany z EstiCRM. Nie jest produktem, usługą ani integracją zatwierdzoną przez operatora EstiCRM. Przed użyciem na danych produkcyjnych sprawdź aktualne warunki usługi i zakres uprawnień swojego konta.

## Co umożliwia serwer

Serwer tłumaczy polskie wywołania narzędzi MCP na ograniczony zestaw operacji APIClient EstiCRM. Działa lokalnie przez standardowe wejście i wyjście procesu (`stdio`), bez własnego serwera HTTP i bez wspólnego konta pośredniczącego.

Projekt obejmuje:

- polskie nazwy, opisy i komunikaty narzędzi
- bezpieczne ustawienia domyślne tylko do odczytu
- maskowanie danych kontaktowych klienta w domyślnym widoku
- walidację argumentów przed wysłaniem żądania
- kontrolowany odstęp między żądaniami i limit czasu
- rozpoznawanie błędu zwróconego przez EstiCRM z kodem HTTP 200
- opcjonalne narzędzia zapisu wymagające jawnego włączenia
- testy bez prawdziwych danych EstiCRM

## Wymagania przed instalacją

Do uruchomienia potrzebujesz:

- Node.js 20.19 lub nowszego z linii 20 albo Node.js 22.12 lub nowszego, w tym Node.js 24
- pnpm, najlepiej włączonego przez Corepack
- konta EstiCRM z dostępem do API
- własnych wartości `ESTICRM_COMPANY_ID` i `ESTICRM_API_TOKEN`
- klienta obsługującego lokalne serwery MCP przez `stdio`

Dostępność poszczególnych operacji zależy od planu i uprawnień nadanych przez EstiCRM. Jeśli nie widzisz danych API w panelu, skontaktuj się z [pomocą EstiCRM](https://www.esticrm.pl/kontakt).

## Zainstaluj projekt z GitHuba

Repozytorium możesz sklonować i zbudować lokalnie:

```bash
git clone https://github.com/flatmoonsociety/esticrm-mcp.git
cd esticrm-mcp
corepack enable
pnpm install --frozen-lockfile
pnpm build
```

Projekt nie wymaga globalnej instalacji pakietu. Klient MCP uruchamia zbudowany plik `dist/index.js` przy każdym połączeniu.

Pakiet jest oznaczony jako prywatny dla rejestrów npm i nie jest przeznaczony do publikacji w npm. Współdzielenie projektu odbywa się przez to repozytorium GitHub.

## Skonfiguruj dane dostępowe

Utwórz lokalny plik `.env` z dostarczonego wzoru i ogranicz jego uprawnienia:

```bash
cp .env.example .env
chmod 600 .env
```

W Windows PowerShell użyj `Copy-Item .env.example .env` i pomiń polecenie `chmod`.

Otwórz `.env`, a następnie zastąp dwa opisowe symbole zastępcze własnymi danymi:

```dotenv
ESTICRM_COMPANY_ID=wpisz_id_firmy
ESTICRM_API_TOKEN=wpisz_token_api
ESTICRM_ENABLE_WRITES=false
ESTICRM_TIMEOUT_MS=15000
ESTICRM_REQUEST_INTERVAL_MS=1100
ESTICRM_MAX_RESPONSE_BYTES=2097152
ESTICRM_MAX_ACTIVE_REQUESTS=25
```

Plik `.env` jest ignorowany przez Git. Nie przekazuj go innym osobom i nie dodawaj jego zawartości do zgłoszeń błędów.

Opcjonalne ustawienia mają następujące znaczenie:

| Zmienna | Wartość domyślna | Działanie |
| --- | --- | --- |
| `ESTICRM_ENABLE_WRITES` | `false` | Udostępnia narzędzia zapisujące po ustawieniu `true` |
| `ESTICRM_TIMEOUT_MS` | `15000` | Przerywa pojedyncze żądanie po podanej liczbie milisekund |
| `ESTICRM_REQUEST_INTERVAL_MS` | `1100` | Ustawia minimalny odstęp między żądaniami w milisekundach |
| `ESTICRM_MAX_RESPONSE_BYTES` | `2097152` | Ogranicza rozmiar treści pojedynczej odpowiedzi do podanej liczby bajtów, domyślnie 2 MiB |
| `ESTICRM_MAX_ACTIVE_REQUESTS` | `25` | Odrzuca nowe operacje, gdy liczba trwających i oczekujących wywołań osiągnie limit |

Ustawienie zapisu akceptuje także `1` lub `tak`. Pozostaw `false`, jeśli potrzebujesz wyłącznie odczytu.

## Połącz serwer z Codexem

Codex może zapisać konfigurację lokalnego serwera jednym poleceniem. Zastąp obie ścieżki pełną ścieżką do sklonowanego repozytorium:

```bash
codex mcp add esticrm -- \
  node \
  --env-file=/Users/jan/projekty/esticrm-mcp/.env \
  /Users/jan/projekty/esticrm-mcp/dist/index.js
```

Sprawdź konfigurację poleceniem `codex mcp list`. Sekrety pozostają w pliku `.env` i nie trafiają do historii poleceń.

W Windows PowerShell użyj znaku kontynuacji wiersza właściwego dla tej powłoki:

```powershell
codex mcp add esticrm -- `
  node `
  --env-file=C:/Users/jan/projekty/esticrm-mcp/.env `
  C:/Users/jan/projekty/esticrm-mcp/dist/index.js
```

## Połącz serwer z Claude

Claude Code odczytuje projektową konfigurację z pliku `.mcp.json`. Claude Desktop używa tego samego obiektu `mcpServers` w swoim pliku `claude_desktop_config.json`. Na macOS znajdziesz ten plik w `~/Library/Application Support/Claude/`, a w Windows w `%APPDATA%\Claude\`.

```json
{
  "mcpServers": {
    "esticrm": {
      "type": "stdio",
      "command": "node",
      "args": [
        "--env-file=/Users/jan/projekty/esticrm-mcp/.env",
        "/Users/jan/projekty/esticrm-mcp/dist/index.js"
      ]
    }
  }
}
```

Zastąp przykładową nazwę `jan` i ścieżki pełną lokalizacją repozytorium. W Windows możesz użyć ścieżek z ukośnikami, na przykład `C:/Users/jan/projekty/esticrm-mcp/.env`. Uruchom ponownie aplikację Claude, a następnie sprawdź listę połączeń MCP. Projektowego pliku `.mcp.json` nie dodawaj do publicznego repozytorium, jeśli zawiera ustawienia właściwe dla Twojego środowiska.

## Dostępne narzędzia MCP

Wersja 0.1 udostępnia polski interfejs do najczęstszych operacji. Dokładny wynik zależy od odpowiedzi API i uprawnień konta.

| Narzędzie | Tryb | Zastosowanie |
| --- | --- | --- |
| `esticrm_lista_ofert` | Odczyt | Pobiera stronicowaną listę ofert przez udokumentowane parametry `skip` i `take` |
| `esticrm_szczegoly_oferty` | Odczyt | Pobiera szczegóły jednej oferty |
| `esticrm_dane_klienta` | Odczyt | Pobiera klienta, domyślnie z ukrytymi danymi kontaktowymi |
| `esticrm_oferty_klienta` | Odczyt | Pobiera oferty powiązane z klientem |
| `esticrm_lista_agentow` | Odczyt | Pobiera listę agentów |
| `esticrm_wyszukaj_lokalizacje` | Odczyt | Wyszukuje lokalizacje obsługiwane przez EstiCRM |
| `esticrm_pobierz_slownik` | Odczyt | Pobiera obsługiwany słownik ofert, mapowania lub systemowy |
| `esticrm_sprawdz_termin` | Odczyt | Sprawdza dostępność terminu w kalendarzu |
| `esticrm_wydarzenia_kalendarza` | Odczyt | Pobiera wydarzenia z zadanego zakresu |
| `esticrm_lista_inwestycji` | Odczyt | Pobiera listę inwestycji |
| `esticrm_lista_biur` | Odczyt | Pobiera listę biur |
| `esticrm_utworz_zapytanie` | Zapis | Tworzy zapytanie klienta po włączeniu zapisów |
| `esticrm_utworz_termin` | Zapis | Tworzy termin po włączeniu zapisów |

Klient MCP nie zobaczy dwóch narzędzi zapisu, dopóki `ESTICRM_ENABLE_WRITES` ma wartość `false`. Po zmianie ustawienia uruchom klienta ponownie i uważnie sprawdzaj argumenty każdego zapisu.

Narzędzia kalendarza przyjmują lokalny czas EstiCRM. Odczyt zakresu wymaga formatu `RRRR-MM-DD GG:MM:SS`, a utworzenie terminu — `RRRR-MM-DD GG:MM`. Publiczny kontrakt zapisu odpowiada bieżącym przykładom EstiCRM: zapytanie przekazuje między innymi e-mail agenta, transakcję, rynek i typ, natomiast termin może przekazać `dane_klienta` oraz `numer_oferty`. Pola zapisu nie są oznaczone w dokumentacji jako wymagane lub opcjonalne, dlatego przed użyciem produkcyjnym sprawdź je na własnym koncie testowym.

## Ograniczenia API EstiCRM

Ten serwer służy do celowanych, interaktywnych operacji. Oficjalne materiały EstiCRM zalecają XML do pełnej lub masowej synchronizacji ofert z własną stroną. Nie używaj narzędzi MCP do cyklicznego pobierania całej bazy ani jako zamiennika eksportu XML.

Publiczna dokumentacja APIClient zawiera nieścisłości, w tym opisy wyglądające na skopiowane między operacjami. Projekt implementuje tylko jawnie obsługiwane wywołania i zabezpiecza ich kontrakty testami. Przed dodaniem kolejnej operacji potwierdź jej zachowanie na koncie testowym lub z pomocą EstiCRM.

W szczególności `offer/list` otrzymuje wyłącznie opublikowane parametry `skip` i `take`. Projekt celowo nie wysyła do tej operacji nieudokumentowanych filtrów `status`, `type`, `transaction`, `phrase` ani `updateDate`.

API może odpowiedzieć kodem HTTP 200 oraz `result: false`. Serwer sprawdza treść odpowiedzi, zamiast uznawać każdy kod 200 za sukces. Adres bazowy API jest celowo stały i nie można skierować tokenu na inny serwer przez zmienną środowiskową.

## Chroń dane i zachowaj zgodność z RODO

Odpowiadasz za podstawę prawną, zakres i sposób przetwarzania danych pobranych z własnego konta. Ogólne rozporządzenie o ochronie danych (RODO) wymaga między innymi minimalizacji danych i ograniczenia dostępu.

Stosuj następujące zasady:

- nadaj tokenowi najmniejszy dostęp potrzebny do zadania
- pozostaw narzędzia zapisu wyłączone, jeśli ich nie używasz
- nie wklejaj wyników zawierających dane osobowe do publicznych rozmów
- sprawdź politykę przechowywania danych używanego klienta i modelu
- regularnie zmieniaj token oraz unieważnij go po podejrzeniu ujawnienia
- usuń parametry zapytań i dane klientów przed udostępnieniem logów
- używaj fikcyjnych danych w testach, przykładach i zgłoszeniach

Serwer nie zapisuje tokenu w repozytorium i nie powinien umieszczać go w błędach. Sam klient MCP może jednak przekazać wynik narzędzia do wybranego modelu. Ogranicz zakres zapytania przed pobraniem danych.

Więcej zasad znajdziesz w dokumencie [Zasady bezpieczeństwa](SECURITY.md).

## Uruchom testy

Jedno polecenie sprawdza typy, testy, kompilację i połączenie MCP:

```bash
pnpm sprawdz
```

Możesz też uruchomić kontrole osobno:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
```

Testy muszą działać bez produkcyjnego konta EstiCRM. Nie dodawaj prawdziwych odpowiedzi API jako danych testowych.

## Współtwórz projekt

Zgłoszenia błędów i propozycje są mile widziane. Przed zmianą kodu przeczytaj [instrukcję współtworzenia](CONTRIBUTING.md), [kodeks postępowania](CODE_OF_CONDUCT.md), [zasady bezpieczeństwa](SECURITY.md) i [historię zmian](CHANGELOG.md).

## Oficjalne źródła

Te materiały pomagają zweryfikować zachowanie integracji:

- [dokumentacja APIClient EstiCRM](https://docs.client-api.esticrm.pl/)
- [wyjaśnienie EstiCRM dotyczące API i eksportu XML](https://www.esticrm.pl/czeste-pytania-biuro/jak-eksportowac-oferty-na-wlasna-strone-www)
- [kontakt z pomocą EstiCRM](https://www.esticrm.pl/kontakt)
- [specyfikacja Model Context Protocol](https://modelcontextprotocol.io/specification/latest)
- [oficjalny zestaw narzędzi MCP dla TypeScript](https://github.com/modelcontextprotocol/typescript-sdk)
- [dokumentacja lokalnych serwerów MCP w Codexie](https://developers.openai.com/codex/mcp/)
- [dokumentacja MCP w Claude Code](https://code.claude.com/docs/en/mcp)

## Licencja i znaki towarowe

Kod jest dostępny na warunkach [licencji MIT](LICENSE). Nazwa EstiCRM oraz powiązane znaki należą do ich właścicieli i występują tu wyłącznie w celu opisania kompatybilności.
