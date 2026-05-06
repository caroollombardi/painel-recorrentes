import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AsanaTask {
  gid: string;
  name: string;
  due_on: string | null;
  completed: boolean;
  completed_at: string | null;
  assignee: { name: string } | null;
  projectName: string;
}

export interface AsanaClientData {
  projects: { gid: string; name: string }[];
  tasks: {
    overdue: AsanaTask[];
    dueSoon: AsanaTask[];
    recentlyCompleted: AsanaTask[];
    upcoming: AsanaTask[];
  };
}

const cache = new Map<string, { data: AsanaClientData; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export function useAsanaClient(clientName: string | null) {
  const [data, setData] = useState<AsanaClientData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientName) {
      setData(null);
      setError(null);
      return;
    }

    const cached = cache.get(clientName);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setData(cached.data);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setData(null);

    let cancelled = false;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const res = await fetch("/api/asana-proxy", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ client: clientName }),
        });

        const result = await res.json();
        if (cancelled) return;

        if (!res.ok || result?.error) {
          setError(result?.error || "Erro ao buscar dados do Asana");
          return;
        }

        cache.set(clientName, { data: result as AsanaClientData, timestamp: Date.now() });
        setData(result as AsanaClientData);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao buscar dados do Asana");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [clientName]);

  return { data, isLoading, error };
}
