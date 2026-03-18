import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEasyJurCSV } from "@/lib/easyjur-parser";
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
});
