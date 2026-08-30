# Zasady bezpieczeństwa

Ten dokument wyjaśnia, jak bezpiecznie zgłosić podatność w nieoficjalnym serwerze EstiCRM MCP. Nie publikuj sekretów ani danych klientów w zgłoszeniu GitHub.

## Wspierane wersje

Poprawki bezpieczeństwa trafiają do najnowszej wersji projektu. Starsze wersje mogą nie otrzymywać poprawek.

| Wersja | Wsparcie |
| --- | --- |
| Najnowsza | Tak |
| Starsze | Nie |

## Zgłaszanie podatności

Wyślij prywatne zgłoszenie przez [GitHub Security Advisories](https://github.com/flatmoonsociety/esticrm-mcp/security/advisories/new). Nie twórz publicznego zgłoszenia błędu dla niezałatanej podatności.

Dołącz informacje potrzebne do odtworzenia problemu:

- wersję projektu i Node.js
- system operacyjny oraz klienta Model Context Protocol (MCP)
- opis wpływu i warunki wystąpienia
- minimalny sposób odtworzenia bez prawdziwych danych klientów
- proponowaną poprawkę, jeśli ją znasz

Nie dołączaj tokenu API, identyfikatora firmy, pełnych odpowiedzi EstiCRM ani danych osobowych. Jeśli sekret trafił do zgłoszenia, natychmiast unieważnij go w EstiCRM i utwórz nowy.

Opiekunowie projektu potwierdzą zgłoszenie po jego analizie. Termin poprawki zależy od wpływu, złożoności i możliwości zweryfikowania problemu.

## Zakres odpowiedzialności

Ten projekt nie kontroluje infrastruktury ani API EstiCRM. Problemy dotyczące samej usługi EstiCRM zgłaszaj bezpośrednio jej operatorowi. Zasady odpowiedzialnego ujawniania opisane tutaj dotyczą kodu w tym repozytorium.
