import React, { useState } from "react";
import { ChevronDown, ChevronRight, Building2, User, FileText, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClientSummary } from "@/hooks/use-hours-data";
import { cn } from "@/lib/utils";

interface HoursClientTableProps {
  data: ClientSummary[];
  totalHours: number;
}

export function HoursClientTable({ data, totalHours }: HoursClientTableProps) {
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set());

  const toggleClient = (client: string) => {
    const next = new Set(expandedClients);
    if (next.has(client)) next.delete(client); else next.add(client);
    setExpandedClients(next);
  };

  const toggleMember = (key: string) => {
    const next = new Set(expandedMembers);
    if (next.has(key)) next.delete(key); else next.add(key);
    setExpandedMembers(next);
  };

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Building2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p>Nenhum dado de clientes encontrado.</p>
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
              <TableHead className="text-muted-foreground font-semibold">Cliente</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-right">Horas</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-center">Advogados</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-center">% do Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(client => {
              const isClientExpanded = expandedClients.has(client.client);
              const pct = totalHours > 0 ? (client.totalHours / totalHours) * 100 : 0;
              return (
                <React.Fragment key={client.client}>
                  {/* Client row */}
                  <TableRow
                    className="border-border cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleClient(client.client)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isClientExpanded}
                    aria-label={`${isClientExpanded ? "Recolher" : "Expandir"} advogados de ${client.client}`}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleClient(client.client); } }}
                  >
                    <TableCell className="p-2">
                      {isClientExpanded
                        ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-primary/70" />
                        <span>{client.client}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-primary">
                      {client.totalHours.toFixed(1)}h
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">
                      {client.members.length} adv.
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground font-medium">{pct.toFixed(0)}%</span>
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Member rows */}
                  {isClientExpanded && client.members.map(member => {
                    const memberKey = `${client.client}::${member.name}`;
                    const isMemberExpanded = expandedMembers.has(memberKey);
                    const memberPct = client.totalHours > 0 ? (member.totalHours / client.totalHours) * 100 : 0;
                    return (
                      <React.Fragment key={memberKey}>
                        <TableRow
                          className="bg-muted/20 border-border cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => toggleMember(memberKey)}
                          role="button"
                          tabIndex={0}
                          aria-expanded={isMemberExpanded}
                          aria-label={`${isMemberExpanded ? "Recolher" : "Expandir"} lançamentos de ${member.name} em ${client.client}`}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleMember(memberKey); } }}
                        >
                          <TableCell className="p-2 pl-4">
                            {isMemberExpanded
                              ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                              : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 pl-4">
                              <User className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="font-medium text-foreground">{member.name}</span>
                              <span className="text-[10px] text-muted-foreground">
                                ({member.entries.length} lançamento{member.entries.length !== 1 ? "s" : ""})
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground font-medium">
                            {member.totalHours.toFixed(1)}h
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="text-xs text-muted-foreground">{memberPct.toFixed(0)}% do cliente</span>
                          </TableCell>
                          <TableCell></TableCell>
                        </TableRow>

                        {/* Entry rows */}
                        {isMemberExpanded && member.entries.map((entry, idx) => (
                          <TableRow
                            key={`${memberKey}-entry-${idx}`}
                            className="bg-muted/10 border-border/50"
                          >
                            <TableCell></TableCell>
                            <TableCell>
                              <div className="flex items-start gap-2 pl-10">
                                <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground/60" />
                                <span className="text-sm text-foreground/80">{entry.taskName}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground text-sm">
                              {entry.hours.toFixed(2)}h
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex flex-col items-center gap-0.5">
                                {entry.date ? (
                                  <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    <Calendar className="w-3 h-3" />
                                    <span>{format(parseISO(entry.date), "dd/MM/yyyy", { locale: ptBR })}</span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                                {entry.activityType && (
                                  <span className={cn(
                                    "text-[10px] px-1.5 py-0.5 rounded-full",
                                    "bg-primary/10 text-primary"
                                  )}>
                                    {entry.activityType}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-border">
        <span className="text-sm text-muted-foreground">{data.length} cliente{data.length !== 1 ? "s" : ""}</span>
        <div className="text-right">
          <span className="text-sm text-muted-foreground">Total: </span>
          <span className="text-lg font-bold text-primary">{totalHours.toFixed(1)}h</span>
        </div>
      </div>
    </div>
  );
}
