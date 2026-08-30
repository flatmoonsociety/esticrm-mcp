#!/usr/bin/env node

import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { bezpiecznyBlad } from "./formatowanie.js";
import { KlientEstiCRM } from "./klient-esticrm.js";
import { wczytajKonfiguracje } from "./konfiguracja.js";
import { stworzSerwerMcp } from "./serwer.js";

function zapiszBladNaStderr(blad: unknown): void {
  const bezpieczny = bezpiecznyBlad(blad);
  process.stderr.write(`${bezpieczny.komunikat} (kod: ${bezpieczny.kod})\n`);
}

try {
  const konfiguracja = wczytajKonfiguracje();
  const usluga = new KlientEstiCRM(konfiguracja);

  serveStdio(
    () =>
      stworzSerwerMcp({
        usluga,
        wlaczZapisy: konfiguracja.zapisyWlaczone,
      }),
    { onerror: zapiszBladNaStderr },
  );
} catch (blad: unknown) {
  zapiszBladNaStderr(blad);
  process.exitCode = 1;
}
