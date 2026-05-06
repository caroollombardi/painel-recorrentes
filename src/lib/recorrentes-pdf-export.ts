import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DashboardData } from "@/lib/data-parser";
import wsaLogo from "@/assets/wsa-logo.png";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const PRIMARY_COLOR: [number, number, number] = [251, 116, 53];
const DARK_COLOR: [number, number, number] = [30, 30, 30];
const MUTED_COLOR: [number, number, number] = [120, 120, 120];
const DANGER_COLOR: [number, number, number] = [200, 40, 40];
const WARNING_COLOR: [number, number, number] = [217, 119, 6];
const SUCCESS_COLOR: [number, number, number] = [34, 139, 34];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function creditStatusLabel(pct: number | null): string {
  if (pct === null) return "Ad-hoc";
  if (pct >= 100) return "Overflow";
  if (pct >= 80) return "Risco";
  if (pct >= 60) return "Atenção";
  return "Saudável";
}

function creditStatusColor(pct: number | null): [number, number, number] {
  if (pct === null) return MUTED_COLOR;
  if (pct >= 100) return DANGER_COLOR;
  if (pct >= 80) return WARNING_COLOR;
  if (pct >= 60) return [180, 140, 0];
  return SUCCESS_COLOR;
}

export async function exportRecorrentesPDF(
  data: DashboardData,
  selectedMonth: number,
  selectedYear: number,
  showValues: boolean
) {
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 15;

  // === HEADER ===
  doc.setFillColor(...PRIMARY_COLOR);
  doc.rect(0, 0, pageWidth, 3, "F");

  y = 12;
  try {
    const logoImg = await loadImage(wsaLogo);
    const logoHeight = 12;
    const logoWidth = logoHeight * (logoImg.width / logoImg.height);
    doc.addImage(logoImg, "PNG", margin, y, logoWidth, logoHeight);
    y += logoHeight + 4;
  } catch {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...DARK_COLOR);
    doc.text("Wolff e Scripes Advogados", margin, y + 8);
    y += 14;
  }

  doc.setFontSize(13);
  doc.setTextColor(...PRIMARY_COLOR);
  doc.text("Relatório de Clientes Recorrentes", margin, y);

  y += 7;
  doc.setFontSize(10);
  doc.setTextColor(...MUTED_COLOR);
  doc.text(`${MONTH_NAMES[selectedMonth]} ${selectedYear}`, margin, y);

  const now = new Date();
  const dateStr = `Gerado em ${now.toLocaleDateString("pt-BR")} às ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  doc.text(dateStr, pageWidth - margin, y, { align: "right" });

  y += 5;
  doc.setDrawColor(...PRIMARY_COLOR);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);

  // === KPIs ===
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...DARK_COLOR);
  doc.text("Indicadores do Mês", margin, y);

  const totalClients = data.clients.length;
  const avgHourlyRate = data.avgHourlyRate;
  const overflow = data.clientsAtOverflow;
  const risk = data.clientsAtRisk;
  const warning = data.clientsAtWarning;

  const kpis = [
    {
      label: "Faturamento Recorrente",
      value: showValues ? formatCurrency(data.totalValor) : "—",
      sub: `${totalClients} clientes ativos`,
    },
    {
      label: "Horas Consumidas",
      value: `${data.totalHoras.toFixed(1)}h`,
      sub: showValues ? `Média: ${formatCurrency(avgHourlyRate)}/h` : "—",
    },
    {
      label: "Clientes em Overflow",
      value: `${overflow}`,
      sub: overflow > 0 ? "Acima de 100% do crédito" : "Nenhum",
    },
    {
      label: "Clientes em Risco",
      value: `${risk}`,
      sub: risk > 0 ? "Entre 80% e 99%" : "Nenhum",
    },
    {
      label: "Clientes em Atenção",
      value: `${warning}`,
      sub: warning > 0 ? "Entre 60% e 79%" : "Nenhum",
    },
    {
      label: "Top Cliente",
      value: data.topClient || "—",
      sub: showValues ? formatCurrency(data.topClientValor) : `${data.topClientHours.toFixed(1)}h`,
    },
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

  // === SUMMARY ===
  y += 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...DARK_COLOR);
  doc.text("Resumo Executivo", margin, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  const summaryLines: Array<{ text: string; color?: [number, number, number] }> = [];
  summaryLines.push({
    text: `O escritório possui ${totalClients} cliente${totalClients !== 1 ? "s" : ""} com contrato recorrente ativo em ${MONTH_NAMES[selectedMonth]} de ${selectedYear}.`,
  });
  if (showValues) {
    summaryLines.push({
      text: `Faturamento recorrente total: ${formatCurrency(data.totalValor)}, com ${data.totalHoras.toFixed(1)}h consumidas.`,
    });
  } else {
    summaryLines.push({ text: `Total de ${data.totalHoras.toFixed(1)}h consumidas no período.` });
  }
  if (overflow > 0) {
    summaryLines.push({
      text: `⚠ ${overflow} cliente${overflow !== 1 ? "s" : ""} ultrapassou 100% do crédito contratado.`,
      color: DANGER_COLOR,
    });
  }
  if (risk > 0) {
    summaryLines.push({
      text: `⚠ ${risk} cliente${risk !== 1 ? "s" : ""} entre 80% e 99% do crédito — monitorar.`,
      color: WARNING_COLOR,
    });
  }

  const summaryStartY = y - 2;
  summaryLines.forEach(({ text, color }) => {
    const wrapped = doc.splitTextToSize(text, pageWidth - margin * 2 - 8);
    doc.setTextColor(...(color ?? DARK_COLOR));
    wrapped.forEach((line: string) => {
      doc.text(line, margin + 6, y);
      y += 4.5;
    });
  });
  doc.setFillColor(...PRIMARY_COLOR);
  doc.rect(margin, summaryStartY, 2, y - summaryStartY, "F");

  // === CLIENT TABLE ===
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...DARK_COLOR);
  doc.text("Detalhamento por Cliente", margin, y);
  y += 2;

  const clientRows = data.clients.map((c) => {
    const pct = c.creditUsage?.percentualUsado ?? null;
    const pctStr = pct !== null ? `${pct.toFixed(0)}%` : "—";
    const status = creditStatusLabel(pct);
    const lawyers = c.lawyers.map((l) => l.name).join(", ");
    return [
      c.project,
      `${c.horasMensal.toFixed(1)}h`,
      showValues ? formatCurrency(c.valorMensal) : "—",
      pctStr,
      status,
      lawyers || "—",
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [["Cliente", "Horas", "Valor", "Crédito", "Status", "Advogados"]],
    body: clientRows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 7.5, cellPadding: 2.5, textColor: DARK_COLOR },
    headStyles: {
      fillColor: PRIMARY_COLOR,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
    },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 18, halign: "center" },
      2: { cellWidth: 28, halign: "right" },
      3: { cellWidth: 18, halign: "center" },
      4: { cellWidth: 20, halign: "center" },
      5: { cellWidth: "auto" },
    },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    didParseCell: (hookData) => {
      if (hookData.section === "body" && hookData.column.index === 4) {
        const client = data.clients[hookData.row.index];
        const pct = client?.creditUsage?.percentualUsado ?? null;
        hookData.cell.styles.textColor = creditStatusColor(pct);
        hookData.cell.styles.fontStyle = "bold";
      }
    },
  });

  // === FOOTER ===
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFillColor(...PRIMARY_COLOR);
    doc.rect(0, pageH - 3, pageWidth, 3, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED_COLOR);
    doc.text("Wolff e Scripes Advogados • Relatório Confidencial", margin, pageH - 6);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin, pageH - 6, { align: "right" });
  }

  doc.save(`recorrentes_${MONTH_NAMES[selectedMonth]}_${selectedYear}.pdf`);
}
