import { supabase } from "@/integrations/supabase/client";

// cliente_alertas ainda fora do types.ts gerado. Apagar quando regerar os tipos.
const db = supabase as any;

export interface Limites {
  atencao: number;
  risco: number;
  estouro: number;
  /** true quando o cliente tem regra própria, false quando herda o geral. */
  proprio: boolean;
  alertasAtivos: boolean;
}

export const LIMITES_PADRAO: Limites = {
  atencao: 60, risco: 80, estouro: 100, proprio: false, alertasAtivos: true,
};

export interface TabelaLimites {
  padrao: Limites;
  porCliente: Map<string, Limites>;
}

const chave = (nome: string) => nome.trim().toLowerCase();

/**
 * Carrega os limites gerais e as regras por cliente.
 *
 * Os limites gerais vêm de alert_settings (aba Limites). As regras por
 * cliente vêm de cliente_alertas, onde campo nulo significa herdar o geral.
 * O nome do cliente e seus apelidos são indexados, porque o dashboard
 * identifica cliente por texto vindo da importação.
 */
export async function carregarLimites(): Promise<TabelaLimites> {
  const porCliente = new Map<string, Limites>();
  let padrao = { ...LIMITES_PADRAO };

  try {
    const { data: globais } = await supabase
      .from("alert_settings")
      .select("threshold_attention, threshold_risk, threshold_overflow")
      .maybeSingle();

    if (globais) {
      padrao = {
        atencao: globais.threshold_attention ?? LIMITES_PADRAO.atencao,
        risco: globais.threshold_risk ?? LIMITES_PADRAO.risco,
        estouro: globais.threshold_overflow ?? LIMITES_PADRAO.estouro,
        proprio: false,
        alertasAtivos: true,
      };
    }

    const { data: regras } = await db
      .from("clientes")
      .select("nome, apelidos, cliente_alertas(threshold_attention, threshold_risk, threshold_overflow, alertas_ativos)")
      .eq("ativo", true);

    for (const c of regras ?? []) {
      const r = c.cliente_alertas?.[0];
      if (!r) continue;

      const temAlgo =
        r.threshold_attention !== null || r.threshold_risk !== null ||
        r.threshold_overflow !== null || r.alertas_ativos === false;
      if (!temAlgo) continue;

      const limites: Limites = {
        atencao: r.threshold_attention ?? padrao.atencao,
        risco: r.threshold_risk ?? padrao.risco,
        estouro: r.threshold_overflow ?? padrao.estouro,
        proprio: true,
        alertasAtivos: r.alertas_ativos ?? true,
      };

      porCliente.set(chave(c.nome), limites);
      for (const a of c.apelidos ?? []) porCliente.set(chave(a), limites);
    }
  } catch (err) {
    // Sem acesso ou sem tabela: o painel segue com o padrão em vez de quebrar.
    console.error("Erro ao carregar limites de alerta:", err);
  }

  return { padrao, porCliente };
}

export function limitesDoCliente(nome: string, tabela: TabelaLimites | null): Limites {
  if (!tabela) return LIMITES_PADRAO;
  return tabela.porCliente.get(chave(nome)) ?? tabela.padrao;
}

export type StatusConsumo = "ok" | "atencao" | "risco" | "estouro";

/**
 * Classifica o consumo contra os limites configurados.
 *
 * isWarning e isCritical existem para manter o contrato antigo do painel:
 * o resto da interface já lê esses dois campos. A diferença é que agora
 * eles saem dos limites configurados, e não mais do 60/80 fixo no código.
 */
export function classificarConsumo(percentual: number, limites: Limites): {
  status: StatusConsumo;
  isWarning: boolean;
  isCritical: boolean;
} {
  if (percentual >= limites.estouro) {
    return { status: "estouro", isWarning: false, isCritical: true };
  }
  if (percentual >= limites.risco) {
    return { status: "risco", isWarning: false, isCritical: true };
  }
  if (percentual >= limites.atencao) {
    return { status: "atencao", isWarning: true, isCritical: false };
  }
  return { status: "ok", isWarning: false, isCritical: false };
}

export const ROTULO_STATUS: Record<StatusConsumo, string> = {
  ok: "Dentro do previsto",
  atencao: "Atenção",
  risco: "Risco de estouro",
  estouro: "Estourado",
};
