import { supabase } from "@/integrations/supabase/client";
import { DashboardData, ClientData, CreditUsage, LawyerWork } from "./data-parser";
import { getClientContract, calculateCreditUsage } from "./contract-values";
import { getMonthProgress, analyzeConsumption } from "./month-progress";
import { getLawyerHourlyRate } from "./lawyer-prices";
import { dashboardDataSchema } from "./schemas";
import type { ParsedEasyJurEntry } from "./easyjur-parser";

/**
 * After an EasyJur import, merge those entries into the existing dashboard_data
 * so the Recurring Clients dashboard reflects EasyJur hours too.
 * 
 * Strategy:
 * 1. Load current dashboard_data
 * 2. Remove the EasyJur professional's contributions from each client
 * 3. Add back from the full time_entries for that professional
 * 4. Recalculate credit usage and totals
 * 5. Save updated dashboard_data
 */
export async function mergeEasyJurIntoDashboard(
  assigneeName: string,
  month: number, // 0-indexed
  year: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Load current dashboard_data
    const { data: dbRow, error: fetchError } = await supabase
      .from("dashboard_data")
      .select("id, data")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError || !dbRow?.data) {
      console.warn("No dashboard_data found, skipping merge");
      return { success: true }; // Not an error, just no data to merge into
    }

    const parseResult = dashboardDataSchema.safeParse(dbRow.data);
    if (!parseResult.success) {
      return { success: false, error: "Dashboard data format invalid" };
    }

    const dashboardData = parseResult.data as DashboardData;

    // 2. Fetch all time_entries for this professional in this month
    const { data: timeEntries, error: teError } = await supabase
      .from("time_entries")
      .select("project, hours_logged")
      .eq("assignee", assigneeName)
      .eq("month", month + 1)
      .eq("year", year);

    if (teError) {
      return { success: false, error: teError.message };
    }

    const hourlyRate = getLawyerHourlyRate(assigneeName);

    // Group EasyJur entries by project
    const easyjurByProject = new Map<string, { hours: number; value: number }>();
    for (const entry of timeEntries || []) {
      const project = entry.project;
      const hours = Number(entry.hours_logged) || 0;
      const existing = easyjurByProject.get(project) || { hours: 0, value: 0 };
      existing.hours += hours;
      existing.value += hours * hourlyRate;
      easyjurByProject.set(project, existing);
    }

    // 3. Update each client in dashboard_data
    const monthProgress = getMonthProgress();
    let clientsAtWarning = 0;
    let clientsAtCritical = 0;
    let clientsAtRisk = 0;
    let clientsAtOverflow = 0;

    const updatedClients = dashboardData.clients.map(client => {
      // Remove this assignee's existing contribution from the client
      const otherLawyers = client.lawyers.filter(
        l => l.name.toLowerCase() !== assigneeName.toLowerCase()
      );

      // Check if EasyJur has data for this client
      const easyjurData = easyjurByProject.get(client.project);

      let lawyers: LawyerWork[] = [...otherLawyers];
      if (easyjurData && easyjurData.hours > 0) {
        lawyers.push({
          name: assigneeName,
          hours: Math.round(easyjurData.hours * 100) / 100,
          hourlyRate,
          value: Math.round(easyjurData.value * 100) / 100,
        });
        // Remove from map so we know what's been handled
        easyjurByProject.delete(client.project);
      }

      // Sort lawyers by hours descending
      lawyers.sort((a, b) => b.hours - a.hours);

      const clientHours = lawyers.reduce((sum, l) => sum + l.hours, 0);
      const clientValor = lawyers.reduce((sum, l) => sum + l.value, 0);

      // Recalculate credit usage
      const contract = getClientContract(client.project);
      let creditUsage: CreditUsage | null = null;

      if (contract) {
        const valorConsumido = Math.round(clientValor * 100) / 100;
        const usage = calculateCreditUsage(valorConsumido, contract.valorMensalCredito);
        const analysis = analyzeConsumption(usage.percentual, monthProgress);

        creditUsage = {
          valorPago: contract.valorMensalPago,
          valorCredito: contract.valorMensalCredito,
          valorConsumido,
          percentualUsado: usage.percentual,
          isWarning: usage.isWarning,
          isCritical: usage.isCritical,
          analysis,
        };

        if (usage.percentual >= 100) {
          clientsAtOverflow++;
          clientsAtCritical++;
        } else if (usage.percentual >= 80) {
          clientsAtRisk++;
          clientsAtCritical++;
        } else if (usage.percentual >= 60) {
          clientsAtWarning++;
        }
      }

      return {
        ...client,
        lawyers,
        horasMensal: Math.round(clientHours * 100) / 100,
        valorMensal: Math.round(clientValor * 100) / 100,
        creditUsage,
      };
    });

    // 4. Add new clients from EasyJur that weren't in dashboard_data yet
    for (const [project, data] of easyjurByProject) {
      const contract = getClientContract(project);
      if (!contract) continue; // Only add if it's a known contract client

      let creditUsage: CreditUsage | null = null;
      const valorConsumido = Math.round(data.value * 100) / 100;
      const usage = calculateCreditUsage(valorConsumido, contract.valorMensalCredito);
      const analysis = analyzeConsumption(usage.percentual, monthProgress);

      creditUsage = {
        valorPago: contract.valorMensalPago,
        valorCredito: contract.valorMensalCredito,
        valorConsumido,
        percentualUsado: usage.percentual,
        isWarning: usage.isWarning,
        isCritical: usage.isCritical,
        analysis,
      };

      if (usage.percentual >= 100) {
        clientsAtOverflow++;
        clientsAtCritical++;
      } else if (usage.percentual >= 80) {
        clientsAtRisk++;
        clientsAtCritical++;
      } else if (usage.percentual >= 60) {
        clientsAtWarning++;
      }

      updatedClients.push({
        project,
        horasMensal: Math.round(data.hours * 100) / 100,
        valorMensal: Math.round(data.value * 100) / 100,
        lawyers: [{
          name: assigneeName,
          hours: Math.round(data.hours * 100) / 100,
          hourlyRate,
          value: Math.round(data.value * 100) / 100,
        }],
        creditUsage,
      });
    }

    // Sort by value descending
    updatedClients.sort((a, b) => b.valorMensal - a.valorMensal);

    // 5. Recalculate totals
    const totalHoras = updatedClients.reduce((s, c) => s + c.horasMensal, 0);
    const totalValor = updatedClients.reduce((s, c) => s + c.valorMensal, 0);

    let topClient = '';
    let topClientHours = 0;
    let topClientValor = 0;
    for (const c of updatedClients) {
      if (c.horasMensal > topClientHours) {
        topClient = c.project;
        topClientHours = c.horasMensal;
        topClientValor = c.valorMensal;
      }
    }

    const avgHourlyRate = totalHoras > 0 ? totalValor / totalHoras : 0;

    const updatedData: DashboardData = {
      clients: updatedClients,
      totalHoras: Math.round(totalHoras * 100) / 100,
      totalValor: Math.round(totalValor * 100) / 100,
      topClient,
      topClientHours: Math.round(topClientHours * 100) / 100,
      topClientValor: Math.round(topClientValor * 100) / 100,
      avgHourlyRate: Math.round(avgHourlyRate * 100) / 100,
      clientsAtWarning,
      clientsAtCritical,
      clientsAtRisk,
      clientsAtOverflow,
      monthProgress,
    };

    // 6. Save back
    const jsonData = JSON.parse(JSON.stringify(updatedData));
    const { error: updateError } = await supabase
      .from("dashboard_data")
      .update({ data: jsonData, updated_at: new Date().toISOString() })
      .eq("id", dbRow.id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // Also update monthly snapshot
    const clientSnapshotData = updatedClients
      .filter(c => c.valorMensal > 0)
      .map(c => ({
        project: c.project,
        horasMensal: c.horasMensal,
        valorMensal: c.valorMensal,
      }));

    await supabase
      .from("monthly_snapshots")
      .upsert({
        month: month + 1,
        year,
        total_horas: updatedData.totalHoras,
        total_valor: updatedData.totalValor,
        client_data: clientSnapshotData as any,
      }, { onConflict: "month,year" });

    return { success: true };
  } catch (err: any) {
    console.error("Error merging EasyJur into dashboard:", err);
    return { success: false, error: err.message };
  }
}
