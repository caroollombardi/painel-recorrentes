import { useMemo } from "react";
import { DashboardData, ClientData } from "@/lib/data-parser";
import { ClientSnapshotData } from "@/hooks/use-monthly-snapshots";
import { MonthProgress } from "@/lib/month-progress";

interface FilteredKPIs {
  totalHoras: number;
  totalValor: number;
  avgHourlyRate: number;
  topClient: string;
  topClientHours: number;
  topClientValor: number;
  clientsAtWarning: number;
  clientsAtCritical: number;
  clientsAtRisk: number;
  clientsAtOverflow: number;
}

interface UseFilteredKPIsResult {
  filteredData: ClientData[];
  filteredKPIs: FilteredKPIs;
  clientList: string[];
  horasVariation: number | null;
  valorVariation: number | null;
  clientVariations: Record<string, number | null>;
  projected: number;
}

export function useFilteredKPIs(
  data: DashboardData,
  selectedClient: string,
  prevSnapshot: { total_horas: number; total_valor: number; client_data: unknown } | null,
  monthProgress?: MonthProgress
): UseFilteredKPIsResult {
  const filteredData = useMemo<ClientData[]>(() => {
    if (selectedClient !== "all") {
      return data.clients.filter((c) => c.project === selectedClient);
    }
    return data.clients;
  }, [data.clients, selectedClient]);

  const clientList = useMemo(() => data.clients.map((c) => c.project), [data.clients]);

  const filteredKPIs = useMemo<FilteredKPIs>(() => {
    const clients = filteredData;
    const totalHoras = clients.reduce((sum, c) => sum + c.horasMensal, 0);
    const totalValor = clients.reduce((sum, c) => sum + c.valorMensal, 0);
    const avgHourlyRate = totalHoras > 0 ? totalValor / totalHoras : 0;

    let topClient = "";
    let topClientHours = 0;
    let topClientValor = 0;
    clients.forEach((c) => {
      if (c.horasMensal > topClientHours) {
        topClientHours = c.horasMensal;
        topClientValor = c.valorMensal;
        topClient = c.project;
      }
    });

    let clientsAtWarning = 0;
    let clientsAtCritical = 0;
    let clientsAtRisk = 0;
    let clientsAtOverflow = 0;
    clients.forEach((c) => {
      if (c.creditUsage) {
        const pct = c.creditUsage.percentualUsado;
        if (pct >= 100) { clientsAtOverflow++; clientsAtCritical++; }
        else if (pct >= 80) { clientsAtRisk++; clientsAtCritical++; }
        else if (pct >= 60) { clientsAtWarning++; }
      }
    });

    return { totalHoras, totalValor, avgHourlyRate, topClient, topClientHours, topClientValor, clientsAtWarning, clientsAtCritical, clientsAtRisk, clientsAtOverflow };
  }, [filteredData]);

  const horasVariation = useMemo(() => {
    if (!prevSnapshot || prevSnapshot.total_horas <= 0) return null;
    return ((filteredKPIs.totalHoras - prevSnapshot.total_horas) / prevSnapshot.total_horas) * 100;
  }, [prevSnapshot, filteredKPIs.totalHoras]);

  const valorVariation = useMemo(() => {
    if (!prevSnapshot || prevSnapshot.total_valor <= 0) return null;
    return ((filteredKPIs.totalValor - prevSnapshot.total_valor) / prevSnapshot.total_valor) * 100;
  }, [prevSnapshot, filteredKPIs.totalValor]);

  const clientVariations = useMemo(() => {
    if (!prevSnapshot) return {};
    const map: Record<string, number | null> = {};
    const prevClients = prevSnapshot.client_data as ClientSnapshotData[];
    if (!Array.isArray(prevClients)) return {};
    prevClients.forEach((pc) => {
      map[pc.project] = pc.horasMensal;
    });
    return map;
  }, [prevSnapshot]);

  const projected = useMemo(() => {
    const pct = (monthProgress ?? data.monthProgress).percentElapsed;
    return pct > 0 ? filteredKPIs.totalValor / (pct / 100) : filteredKPIs.totalValor;
  }, [filteredKPIs.totalValor, monthProgress, data.monthProgress]);

  return { filteredData, filteredKPIs, clientList, horasVariation, valorVariation, clientVariations, projected };
}
