# Jak współtworzyć projekt

Dziękujemy za zainteresowanie nieoficjalnym serwerem EstiCRM MCP. Możesz zgłaszać błędy, proponować narzędzia, poprawiać dokumentację i przesyłać zmiany kodu.

## Zanim zaczniesz

Przeczytaj [Kodeks postępowania](CODE_OF_CONDUCT.md) i sprawdź istniejące zgłoszenia. Podatności zgłaszaj prywatnie zgodnie z [zasadami bezpieczeństwa](SECURITY.md).

Nie umieszczaj w repozytorium:

- tokenów API ani identyfikatorów prawdziwych firm
- danych klientów, ofert lub pracowników
- odpowiedzi API pochodzących z konta produkcyjnego
- kopii dokumentów EstiCRM chronionych prawem autorskim

## Przygotowanie środowiska

Projekt wymaga Node.js 20.19 lub nowszego z linii 20 albo Node.js 22.12 lub nowszego oraz pnpm.

```bash
git clone https://github.com/flatmoonsociety/esticrm-mcp.git
cd esticrm-mcp
corepack enable
pnpm install --frozen-lockfile
```

Skopiuj konfigurację tylko wtedy, gdy testujesz połączenie ze swoim kontem:

```bash
cp .env.example .env
chmod 600 .env
```

Testy automatyczne muszą używać atrap i jednoznacznie fikcyjnych danych. Nie uruchamiaj testów jednostkowych przeciwko produkcyjnemu API.

## Wprowadzanie zmian

Pracuj w osobnej gałęzi i ogranicz zmianę do jednego celu. Zachowaj polskie nazwy oraz opisy narzędzi MCP. Nazwy techniczne i pola narzucone przez API mogą pozostać bez tłumaczenia.

Przed wysłaniem prośby o scalenie uruchom pełny zestaw kontroli:

```bash
pnpm sprawdz
```

Prośba o scalenie powinna zawierać:

- opis problemu i rozwiązania
- testy dla nowego zachowania
- aktualizację README, jeśli zmienia się konfiguracja lub lista narzędzi
- potwierdzenie, że zmiana nie zawiera sekretów ani danych osobowych

Utrzymuj kompatybilność wsteczną, jeśli zmiana nazw narzędzi lub ich parametrów nie jest konieczna. Opisz każdą zmianę niekompatybilną w prośbie o scalenie.

## Zgłaszanie błędów i pomysłów

Użyj szablonu błędu albo propozycji na GitHubie. Przed publikacją usuń z logów parametry zapytań, tokeny oraz dane osobowe. Dodaj minimalny przykład, który pozwala odtworzyć zachowanie bez dostępu do Twojego konta.

Przesyłając wkład, zgadzasz się udostępnić go na warunkach [licencji MIT](LICENSE).
