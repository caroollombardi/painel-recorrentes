import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardData } from "@/lib/data-parser";
import { dashboardDataSchema } from "@/lib/schemas";
import { toast } from "@/hooks/use-toast";

export function useDashboardData() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const { data, error } = await supabase
          .from("dashboard_data")
          .select("data")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error("Error fetching dashboard data:", error);
          setDashboardData(null);
          return;
        }

        if (data?.data) {
          const result = dashboardDataSchema.safeParse(data.data);
          if (result.success) {
            setDashboardData(result.data as DashboardData);
          } else {
            console.error("Dashboard data validation failed:", result.error.issues);
            toast({
              title: "Erro nos dados",
              description: "Dados do banco em formato inesperado. Reimporte a planilha.",
              variant: "destructive",
            });
            setDashboardData(null);
          }
        } else {
          setDashboardData(null);
        }
      } catch (err) {
        console.error("Error loading dashboard data:", err);
        setDashboardData(null);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  const updateData = useCallback(async (data: DashboardData, fileName?: string) => {
    setDashboardData(data);

    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      const { data: existing } = await supabase
        .from("dashboard_data")
        .select("id")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const jsonData = JSON.parse(JSON.stringify(data));

      if (existing) {
        await supabase
          .from("dashboard_data")
          .update({
            data: jsonData,
            file_name: fileName || null,
            uploaded_by: userId || null,
          })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("dashboard_data")
          .insert([{
            data: jsonData,
            file_name: fileName || null,
            uploaded_by: userId || null,
          }]);
      }

      // Save monthly snapshot
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      const clientSnapshotData = data.clients
        .filter(c => c.valorMensal > 0)
        .map(c => ({
          project: c.project,
          horasMensal: c.horasMensal,
          valorMensal: c.valorMensal,
        }));

      await supabase
        .from("monthly_snapshots")
        .upsert({
          month,
          year,
          total_horas: data.totalHoras,
          total_valor: data.totalValor,
          client_data: clientSnapshotData as any,
        }, { onConflict: "month,year" });

    } catch (err) {
      console.error("Error saving dashboard data:", err);
    }
  }, []);

  return { dashboardData, isLoading, updateData };
}
