import * as XLSX from 'xlsx';
import { supabase } from "@/integrations/supabase/client";
import { parseXLSXData } from "./xlsx-parser";
import { DashboardData } from "./data-parser";

/**
 * Extract time entries from XLSX for the hours dashboard.
 * Uses the same Asana export file that feeds the recurring clients dashboard.
 */
export async function importTimeEntriesFromXLSX(
  fileBuffer: ArrayBuffer,
  month: number, // 0-indexed (JS month)
  year: number
): Promise<{ success: boolean; count: number }> {
  const workbook = XLSX.read(fileBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet, { raw: false });

  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;

  const newEntries: any[] = [];

  for (const row of jsonData) {
    const project = row['Projects'] || row['Project'] || row['Projeto'] || '';
    const actualTime = row['Actual time'] || row['Actual Time'] || row['Tempo Real'] || '';
    const completedAt = row['Completed At'] || row['Completed at'] || row['Data Conclusão'] || '';
    const assignee = row['Assignee'] || row['Responsável'] || '';
    const taskName = row['Name'] || row['Task Name'] || row['Nome da Tarefa'] || row['Task ID'] || 'Sem título';
    const client = row['Cliente'] || row['Client'] || '';
    const activityType = row['Tags'] || row['Tipo de Atividade'] || row['Tipo'] || '';

    if (!actualTime || !actualTime.trim()) continue;

    // Parse time (HH:MM format)
    let hours = 0;
    if (actualTime.includes(':')) {
      const parts = actualTime.trim().split(':');
      hours = (parseInt(parts[0]) || 0) + (parseInt(parts[1]) || 0) / 60;
    } else {
      hours = parseFloat(actualTime.replace(',', '.')) || 0;
    }
    if (hours <= 0) continue;

    // Parse date
    let dateStr: string | null = null;
    if (completedAt) {
      const d = new Date(completedAt.trim());
      if (!isNaN(d.getTime())) {
        dateStr = d.toISOString().split('T')[0];
      }
    }

    // Extract main project name (before ' - ')
    const projectName = project ? project.split(' - ')[0].trim() : 'Sem projeto';

    newEntries.push({
      task_name: taskName.trim(),
      assignee: assignee.trim() || 'Sem responsável',
      project: projectName,
      completed_date: dateStr,
      hours_logged: Math.round(hours * 100) / 100,
      client: client.trim() || null,
      activity_type: activityType.trim() || null,
      month: month + 1, // DB uses 1-indexed
      year,
      uploaded_by: userId || null,
    });
  }

  if (newEntries.length === 0) {
    return { success: false, count: 0 };
  }

  // Delete existing entries for this month/year
  const { error: delError } = await supabase
    .from('time_entries')
    .delete()
    .eq('month', month + 1)
    .eq('year', year);

  if (delError) {
    console.error('Error deleting old time entries:', delError);
  }

  // Insert in batches of 500
  for (let i = 0; i < newEntries.length; i += 500) {
    const batch = newEntries.slice(i, i + 500);
    const { error } = await supabase.from('time_entries').insert(batch);
    if (error) {
      console.error('Error inserting time entries:', error);
      return { success: false, count: 0 };
    }
  }

  return { success: true, count: newEntries.length };
}
