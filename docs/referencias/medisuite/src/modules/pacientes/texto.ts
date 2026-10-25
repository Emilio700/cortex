// Quita los encabezados vacíos de plantilla ("Exploración física: ") para las vistas previas
export function sinEncabezados(t: string) {
  return t
    .split('\n')
    .filter((l) => l.trim() && !/^[^:]{1,120}:\s*$/.test(l))
    .join(' · ')
}
