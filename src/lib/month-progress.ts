// Funções para cálculo do progresso mensal e análise preditiva

export interface MonthProgress {
  currentDay: number;
  totalDays: number;
  percentElapsed: number; // percentual do mês decorrido
  daysRemaining: number;
}

export interface ConsumptionAnalysis {
  percentConsumed: number;
  percentElapsed: number;
  consumptionRate: number; // ritmo = percentual_consumido ÷ percentual_mes
  isAheadOfSchedule: boolean; // consumindo mais rápido que o esperado
  projectedEndOfMonth: number; // projeção de consumo ao final do mês
  riskLevel: 'ok' | 'attention' | 'risk' | 'critical'; // Nível 1, 2, 3
}

/**
 * Calcula o progresso do mês atual
 * Atualiza automaticamente todos os dias
 * Respeita meses com 28, 29, 30 ou 31 dias
 */
export function getMonthProgress(date: Date = new Date()): MonthProgress {
  const year = date.getFullYear();
  const month = date.getMonth();
  const currentDay = date.getDate();
  
  // Último dia do mês = dia 0 do próximo mês
  const totalDays = new Date(year, month + 1, 0).getDate();
  
  // Percentual decorrido do mês
  const percentElapsed = (currentDay / totalDays) * 100;
  
  return {
    currentDay,
    totalDays,
    percentElapsed: Math.round(percentElapsed * 10) / 10,
    daysRemaining: totalDays - currentDay,
  };
}

/**
 * Analisa o consumo de crédito em relação ao tempo do mês
 * Retorna análise preditiva de risco
 */
export function analyzeConsumption(
  percentConsumed: number,
  monthProgress: MonthProgress = getMonthProgress()
): ConsumptionAnalysis {
  const { percentElapsed } = monthProgress;
  
  // Ritmo de consumo = percentual consumido / percentual do mês decorrido
  // Exemplo: se consumiu 50% do crédito em 25% do mês, ritmo = 2.0 (dobrando o esperado)
  const consumptionRate = percentElapsed > 0 
    ? percentConsumed / percentElapsed 
    : 0;
  
  // Está consumindo mais rápido que o tempo?
  const isAheadOfSchedule = consumptionRate > 1;
  
  // Projeção de consumo ao final do mês (extrapolação linear)
  // Se está em 25% do mês com 50% consumido, projeta 200% ao fim do mês
  const projectedEndOfMonth = percentElapsed > 0
    ? (percentConsumed / percentElapsed) * 100
    : 0;
  
  // Determinar nível de risco baseado nos thresholds
  let riskLevel: 'ok' | 'attention' | 'risk' | 'critical' = 'ok';
  
  if (percentConsumed >= 100) {
    riskLevel = 'critical'; // Nível 3 - Estouro do pacote
  } else if (percentConsumed >= 80) {
    riskLevel = 'risk'; // Nível 2 - Risco de estouro
  } else if (percentConsumed >= 60) {
    riskLevel = 'attention'; // Nível 1 - Atenção interna
  }
  
  return {
    percentConsumed: Math.round(percentConsumed * 10) / 10,
    percentElapsed: monthProgress.percentElapsed,
    consumptionRate: Math.round(consumptionRate * 100) / 100,
    isAheadOfSchedule,
    projectedEndOfMonth: Math.round(projectedEndOfMonth * 10) / 10,
    riskLevel,
  };
}

/**
 * Gera frase executiva para o Top Cliente
 */
export function generateTopClientPhrase(
  clientName: string,
  percentConsumed: number,
  hoursUsed: number,
  valorConsumido: number,
  monthProgress: MonthProgress = getMonthProgress()
): string {
  const { percentElapsed, currentDay, totalDays } = monthProgress;
  const analysis = analyzeConsumption(percentConsumed, monthProgress);
  
  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  
  // Frase base
  let phrase = `${clientName}: ${percentConsumed.toFixed(0)}% do crédito consumido em ${currentDay}/${totalDays} dias (${percentElapsed.toFixed(0)}% do mês)`;
  
  // Adicionar contexto de ritmo
  if (analysis.isAheadOfSchedule) {
    phrase += `. Ritmo ${analysis.consumptionRate.toFixed(1)}x acima do esperado.`;
    
    if (analysis.projectedEndOfMonth > 100) {
      phrase += ` Projeção: ${analysis.projectedEndOfMonth.toFixed(0)}% ao fim do mês.`;
    }
  } else {
    phrase += `. Ritmo dentro do esperado.`;
  }
  
  return phrase;
}

/**
 * Determina a cor/estilo baseado no nível de risco
 */
export function getRiskStyles(riskLevel: 'ok' | 'attention' | 'risk' | 'critical') {
  switch (riskLevel) {
    case 'critical':
      return {
        bgColor: 'bg-destructive',
        textColor: 'text-destructive',
        borderColor: 'border-destructive',
        badgeClass: 'bg-destructive/10 text-destructive border-destructive/20',
        label: 'Estouro',
        emoji: '🚨',
      };
    case 'risk':
      return {
        bgColor: 'bg-orange-500',
        textColor: 'text-orange-600',
        borderColor: 'border-orange-500',
        badgeClass: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
        label: 'Risco',
        emoji: '⚠️',
      };
    case 'attention':
      return {
        bgColor: 'bg-amber-500',
        textColor: 'text-amber-600',
        borderColor: 'border-amber-500',
        badgeClass: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
        label: 'Atenção',
        emoji: '🔔',
      };
    default:
      return {
        bgColor: 'bg-emerald-500',
        textColor: 'text-emerald-600',
        borderColor: 'border-emerald-500',
        badgeClass: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
        label: 'OK',
        emoji: '✅',
      };
  }
}
