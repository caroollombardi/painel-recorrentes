import { describe, it, expect, vi } from "vitest";
import { fetchDashboardDataFromAsana } from "@/lib/asana-recorrentes-import";
import { lawyerPrices } from "@/lib/lawyer-prices";

describe("provisão de horas", () => {
  it("soma lançado e provisão por cliente", async () => {
    const adv = lawyerPrices[0].name;
    const rate = lawyerPrices[0].hourlyRate;
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        records: [{ taskId: "1", taskName: "Feito", project: "ACME", assignee: adv, actualTimeMinutes: 120, completedAt: "2026-11-02T10:00:00Z" }],
        provisoes: [
          { taskId: "2", taskName: "Aberta", project: "ACME", assignee: adv, estimatedMinutes: 180, dueOn: "2026-11-20" },
          { taskId: "3", taskName: "Sem dono", project: "ACME", assignee: "", estimatedMinutes: 60, dueOn: "2026-11-25" },
          { taskId: "4", taskName: "Sem estimativa", project: "ACME", assignee: adv, estimatedMinutes: null, dueOn: "2026-11-26" },
          { taskId: "5", taskName: "Só previsto", project: "BETA", assignee: adv, estimatedMinutes: 60, dueOn: "2026-11-26" },
        ],
      }),
    })));
    const d = await fetchDashboardDataFromAsana(["ACME", "BETA"]);
    const acme = d.clients.find((c) => c.project === "ACME")!;
    expect(acme.horasMensal).toBe(2);
    expect(acme.horasProvisionadas).toBe(4);
    expect(acme.valorProvisionado).toBeCloseTo(4 * rate);
    expect(acme.tarefasSemEstimativa).toBe(1);
    expect(acme.lawyers.map((l) => l.name)).toContain("Sem responsável");
    const beta = d.clients.find((c) => c.project === "BETA")!;
    expect(beta.horasMensal).toBe(0);
    expect(beta.horasProvisionadas).toBe(1);
  });
});
