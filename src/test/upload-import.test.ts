import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEasyJurCSV } from "@/lib/easyjur-parser";
import { parseImportDate } from "@/lib/import-date";
import { parseXLSXData } from "@/lib/xlsx-parser";

const csvText = readFileSync(
  resolve(process.cwd(), "src/test/fixtures/googleSheetsAdvancedSearchQueryCsv_2.csv"),
  "utf8"
);

describe("importação da planilha anexada", () => {
  it("rejeita o arquivo no fluxo EasyJur com mensagem clara", () => {
    const result = parseEasyJurCSV(csvText);

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("exportação do Asana");
  });

  it("lê o arquivo no fluxo padrão de Asana/clientes recorrentes", () => {
    const buffer = new TextEncoder().encode(csvText).buffer as ArrayBuffer;
    const result = parseXLSXData(buffer);

    expect(result.clients.length).toBeGreaterThan(0);
    expect(result.totalHoras).toBeGreaterThan(0);
    expect(result.clients.some((client) => client.project === "DATASOUL")).toBe(true);
  });

  it("preserva a data local ao importar timestamps com fuso", () => {
    expect(parseImportDate("2026-03-24T00:30:00-03:00")).toBe("2026-03-24");
    expect(parseImportDate("24/03/2026 08:15")).toBe("2026-03-24");
  });
});
