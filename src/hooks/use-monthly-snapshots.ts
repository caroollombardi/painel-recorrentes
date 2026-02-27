import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardData, ClientData } from "@/lib/data-parser";

export interface MonthlySnapshot {
  id: string;
  month: number;
  year: number;
  total_horas: number;
  total_valor: number;
  client_data: ClientSnapshotData[];
  created_at: string;
  updated_at: string;
}

export interface ClientSnapshotData {
  project: string;
  horasMensal: number;
  valorMensal: number;
}

export interface MonthComparison {
  totalHorasVariation: number | null; // percentage
  totalValorVariation: number | null;
  clientVariations: Record<string, { horasVariation: number | null; valorVariation: number | null }>;
}

export function useMonthlySnapshots() {
  const [snapshots, setSnapshots] = useState<MonthlySnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSnapshots = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("monthly_snapshots")
        .select("*")
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .limit(12);

      if (error) throw error;
      
      // Cast the data properly
      const typedData = (data || []).map((s: any) => ({
        ...s,
        total_horas: Number(s.total_horas),
        total_valor: Number(s.total_valor),
        client_data: (s.client_data || []) as ClientSnapshotData[],
      }));
      
      setSnapshots(typedData);
    } catch (err) {
      console.error("Error loading monthly snapshots:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  // Save a snapshot for the current data
  const saveSnapshot = useCallback(async (dashboardData: DashboardData, month: number, year: number) => {
    try {
      const clientData: ClientSnapshotData[] = dashboardData.clients
        .filter(c => c.valorMensal > 0)
        .map(c => ({
          project: c.project,
          horasMensal: c.horasMensal,
          valorMensal: c.valorMensal,
        }));

      const payload = {
        month: month + 1, // Convert 0-indexed to 1-indexed
        year,
        total_horas: dashboardData.totalHoras,
        total_valor: dashboardData.totalValor,
        client_data: clientData as any,
      };

      // Upsert based on month/year
      const { error } = await supabase
        .from("monthly_snapshots")
        .upsert(payload, { onConflict: "month,year" });

      if (error) throw error;
      await fetchSnapshots();
    } catch (err) {
      console.error("Error saving monthly snapshot:", err);
    }
  }, [fetchSnapshots]);

  // Get comparison data for a given month
  const getComparison = useCallback((currentMonth: number, currentYear: number): MonthComparison | null => {
    // Find previous month snapshot
    let prevMonth = currentMonth; // 0-indexed
    let prevYear = currentYear;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear -= 1;
    }
    // snapshots use 1-indexed months
    const prevSnapshot = snapshots.find(s => s.month === prevMonth && s.year === prevYear);
    
    if (!prevSnapshot) return null;

    return {
      totalHorasVariation: prevSnapshot.total_horas > 0
        ? null // we'll calculate from current data in the component
        : null,
      totalValorVariation: null,
      clientVariations: {},
    };
  }, [snapshots]);

  // Get previous month snapshot directly
  const getPreviousMonthSnapshot = useCallback((currentMonth: number, currentYear: number): MonthlySnapshot | null => {
    let prevMonth = currentMonth; // currentMonth is 0-indexed, snapshots are 1-indexed
    let prevYear = currentYear;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear -= 1;
    }
    return snapshots.find(s => s.month === prevMonth && s.year === prevYear) || null;
  }, [snapshots]);

  // Available months
  const availableMonths = snapshots.map(s => ({ month: s.month, year: s.year }));

  return {
    snapshots,
    availableMonths,
    isLoading,
    saveSnapshot,
    getPreviousMonthSnapshot,
    getComparison,
    refetch: fetchSnapshots,
  };
}
