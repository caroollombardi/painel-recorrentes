// Tabela de preços por advogado (valores em R$ por hora)
export interface LawyerPrice {
  name: string;
  role: string;
  hourlyRate: number;
  area: string;
}

export const lawyerPrices: LawyerPrice[] = [
  { name: "Aline Morozinski", role: "Adv. Júnior", hourlyRate: 450, area: "Contencioso" },
  { name: "Camilla Ferronato", role: "Adv. Júnior 2", hourlyRate: 490, area: "Contratos" },
  { name: "Carolina Lombardi", role: "Gestora de projetos", hourlyRate: 0, area: "Gestão de Projetos" },
  { name: "Felipe Hauagge", role: "Adv. Pleno 3", hourlyRate: 730, area: "Societário" },
  { name: "Gabriel Russi Vianna", role: "Adv. Sênior 3", hourlyRate: 920, area: "Societário" },
  { name: "Laura Haj Mussi Pereira Oliveira", role: "Estagiária", hourlyRate: 120, area: "Contratos" },
  { name: "Lorenzo Bachiega Scripes", role: "Sócio Fundador", hourlyRate: 1080, area: "Contratos" },
  { name: "Luiza de Macedo Gebran", role: "Adv. Pleno 3", hourlyRate: 730, area: "Societário" },
  { name: "Manuela Crudi Sant'Anna", role: "Adv. Júnior 3", hourlyRate: 530, area: "Societário" },
  { name: "Marianna Moura Machado", role: "Trainee", hourlyRate: 250, area: "Societário" },
  { name: "Natalí Perera Batista", role: "Adv. Pleno 2", hourlyRate: 680, area: "Contencioso" },
  { name: "Pedro Wolff", role: "Sócio Fundador", hourlyRate: 1080, area: "Societário" },
  { name: "Sabrina Yohana Bona", role: "Adv. Pleno 2", hourlyRate: 680, area: "Contratos" },
];

// Create a map for quick lookup by name
export const lawyerPriceMap = new Map<string, number>(
  lawyerPrices.map(lawyer => [lawyer.name.toLowerCase(), lawyer.hourlyRate])
);

export function getLawyerHourlyRate(name: string): number {
  if (!name) return 0;
  
  // Try exact match first
  const exactMatch = lawyerPriceMap.get(name.toLowerCase());
  if (exactMatch !== undefined) return exactMatch;
  
  // Try partial match (first name or contains)
  for (const lawyer of lawyerPrices) {
    if (lawyer.name.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(lawyer.name.split(' ')[0].toLowerCase())) {
      return lawyer.hourlyRate;
    }
  }
  
  return 0; // Unknown lawyer
}
