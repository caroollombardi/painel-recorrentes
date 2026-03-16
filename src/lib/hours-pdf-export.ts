import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { HoursDashboardData } from "@/hooks/use-hours-data";
import { DAILY_TARGET_HOURS, getMemberDailyTarget, isExcludedMember } from "@/lib/hours-constants";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const PRIMARY_COLOR: [number, number, number] = [251, 116, 53]; // #FB7435
const DARK_COLOR: [number, number, number] = [30, 30, 30];
const MUTED_COLOR: [number, number, number] = [120, 120, 120];
const SUCCESS_COLOR: [number, number, number] = [34, 139, 34];
const DANGER_COLOR: [number, number, number] = [200, 40, 40];

interface ExportParams {
  data: HoursDashboardData;
  selectedMonth: number;
  selectedYear: number;
  previousMonthHours: number | null;
  monthlyTarget: number;
  hoursExpectedSoFar: number;
  activeMemberCount: number;
  businessDaysRemaining: number;
}

export function exportHoursPDF(params: ExportParams) {
  const {
    data,
    selectedMonth,
    selectedYear,
    previousMonthHours,
    monthlyTarget,
    hoursExpectedSoFar,
    activeMemberCount,
    businessDaysRemaining,
  } = params;

  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 15;

  // === HEADER ===
  // Orange accent bar
  doc.setFillColor(...PRIMARY_COLOR);
  doc.rect(0, 0, pageWidth, 3, "F");

  // Title
  y = 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...DARK_COLOR);
  doc.text("Wolff e Scripes Advogados", margin, y);

  y += 8;
  doc.setFontSize(13);
  doc.setTextColor(...PRIMARY_COLOR);
  doc.text("Relatório de Lançamento de Horas", margin, y);

  // Period
  y += 7;
  doc.setFontSize(10);
  doc.setTextColor(...MUTED_COLOR);
  doc.text(`${MONTH_NAMES[selectedMonth]} ${selectedYear}`, margin, y);

  // Generation date
  const now = new Date();
  const dateStr = `Gerado em ${now.toLocaleDateString("pt-BR")} às ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  doc.text(dateStr, pageWidth - margin, y, { align: "right" });

  // Separator
  y += 5;
  doc.setDrawColor(...PRIMARY_COLOR);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);

  // === KPIs ===
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...DARK_COLOR);
  doc.text("Indicadores Principais", margin, y);

  const progressPercent = monthlyTarget > 0 ? (data.totalHours / monthlyTarget) * 100 : 0;
  const avgPerMember = activeMemberCount > 0 && data.businessDaysElapsed > 0
    ? data.totalHours / data.businessDaysElapsed / activeMemberCount
    : 0;
  const hoursRemaining = Math.max(0, monthlyTarget - data.totalHours);

  const kpis = [
    { label: "Total de Horas Lançadas", value: `${data.totalHours.toFixed(1)}h`, sub: `Meta: ${monthlyTarget.toFixed(0)}h | ${progressPercent.toFixed(0)}% atingido` },
    { label: "Média por Membro/Dia", value: `${avgPerMember.toFixed(1)}h`, sub: `Meta individual: ${DAILY_TARGET_HOURS}h/dia` },
    { label: "Top Colaborador", value: data.topContributor, sub: `${data.topContributorHours.toFixed(1)}h lançadas` },
    { label: "Projetos Ativos", value: `${data.activeProjects}`, sub: "Com horas no período" },
    { label: "Taxa de Preenchimento", value: `${data.fillRate.toFixed(0)}%`, sub: "Dias úteis com lançamento" },
    { label: "Horas Restantes", value: `${hoursRemaining.toFixed(1)}h`, sub: `${businessDaysRemaining} dias úteis restantes` },
  ];

  y += 4;
  const kpiColWidth = (pageWidth - margin * 2) / 3;
  kpis.forEach((kpi, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = margin + col * kpiColWidth;
    const ky = y + row * 20;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED_COLOR);
    doc.text(kpi.label, x + 2, ky);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...DARK_COLOR);
    doc.text(kpi.value, x + 2, ky + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED_COLOR);
    doc.text(kpi.sub, x + 2, ky + 11);
  });

  y += Math.ceil(kpis.length / 3) * 20 + 5;

  // === EXECUTIVE SUMMARY ===
  y += 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...DARK_COLOR);
  doc.text("Resumo Executivo", margin, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...DARK_COLOR);

  const summaryLines: string[] = [];
  summaryLines.push(
    `O time acumula ${data.totalHours.toFixed(1)}h em ${data.activeProjects} projetos, com ${data.memberSummaries.length} membros ativos.`
  );

  if (data.topContributor) {
    summaryLines.push(`Top colaborador: ${data.topContributor} (${data.topContributorHours.toFixed(1)}h).`);
  }

  summaryLines.push(`Média diária: ${data.avgHoursPerDay.toFixed(1)}h. Taxa de preenchimento: ${data.fillRate.toFixed(0)}%.`);

  if (previousMonthHours && previousMonthHours > 0) {
    const variation = ((data.totalHours - previousMonthHours) / previousMonthHours) * 100;
    summaryLines.push(`Variação vs. mês anterior: ${variation >= 0 ? "+" : ""}${variation.toFixed(1)}%.`);
  }

  // Risk check
  if (monthlyTarget > 0) {
    const currentPace = data.businessDaysElapsed > 0 ? data.totalHours / data.businessDaysElapsed : 0;
    const projectedTotal = currentPace * data.businessDaysInMonth;
    const projectedPercent = (projectedTotal / monthlyTarget) * 100;
    if (projectedPercent < 90) {
      doc.setTextColor(...DANGER_COLOR);
      summaryLines.push(`⚠ No ritmo atual, o time atingirá apenas ${projectedPercent.toFixed(0)}% da meta.`);
    }
  }

  // Orange left border for summary
  const summaryStartY = y - 2;
  summaryLines.forEach((line) => {
    const wrappedLines = doc.splitTextToSize(line, pageWidth - margin * 2 - 8);
    doc.setTextColor(...DARK_COLOR);
    if (line.startsWith("⚠")) doc.setTextColor(...DANGER_COLOR);
    wrappedLines.forEach((wl: string) => {
      doc.text(wl, margin + 6, y);
      y += 4.5;
    });
  });

  doc.setFillColor(...PRIMARY_COLOR);
  doc.rect(margin, summaryStartY, 2, y - summaryStartY, "F");

  // === MEMBER TABLE ===
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...DARK_COLOR);
  doc.text("Horas por Membro do Time", margin, y);
  y += 2;

  const memberRows = data.memberSummaries.map((m) => {
    const target = data.businessDaysElapsed * getMemberDailyTarget(m.name);
    const diff = m.totalHours - target;
    const excluded = isExcludedMember(m.name);
    const status = excluded ? "—" : diff >= 0 ? "✓ Atingido" : `${diff.toFixed(1)}h`;
    return [
      m.name,
      `${m.totalHours.toFixed(1)}h`,
      `${m.percentOfTotal.toFixed(1)}%`,
      excluded ? "—" : `${target.toFixed(0)}h`,
      status,
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [["Membro", "Horas", "% do Total", "Meta Período", "Status"]],
    body: memberRows,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8,
      cellPadding: 3,
      textColor: DARK_COLOR,
    },
    headStyles: {
      fillColor: PRIMARY_COLOR,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [248, 248, 248],
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 4) {
        const val = data.cell.raw as string;
        if (val.startsWith("✓")) {
          data.cell.styles.textColor = SUCCESS_COLOR;
          data.cell.styles.fontStyle = "bold";
        } else if (val !== "—") {
          data.cell.styles.textColor = DANGER_COLOR;
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // === ACTIVITY DISTRIBUTION ===
  if (data.activityDistribution.length > 0) {
    // Check if we need a new page
    if (y > 240) {
      doc.addPage();
      y = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...DARK_COLOR);
    doc.text("Distribuição por Tipo de Atividade", margin, y);
    y += 2;

    const actRows = data.activityDistribution.map((a) => [
      a.type,
      `${a.hours.toFixed(1)}h`,
      `${a.percent.toFixed(1)}%`,
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Tipo de Atividade", "Horas", "% do Total"]],
      body: actRows,
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 8,
        cellPadding: 3,
        textColor: DARK_COLOR,
      },
      headStyles: {
        fillColor: PRIMARY_COLOR,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
      },
      alternateRowStyles: {
        fillColor: [248, 248, 248],
      },
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // === MEMBERS BELOW TARGET ===
  const membersBelow = data.memberSummaries
    .filter((m) => !isExcludedMember(m.name))
    .filter((m) => {
      const target = data.businessDaysElapsed * getMemberDailyTarget(m.name);
      return m.totalHours < target;
    })
    .map((m) => {
      const target = data.businessDaysElapsed * getMemberDailyTarget(m.name);
      const totalTarget = data.businessDaysInMonth * getMemberDailyTarget(m.name);
      const needed = businessDaysRemaining > 0 ? (totalTarget - m.totalHours) / businessDaysRemaining : 0;
      return {
        name: m.name,
        diff: (m.totalHours - target).toFixed(1),
        needed: needed.toFixed(1),
      };
    });

  if (membersBelow.length > 0) {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...DANGER_COLOR);
    doc.text("Membros Abaixo da Meta", margin, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [["Membro", "Diferença", "Necessário/dia"]],
      body: membersBelow.map((m) => [m.name, `${m.diff}h`, `${m.needed}h/dia`]),
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 8,
        cellPadding: 3,
        textColor: DARK_COLOR,
      },
      headStyles: {
        fillColor: DANGER_COLOR,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
      },
      alternateRowStyles: {
        fillColor: [255, 245, 245],
      },
    });
  }

  // === FOOTER on every page ===
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();

    // Bottom bar
    doc.setFillColor(...PRIMARY_COLOR);
    doc.rect(0, pageH - 3, pageWidth, 3, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED_COLOR);
    doc.text("Wolff e Scripes Advogados • Relatório Confidencial", margin, pageH - 6);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin, pageH - 6, { align: "right" });
  }

  // Save
  doc.save(`relatorio_horas_${MONTH_NAMES[selectedMonth]}_${selectedYear}.pdf`);
}
