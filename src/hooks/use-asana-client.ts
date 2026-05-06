import { useState, useEffect } from "react";

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

    fetch("/api/asana-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client: clientName }),
    })
      .then(async (res) => {
        const result = await res.json();
        if (!res.ok) {
          setError(result?.error || "Erro ao buscar dados do Asana");
          return;
        }
        if (result?.error) {
          setError(result.error);
          return;
        }
        cache.set(clientName, { data: result as AsanaClientData, timestamp: Date.now() });
        setData(result as AsanaClientData);
      })
      .catch((err) => setError(err.message || "Erro ao buscar dados do Asana"))
      .finally(() => setIsLoading(false));
  }, [clientName]);

  return { data, isLoading, error };
}
