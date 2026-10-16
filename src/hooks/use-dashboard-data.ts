import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardData, ClientData } from "@/lib/data-parser";
import { dashboardDataSchema } from "@/lib/schemas";
import { toast } from "@/hooks/use-toast";
import { getClientContract, calculateCreditUsage } from "@/lib/contract-values";
import { analyzeConsumption } from "@/lib/month-progress";
import {
  carregarLimites, limitesDoCliente, classificarConsumo, TabelaLimites,
} from "@/lib/alert-thresholds";

function recalculateCreditUsage(
  data: DashboardData,
  tabela: TabelaLimites | null,
): DashboardData {
  const clients = data.clients.map((client) => {
    const contract = getClientContract(client.project);
    if (!contract) return { ...client, creditUsage: null };

    const valorConsumido = client.valorMensal;
    const usage = calculateCreditUsage(valorConsumido, contract.valorMensalCredito);
    const analysis = analyzeConsumption(usage.percentual, data.monthProgress);

    // Os limites vêm da configuração (geral ou do próprio cliente).
    // calculateCreditUsage ainda traz 60/80 fixos; aqui eles são substituídos.
    const limites = limitesDoCliente(client.project, tabela);
    const classificacao = classificarConsumo(usage.percentual, limites);

    return {
      ...client,
      creditUsage: {
        valorPago: contract.valorMensalPago,
        valorCredito: contract.valorMensalCredito,
        valorConsumido,
        percentualUsado: usage.percentual,
        isWarning: classificacao.isWarning,
        isCritical: classificacao.isCritical,
        analysis,
        statusConsumo: classificacao.status,
        limiteAtencao: limites.atencao,
        limiteRisco: limites.risco,
        limiteEstouro: limites.estouro,
        limiteProprio: limites.proprio,
        alertasAtivos: limites.alertasAtivos,
      },
    };
  });

  return { ...data, clients: clients as ClientData[] };
}

/**
 * @param habilitado só busca os dados de recorrentes quando true
 *   (usuário logado, perfil conhecido e com acesso a recorrentes).
 */
export function useDashboardData(habilitado = true) {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  // Flag to suppress Realtime toast when the current tab is the one importing
  const ownUpdateRef = useRef(false);
  // Limites de alerta configurados. Ficam em ref para o loadData não
  // precisar ser recriado quando eles chegam.
  const limitesRef = useRef<TabelaLimites | null>(null);
  const habilitadoRef = useRef(habilitado);
  habilitadoRef.current = habilitado;

  useEffect(() => {
    const handleContractUpdate = () => {
      setDashboardData(prev => prev ? recalculateCreditUsage(prev, limitesRef.current) : null);
    };
    window.addEventListener("contractValuesUpdated", handleContractUpdate);
    return () => window.removeEventListener("contractValuesUpdated", handleContractUpdate);
  }, []);

  const loadData = useCallback(async (fromRealtime = false) => {
    if (!habilitadoRef.current) {
      if (!fromRealtime) setIsLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("dashboard_data")
        .select("data, updated_at")
        .not("file_name", "in", '("__contract_values_config__","__prospeccao_snapshot__")')
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Error fetching dashboard data:", error);
        if (!fromRealtime) setDashboardData(null);
        return;
      }

      if (data?.data) {
        if (data.updated_at) setLastUpdated(new Date(data.updated_at));
        const result = dashboardDataSchema.safeParse(data.data);
        if (result.success) {
          const recalculated = recalculateCreditUsage(result.data as DashboardData, limitesRef.current);
          setDashboardData(recalculated);
          if (fromRealtime) {
            toast({ title: "Painel atualizado", description: "Novos dados foram importados." });
          }
        } else {
          console.error("Dashboard data validation failed:", result.error.issues);
          if (!fromRealtime) {
            toast({
              title: "Erro nos dados",
              description: "Dados do banco em formato inesperado. Reimporte a planilha.",
              variant: "destructive",
            });
            setDashboardData(null);
          }
        }
      } else {
        if (!fromRealtime) setDashboardData(null);
      }
    } catch (err) {
      console.error("Error loading dashboard data:", err);
      if (!fromRealtime) setDashboardData(null);
    } finally {
      if (!fromRealtime) setIsLoading(false);
    }
  }, []);

  // Carga inicial e quando o acesso muda (login, logout, troca de perfil).
  useEffect(() => {
    if (habilitado) {
      setIsLoading(true);
      loadData(false);
    } else {
      setDashboardData(null);
      setLastUpdated(null);
      setIsLoading(false);
    }
  }, [habilitado, loadData]);

  // Carrega os limites e reclassifica. Se chegarem depois dos dados,
  // o reclassify abaixo corrige a tela.
  useEffect(() => {
    if (!habilitado) return;
    let ativo = true;
    carregarLimites().then(tabela => {
      if (!ativo) return;
      limitesRef.current = tabela;
      setDashboardData(prev => prev ? recalculateCreditUsage(prev, tabela) : null);
    });
    const aoMudarLimites = () => {
      carregarLimites().then(tabela => {
        limitesRef.current = tabela;
        setDashboardData(prev => prev ? recalculateCreditUsage(prev, tabela) : null);
      });
    };
    window.addEventListener("alertLimitsUpdated", aoMudarLimites);
    return () => {
      ativo = false;
      window.removeEventListener("alertLimitsUpdated", aoMudarLimites);
    };
  }, [habilitado]);

  // Realtime: auto-refresh when another user imports data
  useEffect(() => {
    if (!habilitado) return;
    const channel = supabase
      .channel("dashboard_data_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "dashboard_data" }, (payload) => {
        if (ownUpdateRef.current) return;
        // A cópia do Funil de Prospecção mora na mesma tabela, mas não é dado de recorrentes
        const fileName = (payload.new as { file_name?: string } | null)?.file_name;
        if (fileName === "__prospeccao_snapshot__") return;
        loadData(true);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [habilitado, loadData]);

  const updateData = useCallback(async (data: DashboardData, fileName?: string) => {
    ownUpdateRef.current = true;
    setDashboardData(data);

    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      const { data: existing } = await supabase
        .from("dashboard_data")
        .select("id")
        .not("file_name", "in", '("__contract_values_config__","__prospeccao_snapshot__")')
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const jsonData = JSON.parse(JSON.stringify(data));

      if (existing) {
        await supabase
          .from("dashboard_data")
          .update({ data: jsonData, file_name: fileName || null, uploaded_by: userId || null })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("dashboard_data")
          .insert([{ data: jsonData, file_name: fileName || null, uploaded_by: userId || null }]);
      }

      setLastUpdated(new Date());

      // Monthly snapshot
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      const clientSnapshotData = data.clients
        .filter(c => c.valorMensal > 0)
        .map(c => ({ project: c.project, horasMensal: c.horasMensal, valorMensal: c.valorMensal }));

      await supabase
        .from("monthly_snapshots")
        .upsert({ month, year, total_horas: data.totalHoras, total_valor: data.totalValor, client_data: clientSnapshotData as any }, { onConflict: "month,year" });

    } catch (err) {
      console.error("Error saving dashboard data:", err);
    } finally {
      // Release the flag after enough time for the Realtime event to arrive
      setTimeout(() => { ownUpdateRef.current = false; }, 5000);
    }
  }, []);

  return { dashboardData, isLoading, updateData, lastUpdated };
}
