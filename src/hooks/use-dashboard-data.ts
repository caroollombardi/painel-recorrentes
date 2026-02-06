import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardData, parseCSVData } from "@/lib/data-parser";
import asanaData from "@/data/asana-data.csv?raw";

export function useDashboardData() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load data from database on mount
  useEffect(() => {
    async function loadData() {
      try {
        const { data, error } = await supabase
          .from("dashboard_data")
          .select("data")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data?.data) {
          setDashboardData(data.data as unknown as DashboardData);
        } else {
          // Fallback to bundled CSV
          try {
            const parsed = parseCSVData(asanaData);
            setDashboardData(parsed);
          } catch (e) {
            console.error("Error parsing fallback CSV:", e);
          }
        }
      } catch (err) {
        console.error("Error loading dashboard data:", err);
        // Fallback to bundled CSV on error
        try {
          const parsed = parseCSVData(asanaData);
          setDashboardData(parsed);
        } catch (e) {
          console.error("Error parsing fallback CSV:", e);
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  // Save data to database and update state
  const updateData = useCallback(async (data: DashboardData, fileName?: string) => {
    setDashboardData(data);

    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      // Check if a record already exists
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
    } catch (err) {
      console.error("Error saving dashboard data:", err);
    }
  }, []);

  return { dashboardData, isLoading, updateData };
}
