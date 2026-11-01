import { describe, it, expect } from "vitest";
import {
  agruparRegistros, documentoDaTarefa, isTarefaDeRegistro, mediana, type RegistroTask,
} from "../../api/_lib/registros-core";

const proj = (gid: string, name: string) => [{ gid, name }];

function task(p: Partial<RegistroTask> & { name: string }): RegistroTask {
  return {
    gid: p.gid ?? Math.random().toString(36).slice(2),
    completed: p.completed ?? true,
    created_at: p.created_at ?? "2026-05-01T12:00:00Z",
    completed_at: p.completed_at ?? "2026-05-02T12:00:00Z",
    actual_time_minutes: p.actual_time_minutes ?? 10,
    assignee: p.assignee ?? { name: "Bruna Parolin" },
    projects: p.projects ?? proj("1", "JESSICA SCRIPES - Alteração Endereço JP"),
    ...p,
  };
}

describe("isTarefaDeRegistro", () => {
  it("reconhece tarefas de registro, protocolo e exigência na junta", () => {
    expect(isTarefaDeRegistro(task({ name: "Registrar 5ª ACS AAA Impac" }))).toBe(true);
    expect(isTarefaDeRegistro(task({ name: "Acompanhar Protocolo Registro PRP2618264870" }))).toBe(true);
    expect(isTarefaDeRegistro(task({ name: "Resolver exigência protocolo PRP2612970976" }))).toBe(true);
    expect(isTarefaDeRegistro(task({ name: "Registro de ACS na JUCEPAR" }))).toBe(true);
  });

  it("ignora registros que não são da junta comercial e tarefas de gestão", () => {
    expect(isTarefaDeRegistro(task({ name: "Registro de marca no INPI" }))).toBe(false);
    expect(isTarefaDeRegistro(task({ name: "Registro de decisões do projeto" }))).toBe(false);
    expect(isTarefaDeRegistro(task({ name: "Registrar horas no timesheet" }))).toBe(false);
    expect(isTarefaDeRegistro(task({ name: "Elaborar 23ª ACS" }))).toBe(false);
    // casos reais do Asana que são cartório, BACEN ou outros órgãos
    expect(isTarefaDeRegistro(task({ name: "Acompanhar Registro PoA Atomizer 205 RTD" }))).toBe(false);
    expect(isTarefaDeRegistro(task({ name: "Coordenar registro BACEN" }))).toBe(false);
    expect(isTarefaDeRegistro(task({ name: "LUCAS DZIERWA LIMA - CCV Boa Vista - Acompanhar Registro" }))).toBe(false);
    expect(isTarefaDeRegistro(task({ name: "FUP Protocolo no PROCEC Capc 01-277873/2026" }))).toBe(false);
    expect(isTarefaDeRegistro(task({ name: "REGISTRO DE MARCAS - Omnichat - Oposição Onechat" }))).toBe(false);
    // tarefa do modelo do funil de prospecção, presente em dezenas de projetos
    expect(isTarefaDeRegistro(task({ name: "Registrar motivo de perda" }))).toBe(false);
    expect(isTarefaDeRegistro(task({ name: "Formalizar e registrar conversa com a Seguradora" }))).toBe(false);
    expect(isTarefaDeRegistro(task({ name: "Registrar 2ª ACS na JUCESC" }))).toBe(true);
    expect(isTarefaDeRegistro(task({ name: "Continuar Registro de ata de AGE para renovação mandato conselheiros" }))).toBe(true);
    expect(isTarefaDeRegistro(task({ name: "Acompanhamento Assinaturas Registro 1ACS" }))).toBe(true);
    expect(isTarefaDeRegistro(task({
      name: "Registrar ACS", projects: proj("9", "Gestão de Projetos - Fundação com IA"),
    }))).toBe(false);
  });
});

describe("documentoDaTarefa", () => {
  it("identifica o documento registrado", () => {
    expect(documentoDaTarefa("Registrar 4ª ACS AAA Impact")).toBe("4ª ACS");
    expect(documentoDaTarefa("FUP registro 24ª ACS")).toBe("24ª ACS");
    expect(documentoDaTarefa("Acompanhamento Assinaturas Registro 1ACS")).toBe("1ª ACS");
    expect(documentoDaTarefa("Acompanhar Protocolo Registro PRP2618264870")).toBe("Registro");
    expect(documentoDaTarefa("Registrar ACS alteração endereço")).toBe("ACS");
    expect(documentoDaTarefa("Registro do Contrato Social")).toBe("Contrato social");
    expect(documentoDaTarefa("Registrar Estatuto Social")).toBe("Estatuto social");
    expect(documentoDaTarefa("Acompanhar protocolo PRP2611390169")).toBe("Registro");
  });
});

describe("agruparRegistros", () => {
  it("agrupa por projeto e documento e calcula horas, exigências e protocolos", () => {
    const agora = new Date("2026-10-31T12:00:00Z");
    const regs = agruparRegistros([
      task({ gid: "a", name: "Registrar ACS alteração endereço", actual_time_minutes: 167,
        created_at: "2026-04-09T12:00:00Z", completed_at: "2026-04-28T12:00:00Z" }),
      task({ gid: "b", name: "Acompanhar protocolo PRP2611390169 ACS", actual_time_minutes: 30 }),
      task({ gid: "c", name: "Refazer Protocolo de Registro PRP2611919400 ACS", actual_time_minutes: 58 }),
      task({ gid: "d", name: "Resolver exigência protocolo PRP2612970976 ACS", actual_time_minutes: 40,
        completed_at: "2026-07-07T12:00:00Z" }),
      task({ gid: "e", name: "Registrar 5ª ACS", projects: proj("2", "GENIA"), actual_time_minutes: null }),
      task({ gid: "f", name: "Acompanhar assinaturas registro 5ª ACS", projects: proj("2", "GENIA"),
        completed: false, completed_at: null, actual_time_minutes: null, created_at: "2026-10-20T12:00:00Z" }),
    ], agora);

    expect(regs).toHaveLength(2);
    const jessica = regs.find((r) => r.projectGid === "1")!;
    expect(jessica.documento).toBe("ACS");
    expect(jessica.minutos).toBe(167 + 30 + 58 + 40);
    expect(jessica.exigencias).toBe(2);
    expect(jessica.protocolos).toBe(3);
    expect(jessica.aberto).toBe(false);
    expect(jessica.diasCiclo).toBe(89);
    expect(jessica.minutosPorResponsavel).toEqual({ "Bruna Parolin": 295 });

    const genia = regs.find((r) => r.projectGid === "2")!;
    expect(genia.documento).toBe("5ª ACS");
    expect(genia.aberto).toBe(true);
    expect(genia.tarefasSemHora).toBe(1);
    expect(genia.tarefasAbertas).toHaveLength(1);
    expect(genia.diasCiclo).toBe(183);
  });

  it("não conta a mesma tarefa duas vezes", () => {
    const t = task({ gid: "x", name: "Registrar 22ª ACS" });
    expect(agruparRegistros([t, t])[0].tarefas).toBe(1);
  });
});

describe("mediana", () => {
  it("calcula para listas pares, ímpares e vazias", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
    expect(mediana([])).toBeNull();
  });
});
