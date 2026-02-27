import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Target,
  Users,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Plus,
  Edit3,
  Trash2,
  Calendar,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useMetasData, Meta2026 } from "@/hooks/use-metas-data";
import wsaLogo from "@/assets/wsa-logo.png";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function getYearProgress(): { elapsed: number; monthsRemaining: number } {
  const now = new Date();
  const startOfYear = new Date(2026, 0, 1);
  const endOfYear = new Date(2026, 11, 31);
  const totalDays =
    (endOfYear.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24);
  const daysPassed = Math.max(
    0,
    (now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)
  );
  const elapsed = Math.min(100, (daysPassed / totalDays) * 100);
  const monthsRemaining = Math.max(0, 12 - now.getMonth() - (now.getFullYear() >= 2026 ? 0 : -12));
  return { elapsed, monthsRemaining: now.getFullYear() < 2026 ? 12 : monthsRemaining };
}

function getAlertStatus(
  progressReal: number,
  progressExpected: number
): { level: "ok" | "attention" | "risk"; color: string; message: string } | null {
  if (progressExpected <= 0) return null;

  if (progressReal < progressExpected - 25) {
    return {
      level: "risk",
      color: "text-red-600",
      message:
        "Meta de 2026 em risco. Necessário acelerar aquisição imediatamente.",
    };
  }
  if (progressReal < progressExpected - 10) {
    return {
      level: "attention",
      color: "text-amber-600",
      message:
        "Ritmo atual abaixo do necessário para atingir a meta de 2026.",
    };
  }
  return null;
}

export default function Metas2026() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const isGestao = hasRole("gestao");

  const {
    metas,
    novosClientes,
    totais,
    isLoading,
    saveMeta,
    addCliente,
    deleteCliente,
  } = useMetasData();

  const [accessConfirmed, setAccessConfirmed] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const METAS_PIN = '2026'; // PIN padrão configurável
  const [selectedSocio, setSelectedSocio] = useState<string>("all");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddClienteModal, setShowAddClienteModal] = useState(false);
  const [editingMeta, setEditingMeta] = useState<Partial<Meta2026> & { socio: string }>({
    socio: "",
    meta_clientes: 0,
    ticket_medio_meta: 0,
    observacoes: "",
  });
  const [newCliente, setNewCliente] = useState({
    socio_responsavel: "",
    cliente: "",
    data_entrada: new Date().toISOString().split("T")[0],
    valor_anual_estimado: 0,
  });

  const yearProgress = getYearProgress();

  const filteredMetas = useMemo(
    () =>
      selectedSocio === "all"
        ? metas
        : metas.filter((m) => m.socio === selectedSocio),
    [metas, selectedSocio]
  );

  const filteredClientes = useMemo(
    () =>
      selectedSocio === "all"
        ? novosClientes
        : novosClientes.filter((c) => c.socio_responsavel === selectedSocio),
    [novosClientes, selectedSocio]
  );

  const displayTotais = useMemo(() => {
    if (selectedSocio === "all") return totais;
    const filtered = metas.filter((m) => m.socio === selectedSocio);
    return {
      meta_clientes: filtered.reduce((s, m) => s + m.meta_clientes, 0),
      clientes_atuais: filtered.reduce((s, m) => s + m.clientes_atuais, 0),
      receita_meta: filtered.reduce((s, m) => s + m.receita_meta, 0),
      receita_atual: filtered.reduce((s, m) => s + m.receita_atual, 0),
      ticket_medio_meta:
        filtered.length > 0
          ? filtered.reduce((s, m) => s + Number(m.ticket_medio_meta), 0) /
            filtered.length
          : 0,
    };
  }, [metas, selectedSocio, totais]);

  const pctClientes =
    displayTotais.meta_clientes > 0
      ? (displayTotais.clientes_atuais / displayTotais.meta_clientes) * 100
      : 0;
  const pctReceita =
    displayTotais.receita_meta > 0
      ? (displayTotais.receita_atual / displayTotais.receita_meta) * 100
      : 0;

  const clientesFaltam = Math.max(
    0,
    displayTotais.meta_clientes - displayTotais.clientes_atuais
  );
  const receitaFalta = Math.max(
    0,
    displayTotais.receita_meta - displayTotais.receita_atual
  );

  const ritmoNecessario =
    yearProgress.monthsRemaining > 0
      ? Math.ceil(clientesFaltam / yearProgress.monthsRemaining)
      : clientesFaltam;

  const alertClientes = getAlertStatus(pctClientes, yearProgress.elapsed);
  const alertReceita = getAlertStatus(pctReceita, yearProgress.elapsed);
  const worstAlert =
    alertClientes?.level === "risk" || alertReceita?.level === "risk"
      ? "risk"
      : alertClientes?.level === "attention" || alertReceita?.level === "attention"
      ? "attention"
      : null;

  const socios = [...new Set(metas.map((m) => m.socio))];

  const handleOpenEdit = (meta?: typeof metas[0]) => {
    if (meta) {
      setEditingMeta({
        socio: meta.socio,
        meta_clientes: meta.meta_clientes,
        ticket_medio_meta: Number(meta.ticket_medio_meta),
        observacoes: meta.observacoes || "",
      });
    } else {
      setEditingMeta({
        socio: "",
        meta_clientes: 0,
        ticket_medio_meta: 0,
        observacoes: "",
      });
    }
    setShowEditModal(true);
  };

  const handleSaveMeta = async () => {
    if (!editingMeta.socio) return;
    const success = await saveMeta(
      editingMeta as Partial<Meta2026> & { socio: string },
      user?.user_metadata?.name || user?.email || "Sistema"
    );
    if (success) setShowEditModal(false);
  };

  const handleAddCliente = async () => {
    if (!newCliente.cliente || !newCliente.socio_responsavel) return;
    const success = await addCliente(newCliente);
    if (success) {
      setShowAddClienteModal(false);
      setNewCliente({
        socio_responsavel: "",
        cliente: "",
        data_entrada: new Date().toISOString().split("T")[0],
        valor_anual_estimado: 0,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Access confirmation modal
  if (!accessConfirmed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardHeader className="text-center">
            <div className="mx-auto p-3 rounded-full bg-primary/10 w-fit mb-2">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-xl font-display">
              Área estratégica restrita
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Indicadores de metas e faturamento. Uso exclusivo de sócios e gestão.
            </p>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="pin-input" className="text-sm text-muted-foreground">
                  Digite o PIN de acesso
                </Label>
                <Input
                  id="pin-input"
                  type="password"
                  maxLength={4}
                  placeholder="••••"
                  value={pinInput}
                  onChange={(e) => {
                    setPinInput(e.target.value.replace(/\D/g, ''));
                    setPinError(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (pinInput === METAS_PIN) {
                        setAccessConfirmed(true);
                      } else {
                        setPinError(true);
                      }
                    }
                  }}
                  className={cn("text-center text-lg tracking-[0.5em] max-w-[160px] mx-auto", pinError && "border-destructive")}
                />
                {pinError && (
                  <p className="text-xs text-destructive">PIN incorreto. Tente novamente.</p>
                )}
              </div>
              <div className="flex gap-3 justify-center">
                <Button variant="outline" onClick={() => navigate("/settings")}>
                  Cancelar
                </Button>
                <Button 
                  onClick={() => {
                    if (pinInput === METAS_PIN) {
                      setAccessConfirmed(true);
                    } else {
                      setPinError(true);
                    }
                  }}
                  disabled={pinInput.length < 4}
                >
                  Entrar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/settings")}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <img src={wsaLogo} alt="WSA" className="h-8 object-contain" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-display font-bold">
                    Metas 2026 —{" "}
                    <span className="text-primary">Receita Recorrente</span>
                  </h1>
                  <Shield className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Acompanhamento de aquisição de clientes e faturamento
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Filtro por sócio */}
              <Select value={selectedSocio} onValueChange={setSelectedSocio}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todos os sócios" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os sócios</SelectItem>
                  {socios.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {isGestao && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenEdit()}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Nova Meta
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setNewCliente({
                        ...newCliente,
                        socio_responsavel: socios[0] || "",
                      });
                      setShowAddClienteModal(true);
                    }}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Novo Cliente
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-8">
        {/* Alert Banners */}
        {worstAlert === "risk" && (
          <div className="rounded-lg border-2 border-red-500/30 bg-red-500/5 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-red-600">
                Meta de 2026 em risco
              </p>
              <p className="text-sm text-red-600/80">
                Necessário acelerar aquisição imediatamente. Para recuperar o
                ritmo, é necessário fechar{" "}
                <strong>{ritmoNecessario} clientes por mês</strong>.
              </p>
            </div>
          </div>
        )}
        {worstAlert === "attention" && (
          <div className="rounded-lg border-2 border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-amber-600">
                Ritmo abaixo do necessário
              </p>
              <p className="text-sm text-amber-600/80">
                Para atingir a meta, é necessário fechar{" "}
                <strong>{ritmoNecessario} clientes por mês</strong>.
              </p>
            </div>
          </div>
        )}

        {/* KPI Cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1 — Meta de Clientes */}
          <Card className="relative overflow-hidden">
            {alertClientes && (
              <div
                className={`absolute top-2 right-2 ${alertClientes.color}`}
              >
                <AlertTriangle className="w-4 h-4" />
              </div>
            )}
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Meta de Clientes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-display">
                {displayTotais.clientes_atuais}{" "}
                <span className="text-muted-foreground text-base font-normal">
                  / {displayTotais.meta_clientes}
                </span>
              </div>
              <Progress
                value={Math.min(pctClientes, 100)}
                className="mt-3 h-3"
              />
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>{pctClientes.toFixed(1)}% atingido</span>
                <span>Faltam {clientesFaltam} clientes</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 2 — Meta de Receita */}
          <Card className="relative overflow-hidden">
            {alertReceita && (
              <div
                className={`absolute top-2 right-2 ${alertReceita.color}`}
              >
                <AlertTriangle className="w-4 h-4" />
              </div>
            )}
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-primary" />
                Meta de Receita
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-display">
                {formatCurrency(displayTotais.receita_atual)}
              </div>
              <div className="text-sm text-muted-foreground">
                de {formatCurrency(displayTotais.receita_meta)}
              </div>
              <Progress
                value={Math.min(pctReceita, 100)}
                className="mt-3 h-3"
              />
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>{pctReceita.toFixed(1)}% atingido</span>
                <span>Faltam {formatCurrency(receitaFalta)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 3 — Ticket Médio */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Ticket Médio Meta
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-display">
                {formatCurrency(displayTotais.ticket_medio_meta)}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Valor anual médio esperado por cliente
              </p>
              {displayTotais.clientes_atuais > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">Ticket real</p>
                  <p className="text-sm font-semibold">
                    {formatCurrency(
                      displayTotais.receita_atual /
                        displayTotais.clientes_atuais
                    )}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card 4 — Ritmo Necessário */}
          <Card
            className={
              worstAlert === "risk"
                ? "border-red-500/30"
                : worstAlert === "attention"
                ? "border-amber-500/30"
                : ""
            }
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                Ritmo Necessário
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-display">
                {ritmoNecessario}{" "}
                <span className="text-base font-normal text-muted-foreground">
                  clientes/mês
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {yearProgress.monthsRemaining} meses restantes em 2026
              </p>
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Progresso do ano
                </p>
                <Progress
                  value={yearProgress.elapsed}
                  className="mt-1 h-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {yearProgress.elapsed.toFixed(1)}% do ano decorrido
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Metas por Sócio */}
        {filteredMetas.length > 0 && (
          <section className="bg-card rounded-lg border border-border p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Target className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-display font-semibold">
                    Metas por Sócio
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Progresso individual de cada sócio responsável
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredMetas.map((meta) => {
                const pctC =
                  meta.meta_clientes > 0
                    ? (meta.clientes_atuais / meta.meta_clientes) * 100
                    : 0;
                const pctR =
                  meta.receita_meta > 0
                    ? (meta.receita_atual / meta.receita_meta) * 100
                    : 0;
                const alert = getAlertStatus(pctC, yearProgress.elapsed);

                return (
                  <Card key={meta.id} className="relative">
                    {alert && (
                      <div
                        className={`absolute top-3 right-3 ${alert.color}`}
                      >
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                    )}
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-semibold">
                          {meta.socio}
                        </CardTitle>
                        {isGestao && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleOpenEdit(meta)}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">
                            Clientes
                          </span>
                          <span className="font-medium">
                            {meta.clientes_atuais}/{meta.meta_clientes}
                          </span>
                        </div>
                        <Progress
                          value={Math.min(pctC, 100)}
                          className="h-2"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">
                            Receita
                          </span>
                          <span className="font-medium">
                            {formatCurrency(meta.receita_atual)}/
                            {formatCurrency(meta.receita_meta)}
                          </span>
                        </div>
                        <Progress
                          value={Math.min(pctR, 100)}
                          className="h-2"
                        />
                      </div>
                      {meta.observacoes && (
                        <p className="text-xs text-muted-foreground italic border-t border-border pt-2 mt-2">
                          {meta.observacoes}
                        </p>
                      )}
                      {meta.updated_by && (
                        <p className="text-xs text-muted-foreground/60">
                          Atualizado por {meta.updated_by} em{" "}
                          {new Date(meta.updated_at).toLocaleDateString("pt-BR")}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* Tabela Novos Clientes */}
        <section className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-display font-semibold">
                  Clientes Adicionados em 2026
                </h2>
                <p className="text-sm text-muted-foreground">
                  {filteredClientes.length} cliente(s) registrado(s)
                </p>
              </div>
            </div>
          </div>

          {filteredClientes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum cliente adicionado ainda.</p>
              {isGestao && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    setNewCliente({
                      ...newCliente,
                      socio_responsavel: socios[0] || "",
                    });
                    setShowAddClienteModal(true);
                  }}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar Primeiro Cliente
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Sócio Responsável</TableHead>
                    <TableHead>Data Entrada</TableHead>
                    <TableHead className="text-right">
                      Valor Anual Estimado
                    </TableHead>
                    {isGestao && (
                      <TableHead className="w-10"></TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClientes.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {c.cliente}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{c.socio_responsavel}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(c.data_entrada).toLocaleDateString("pt-BR")}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(Number(c.valor_anual_estimado))}
                      </TableCell>
                      {isGestao && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => deleteCliente(c.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </main>

      {/* Edit Meta Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {metas.find((m) => m.socio === editingMeta.socio)
                ? "Editar Meta"
                : "Nova Meta"}
            </DialogTitle>
            <DialogDescription>
              Defina a meta de aquisição de clientes e faturamento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Sócio Responsável</Label>
              <Input
                value={editingMeta.socio}
                onChange={(e) =>
                  setEditingMeta({ ...editingMeta, socio: e.target.value })
                }
                placeholder="Nome do sócio"
                disabled={!!metas.find((m) => m.socio === editingMeta.socio)}
              />
            </div>
            <div className="space-y-2">
              <Label>Meta de Novos Clientes</Label>
              <Input
                type="number"
                min={0}
                value={editingMeta.meta_clientes || ""}
                onChange={(e) =>
                  setEditingMeta({
                    ...editingMeta,
                    meta_clientes: parseInt(e.target.value) || 0,
                  })
                }
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Ticket Médio Esperado (R$)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={editingMeta.ticket_medio_meta || ""}
                onChange={(e) =>
                  setEditingMeta({
                    ...editingMeta,
                    ticket_medio_meta: parseFloat(e.target.value) || 0,
                  })
                }
                placeholder="0,00"
              />
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Receita Meta</p>
              <p className="text-lg font-bold text-primary">
                {formatCurrency(
                  (editingMeta.meta_clientes || 0) *
                    (editingMeta.ticket_medio_meta || 0)
                )}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Observações Estratégicas</Label>
              <Textarea
                value={editingMeta.observacoes || ""}
                onChange={(e) =>
                  setEditingMeta({
                    ...editingMeta,
                    observacoes: e.target.value,
                  })
                }
                placeholder="Notas sobre a meta..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveMeta} disabled={!editingMeta.socio}>
              Salvar Meta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Cliente Modal */}
      <Dialog
        open={showAddClienteModal}
        onOpenChange={setShowAddClienteModal}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Cliente 2026</DialogTitle>
            <DialogDescription>
              Registre um novo cliente adquirido.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Sócio Responsável</Label>
              <Select
                value={newCliente.socio_responsavel}
                onValueChange={(v) =>
                  setNewCliente({ ...newCliente, socio_responsavel: v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar sócio" />
                </SelectTrigger>
                <SelectContent>
                  {socios.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nome do Cliente</Label>
              <Input
                value={newCliente.cliente}
                onChange={(e) =>
                  setNewCliente({ ...newCliente, cliente: e.target.value })
                }
                placeholder="Nome do cliente"
              />
            </div>
            <div className="space-y-2">
              <Label>Data de Entrada</Label>
              <Input
                type="date"
                value={newCliente.data_entrada}
                onChange={(e) =>
                  setNewCliente({
                    ...newCliente,
                    data_entrada: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Valor Anual Estimado (R$)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={newCliente.valor_anual_estimado || ""}
                onChange={(e) =>
                  setNewCliente({
                    ...newCliente,
                    valor_anual_estimado: parseFloat(e.target.value) || 0,
                  })
                }
                placeholder="0,00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddClienteModal(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAddCliente}
              disabled={
                !newCliente.cliente || !newCliente.socio_responsavel
              }
            >
              Adicionar Cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 py-6">
        <div className="container text-center text-sm text-muted-foreground">
          Wolff e Scripes Advogados • Metas 2026 — Área Estratégica Restrita
        </div>
      </footer>
    </div>
  );
}
