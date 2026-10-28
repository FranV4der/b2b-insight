export function formatCLP(value: number | string | null | undefined): string {
  const num = Math.round(Number(value ?? 0));
  return num.toLocaleString('es-CL');
}

export function formatCLPWithSymbol(value: number | string | null | undefined): string {
  return `$${formatCLP(value)}`;
}
