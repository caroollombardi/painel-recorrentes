const STORAGE_KEY = "wsa_contract_values";

// Tabela de valores de contrato por cliente
export interface ContractValue {
  cliente: string;
  valorMensalPago: number;
  valorMensalCredito: number;
}

export function getContractValues(): ContractValue[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as ContractValue[];
  } catch {}
  return [...defaultContractValues];
}

export function saveContractValues(values: ContractValue[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  // Rebuild the lookup map
  contractValueMap.clear();
  values.forEach(c => contractValueMap.set(c.cliente.toLowerCase().trim(), c));
}

const defaultContractValues: ContractValue[] = [
  { cliente: "AIM CONVERSION", valorMensalPago: 4952.71, valorMensalCredito: 9905.42 },
  { cliente: "SUPLOS", valorMensalPago: 2000.00, valorMensalCredito: 4000.00 },
  { cliente: "APPLAUSE", valorMensalPago: 3000.00, valorMensalCredito: 6000.00 },
  { cliente: "ARCA TECH", valorMensalPago: 3450.00, valorMensalCredito: 6900.00 },
  { cliente: "PINÓ", valorMensalPago: 3000.00, valorMensalCredito: 6000.00 },
  { cliente: "BTAX", valorMensalPago: 4500.00, valorMensalCredito: 9000.00 },
  { cliente: "COMPOSTA", valorMensalPago: 4350.00, valorMensalCredito: 8700.00 },
  { cliente: "FIGUEIRA CAPITAL", valorMensalPago: 6350.00, valorMensalCredito: 12700.00 },
  { cliente: "LAYER UP", valorMensalPago: 4950.00, valorMensalCredito: 9900.00 },
  { cliente: "MADALOZZO CORRETORA", valorMensalPago: 4000.00, valorMensalCredito: 8000.00 },
  { cliente: "MAKASÍ", valorMensalPago: 10432.00, valorMensalCredito: 20864.00 },
  { cliente: "ME2", valorMensalPago: 2750.00, valorMensalCredito: 5500.00 },
  { cliente: "MEETROX", valorMensalPago: 4180.72, valorMensalCredito: 8361.44 },
  { cliente: "RNF", valorMensalPago: 4200.00, valorMensalCredito: 8400.00 },
  { cliente: "SMART CITIZEN", valorMensalPago: 4950.00, valorMensalCredito: 9900.00 },
  { cliente: "SOLVIS", valorMensalPago: 4206.89, valorMensalCredito: 8413.78 },
  { cliente: "SOMOS VALOR", valorMensalPago: 3445.20, valorMensalCredito: 6890.40 },
  { cliente: "TASK TI", valorMensalPago: 3000.00, valorMensalCredito: 6000.00 },
  { cliente: "KPEX G100", valorMensalPago: 1100.00, valorMensalCredito: 2200.00 },
  { cliente: "KPEX G200", valorMensalPago: 1100.00, valorMensalCredito: 2200.00 },
  { cliente: "KPEX G300", valorMensalPago: 1100.00, valorMensalCredito: 2200.00 },
  { cliente: "KPEX São Carlos", valorMensalPago: 1100.00, valorMensalCredito: 2200.00 },
  { cliente: "KPEX Ribeirão Preto", valorMensalPago: 1100.00, valorMensalCredito: 2200.00 },
  { cliente: "KPEX Louveira", valorMensalPago: 1100.00, valorMensalCredito: 2200.00 },
  { cliente: "DATA SOUL", valorMensalPago: 4900.00, valorMensalCredito: 9800.00 },
];

export const contractValues = defaultContractValues;

// Mutable map — rebuilt when saveContractValues() is called
export const contractValueMap = new Map<string, ContractValue>(
  getContractValues().map(contract => [contract.cliente.toLowerCase().trim(), contract])
);

export function getClientContract(clientName: string): ContractValue | null {
  if (!clientName) return null;
  
  const normalized = clientName.toLowerCase().trim();
  const normalizedNoSpaces = normalized.replace(/\s+/g, '');
  
  // Try exact match first
  const exactMatch = contractValueMap.get(normalized);
  if (exactMatch) return exactMatch;
  
  // Try partial match (client name contains or is contained, also compare without spaces)
  for (const contract of contractValues) {
    const contractNormalized = contract.cliente.toLowerCase().trim();
    const contractNoSpaces = contractNormalized.replace(/\s+/g, '');
    if (contractNormalized.includes(normalized) || normalized.includes(contractNormalized) ||
        contractNoSpaces === normalizedNoSpaces) {
      return contract;
    }
  }
  
  return null;
}

export function calculateCreditUsage(valorConsumido: number, valorMensalCredito: number): {
  percentual: number;
  isWarning: boolean;
  isCritical: boolean;
} {
  if (valorMensalCredito <= 0) {
    return { percentual: 0, isWarning: false, isCritical: false };
  }
  
  const percentual = (valorConsumido / valorMensalCredito) * 100;
  
  // Traffic light system: <60% OK, 60-80% Atenção, >80% Alerta
  return {
    percentual: Math.round(percentual * 10) / 10,
    isWarning: percentual >= 60 && percentual < 80,
    isCritical: percentual >= 80,
  };
}
