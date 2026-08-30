#!/usr/bin/env node

import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/index.js"],
  cwd: process.cwd(),
  env: {
    ESTICRM_COMPANY_ID: "firma-testowa",
    ESTICRM_API_TOKEN: "token-testowy",
    ESTICRM_ENABLE_WRITES: "false",
    ESTICRM_REQUEST_INTERVAL_MS: "0",
  },
  stderr: "pipe",
});
const klient = new Client({ name: "test-integracyjny", version: "1.0.0" });
let stderr = "";

transport.stderr?.on("data", (fragment) => {
  stderr += String(fragment);
});

try {
  await klient.connect(transport);
  const { tools } = await klient.listTools();

  assert.equal(tools.length, 11, "Serwer powinien udostępniać 11 narzędzi odczytu.");
  assert.equal(
    tools.some(({ name }) => name.startsWith("esticrm_utworz_")),
    false,
    "Narzędzia zapisu nie mogą być domyślnie zarejestrowane.",
  );
  assert.equal(stderr, "", "Poprawny start serwera nie powinien zapisywać błędów na stderr.");

  process.stdout.write(
    "Test MCP zakończony powodzeniem: rzeczywisty proces stdio, 11 narzędzi, bez wywołań API.\n",
  );
} finally {
  await klient.close();
}
