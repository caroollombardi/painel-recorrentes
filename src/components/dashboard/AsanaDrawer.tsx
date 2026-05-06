import { X, AlertCircle, CheckCircle2, Calendar, Loader2 } from "lucide-react";
import { useAsanaClient, AsanaTask } from "@/hooks/use-asana-client";
import { cn } from "@/lib/utils";

interface AsanaDrawerProps {
  clientName: string;
  onClose: () => void;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr.length === 10 ? dateStr + "T00:00:00" : dateStr);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function TaskCard({
  task,
  showProject,
  variant,
}: {
  task: AsanaTask;
  showProject: boolean;
  variant: "overdue" | "dueSoon" | "completed" | "upcoming";
}) {
  const dateStr = task.completed ? task.completed_at : task.due_on;
  const dateLabel = formatDate(dateStr ?? null);

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-1.5",
        variant === "overdue" && "border-destructive/30 bg-destructive/5",
        variant === "dueSoon" && "border-warning/30 bg-warning/5",
        variant === "completed" && "border-success/20 bg-success/5",
        variant === "upcoming" && "border-border bg-card/60"
      )}
    >
      <p className="text-sm font-medium text-foreground leading-snug">{task.name}</p>
      <div className="flex items-center gap-2.5 flex-wrap text-xs">
        {showProject && (
          <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium truncate max-w-[160px]">
            {task.projectName.split(" - ").slice(1).join(" - ") || task.projectName}
          </span>
        )}
        {dateLabel && (
          <span
            className={cn(
              "flex items-center gap-1",
              variant === "overdue" && "text-destructive font-semibold",
              variant === "dueSoon" && "text-warning-foreground",
              variant === "completed" && "text-success-foreground",
              variant === "upcoming" && "text-muted-foreground"
            )}
          >
            {variant === "completed" ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <Calendar className="w-3 h-3" />
            )}
            {dateLabel}
          </span>
        )}
        {task.assignee && (
          <span className="text-muted-foreground truncate max-w-[120px]">
            {task.assignee.name}
          </span>
        )}
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  count,
  colorClass,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  colorClass: string;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="space-y-2">
      <div className={cn("flex items-center gap-2 pb-1 border-b border-border", colorClass)}>
        {icon}
        <span className="text-sm font-semibold">{title}</span>
        <span className="ml-auto text-xs font-medium opacity-60 tabular-nums">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function AsanaDrawer({ clientName, onClose }: AsanaDrawerProps) {
  const { data, isLoading, error } = useAsanaClient(clientName);

  const allUrgent = data ? [...data.tasks.overdue, ...data.tasks.dueSoon] : [];
  const showProject = (data?.projects.length ?? 0) > 1;
  const todayStr = today();

  const hasAnyTask =
    allUrgent.length > 0 ||
    (data?.tasks.recentlyCompleted.length ?? 0) > 0 ||
    (data?.tasks.upcoming.length ?? 0) > 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] bg-background border-l border-border shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-border bg-card/50">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">
              Asana
            </p>
            <h2
              className="text-lg font-display font-bold text-foreground"
              translate="no"
            >
              {clientName}
            </h2>
            {data?.projects && data.projects.length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {data.projects.length} projeto
                {data.projects.length !== 1 ? "s" : ""} ativo
                {data.projects.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted mt-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-sm">Buscando tarefas no Asana...</p>
            </div>
          )}

          {error && !isLoading && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">Erro ao buscar dados</p>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
              </div>
            </div>
          )}

          {data && !isLoading && (
            <>
              {data.projects.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground space-y-2">
                  <p className="text-sm font-medium">Nenhum projeto encontrado</p>
                  <p className="text-xs">
                    Verifique se o nome do cliente no painel corresponde ao prefixo dos projetos no Asana (ex.: "CLIENTE - Descrição").
                  </p>
                </div>
              ) : !hasAnyTask ? (
                <div className="text-center py-16 text-muted-foreground">
                  <p className="text-sm font-medium">Nenhuma tarefa encontrada</p>
                  <p className="text-xs mt-1">
                    Sem tarefas em atraso, recentes ou futuras com prazo definido.
                  </p>
                </div>
              ) : (
                <>
                  {/* Section 1: Overdue + Due soon */}
                  <Section
                    icon={<AlertCircle className="w-4 h-4" />}
                    title="Em atraso ou vencendo em 7 dias"
                    count={allUrgent.length}
                    colorClass="text-destructive"
                  >
                    {allUrgent.map((task) => (
                      <TaskCard
                        key={task.gid}
                        task={task}
                        showProject={showProject}
                        variant={task.due_on && task.due_on < todayStr ? "overdue" : "dueSoon"}
                      />
                    ))}
                  </Section>

                  {/* Section 2: Recently completed */}
                  <Section
                    icon={<CheckCircle2 className="w-4 h-4" />}
                    title="Concluídas recentemente"
                    count={data.tasks.recentlyCompleted.length}
                    colorClass="text-success-foreground"
                  >
                    {data.tasks.recentlyCompleted.map((task) => (
                      <TaskCard
                        key={task.gid}
                        task={task}
                        showProject={showProject}
                        variant="completed"
                      />
                    ))}
                  </Section>

                  {/* Section 3: Upcoming */}
                  <Section
                    icon={<Calendar className="w-4 h-4" />}
                    title="Próximas entregas"
                    count={data.tasks.upcoming.length}
                    colorClass="text-primary"
                  >
                    {data.tasks.upcoming.map((task) => (
                      <TaskCard
                        key={task.gid}
                        task={task}
                        showProject={showProject}
                        variant="upcoming"
                      />
                    ))}
                  </Section>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
