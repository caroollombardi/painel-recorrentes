import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Meta2026 {
  id: string;
  socio: string;
  meta_clientes: number;
  ticket_medio_meta: number;
  observacoes: string | null;
  updated_at: string;
  updated_by: string | null;
  created_at: string;
}

export interface NovoCliente2026 {
  id: string;
  socio_responsavel: string;
  cliente: string;
  data_entrada: string;
  valor_anual_estimado: number;
  created_at: string;
  updated_at: string;
}

export interface MetaComputada extends Meta2026 {
  receita_meta: number;
  clientes_atuais: number;
  receita_atual: number;
}

export function useMetasData() {
  const [metas, setMetas] = useState<Meta2026[]>([]);
  const [novosClientes, setNovosClientes] = useState<NovoCliente2026[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      const [metasRes, clientesRes] = await Promise.all([
        supabase.from('metas_2026').select('*').order('socio'),
        supabase.from('novos_clientes_2026').select('*').order('data_entrada', { ascending: false }),
      ]);

      if (metasRes.error) throw metasRes.error;
      if (clientesRes.error) throw clientesRes.error;

      setMetas(metasRes.data || []);
      setNovosClientes(clientesRes.data || []);
    } catch (error) {
      console.error('Error fetching metas data:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os dados de metas.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const metasComputadas: MetaComputada[] = metas.map(meta => {
    const clientesSocio = novosClientes.filter(
      c => c.socio_responsavel === meta.socio
    );
    return {
      ...meta,
      receita_meta: meta.meta_clientes * Number(meta.ticket_medio_meta),
      clientes_atuais: clientesSocio.length,
      receita_atual: clientesSocio.reduce(
        (sum, c) => sum + Number(c.valor_anual_estimado),
        0
      ),
    };
  });

  const totais = {
    meta_clientes: metasComputadas.reduce((s, m) => s + m.meta_clientes, 0),
    clientes_atuais: metasComputadas.reduce((s, m) => s + m.clientes_atuais, 0),
    receita_meta: metasComputadas.reduce((s, m) => s + m.receita_meta, 0),
    receita_atual: metasComputadas.reduce((s, m) => s + m.receita_atual, 0),
    ticket_medio_meta:
      metasComputadas.length > 0
        ? metasComputadas.reduce((s, m) => s + Number(m.ticket_medio_meta), 0) /
          metasComputadas.length
        : 0,
  };

  const saveMeta = async (meta: Partial<Meta2026> & { socio: string }, userName: string) => {
    try {
      const payload = {
        socio: meta.socio,
        meta_clientes: meta.meta_clientes || 0,
        ticket_medio_meta: meta.ticket_medio_meta || 0,
        observacoes: meta.observacoes || null,
        updated_by: userName,
      };

      const existing = metas.find(m => m.socio === meta.socio);

      if (existing) {
        const { error } = await supabase
          .from('metas_2026')
          .update(payload)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('metas_2026')
          .insert(payload);
        if (error) throw error;
      }

      await fetchData();
      toast({ title: 'Sucesso', description: 'Meta salva com sucesso.' });
      return true;
    } catch (error) {
      console.error('Error saving meta:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar a meta.',
        variant: 'destructive',
      });
      return false;
    }
  };

  const addCliente = async (cliente: Omit<NovoCliente2026, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { error } = await supabase
        .from('novos_clientes_2026')
        .insert(cliente);
      if (error) throw error;
      await fetchData();
      toast({ title: 'Sucesso', description: 'Cliente adicionado.' });
      return true;
    } catch (error) {
      console.error('Error adding cliente:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível adicionar o cliente.',
        variant: 'destructive',
      });
      return false;
    }
  };

  const deleteCliente = async (id: string) => {
    try {
      const { error } = await supabase
        .from('novos_clientes_2026')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await fetchData();
      toast({ title: 'Sucesso', description: 'Cliente removido.' });
      return true;
    } catch (error) {
      console.error('Error deleting cliente:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível remover o cliente.',
        variant: 'destructive',
      });
      return false;
    }
  };

  return {
    metas: metasComputadas,
    novosClientes,
    totais,
    isLoading,
    saveMeta,
    addCliente,
    deleteCliente,
    refetch: fetchData,
  };
}
