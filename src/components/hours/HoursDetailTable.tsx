import React, { useState } from "react";
import { ChevronDown, ChevronRight, User, FolderOpen } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { MemberSummary } from "@/hooks/use-hours-data";
import { cn } from "@/lib/utils";

interface HoursDetailTableProps {
  data: MemberSummary[];
  totalHours: number;
}

export function HoursDetailTable({ data, totalHours }: HoursDetailTableProps) {
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

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="w-8"></TableHead>
              <TableHead className="text-muted-foreground font-semibold">Membro do Time</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-center">Projeto/Cliente</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-right">Horas Lançadas</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-center">% do Total</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-center">Tipo de Atividade</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(member => {
              const isExpanded = expanded.has(member.name);
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
                    <TableCell className="text-center text-muted-foreground">—</TableCell>
                    <TableCell className="text-right font-semibold text-primary">
                      {member.totalHours.toFixed(1)}h
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Progress value={Math.min(member.percentOfTotal, 100)} className="w-16 h-1.5" />
                        <span className="text-xs text-muted-foreground font-medium">{member.percentOfTotal.toFixed(0)}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">—</TableCell>
                  </TableRow>

                  {isExpanded && member.projects.map(proj => {
                    const pct = totalHours > 0 ? (proj.hours / totalHours) * 100 : 0;
                    return (
                      <TableRow key={`${member.name}-${proj.project}`} className="bg-muted/20 border-border">
                        <TableCell></TableCell>
                        <TableCell></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <FolderOpen className="w-4 h-4" />
                            <span className="font-medium text-foreground">{proj.project}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{proj.hours.toFixed(1)}h</TableCell>
                        <TableCell className="text-center">
                          <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                        </TableCell>
                        <TableCell className="text-center">
                          {proj.activityType ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{proj.activityType}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
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
        </div>
      </div>
    </div>
  );
}
