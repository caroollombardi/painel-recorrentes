import React, { useState } from "react";
import { ChevronDown, ChevronRight, User, FolderOpen, TrendingUp, TrendingDown, CircleAlert, CircleCheck, Circle, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { MemberSummary } from "@/hooks/use-hours-data";
import { cn } from "@/lib/utils";
import { DAILY_TARGET_HOURS, getMemberDailyTarget, getMemberPeriodTarget, isExcludedMember } from "@/lib/hours-constants";

interface HoursDetailTableProps {
  data: MemberSummary[];
  totalHours: number;
  individualTarget?: number;
  businessDaysElapsed?: number;
  businessDaysRemaining?: number;
  dailyTargetHours?: number;
  month?: number;
  year?: number;
}

export function HoursDetailTable({ data, totalHours, individualTarget, businessDaysElapsed = 0, businessDaysRemaining = 0, dailyTargetHours = DAILY_TARGET_HOURS, month = new Date().getMonth(), year = new Date().getFullYear() }: HoursDetailTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (name: string) => {
    const next = new Set(expanded);
    if (next.has(name)) next.delete(name); else next.add(name);
    setExpanded(next);
  };

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <User className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p>Nenhum dado de horas encontrado.</p>
      </div>
    );
  }

  // Per-member individual target (supports custom daily targets and adjustments)
  const getMemberTarget = (memberName: string) => {
    if (!businessDaysElapsed || businessDaysElapsed <= 0) return individualTarget;
    return getMemberPeriodTarget(memberName, businessDaysElapsed, month, year);
  };

  // Pace indicator for a member
  const getPaceIcon = (memberHours: number, memberName: string) => {
    if (isExcludedMember(memberName)) return <Circle className="w-4 h-4 text-muted-foreground/50" />;
    const target = getMemberTarget(memberName);
    if (!target || target <= 0) return null;
    const ratio = memberHours / target;
     if (ratio >= 1) return <CircleCheck className="w-4 h-4 text-success" />;
    if (ratio >= 0.7) return <Circle className="w-4 h-4 text-warning" />;
    return <CircleAlert className="w-4 h-4 text-destructive" />;
  };

  const getPaceLabel = (memberHours: number, memberName: string) => {
    if (isExcludedMember(memberName)) return "Sem meta";
    const target = getMemberTarget(memberName);
    if (!target || target <= 0) return "";
    const ratio = memberHours / target;
    if (ratio >= 1) return "No ritmo";
    if (ratio >= 0.7) return "Atenção";
    return "Atrasado";
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="w-8"></TableHead>
                <TableHead className="text-muted-foreground font-semibold">Membro do Time</TableHead>
                <TableHead className="text-muted-foreground font-semibold text-right">Horas Lançadas</TableHead>
                {individualTarget !== undefined && (
                  <TableHead className="text-muted-foreground font-semibold text-right">vs. Meta</TableHead>
                )}
                <TableHead className="text-muted-foreground font-semibold text-center">Ritmo</TableHead>
                <TableHead className="text-muted-foreground font-semibold text-center">% do Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map(member => {
                const isExpanded = expanded.has(member.name);
                const excluded = isExcludedMember(member.name);
                const memberTarget = excluded ? undefined : getMemberTarget(member.name);
                const memberDailyTargetVal = excluded ? 0 : getMemberDailyTarget(member.name);
                const diff = !excluded && memberTarget !== undefined && memberTarget > 0 ? member.totalHours - memberTarget : null;
                const diffPercent = !excluded && memberTarget && memberTarget > 0 ? ((member.totalHours - memberTarget) / memberTarget) * 100 : null;
                return (
                  <React.Fragment key={member.name}>
                    <TableRow
                      className="border-border transition-all cursor-pointer hover:bg-muted/50"
                      onClick={() => toggle(member.name)}
                    >
                      <TableCell className="p-2">
                        {member.projects.length > 0 && (
                          isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span>{member.name}</span>
                          <span className="text-xs text-muted-foreground">({member.projects.length} projeto{member.projects.length !== 1 ? "s" : ""})</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-primary">
                        {member.totalHours.toFixed(1)}h
                      </TableCell>
                      {diff !== null && diffPercent !== null && (
                        <TableCell className="text-right">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className={cn(
                                "inline-flex items-center gap-1 font-semibold text-sm px-2 py-0.5 rounded-full cursor-help",
                                diff >= 0 ? "text-success-foreground bg-success/10" : "text-destructive bg-destructive/10"
                              )}>
                                {diff >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                <span>{diff >= 0 ? "+" : ""}{diff.toFixed(1)}h ({diffPercent >= 0 ? "+" : ""}{diffPercent.toFixed(0)}%)</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs max-w-xs">
                              Meta individual: {memberTarget?.toFixed(0)}h ({businessDaysElapsed} dias × {memberDailyTargetVal}h). Lançado: {member.totalHours.toFixed(1)}h.
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                      )}
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {getPaceIcon(member.totalHours, member.name)}
                          <span className="text-xs text-muted-foreground">{getPaceLabel(member.totalHours, member.name)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Progress value={Math.min(member.percentOfTotal, 100)} className="w-16 h-1.5" />
                          <span className="text-xs text-muted-foreground font-medium">{member.percentOfTotal.toFixed(0)}%</span>
                        </div>
                      </TableCell>
                    </TableRow>

                    {isExpanded && member.projects.map(proj => {
                      const pct = totalHours > 0 ? (proj.hours / totalHours) * 100 : 0;
                      return (
                        <TableRow key={`${member.name}-${proj.project}`} className="bg-muted/20 border-border">
                          <TableCell></TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 pl-6 text-muted-foreground">
                              <FolderOpen className="w-4 h-4" />
                              <span className="font-medium text-foreground">{proj.project}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{proj.hours.toFixed(1)}h</TableCell>
                          {individualTarget !== undefined && <TableCell></TableCell>}
                          <TableCell className="text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              {proj.dates && proj.dates.length > 0 ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="inline-flex items-center gap-1 text-xs text-foreground font-medium cursor-help">
                                      <Calendar className="w-3 h-3 text-primary" />
                                      <span>
                                        {proj.dates.length === 1
                                          ? format(parseISO(proj.dates[0]), "dd/MM/yyyy", { locale: ptBR })
                                          : `${format(parseISO(proj.dates[0]), "dd/MM", { locale: ptBR })} — ${format(parseISO(proj.dates[proj.dates.length - 1]), "dd/MM", { locale: ptBR })}`}
                                      </span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs max-w-xs">
                                    Datas: {proj.dates.map(d => format(parseISO(d), "dd/MM/yyyy (EEE)", { locale: ptBR })).join(", ")}
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                              {proj.activityType && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{proj.activityType}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <span className="text-sm text-muted-foreground">{data.length} membros do time</span>
          <div className="text-right">
            <span className="text-sm text-muted-foreground">Total: </span>
            <span className="text-lg font-bold text-primary">{totalHours.toFixed(1)}h</span>
            {individualTarget !== undefined && (
              <span className="text-sm text-muted-foreground ml-2">/ Meta: {(individualTarget * data.length).toFixed(0)}h</span>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
