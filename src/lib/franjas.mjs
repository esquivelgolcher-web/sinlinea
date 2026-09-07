// Cálculo de la siguiente franja horaria libre. Módulo isomorfo.
import { claveDia, isoDesdeClave, sumarDias } from "./fechas.mjs";

export function franjasOcupadas(posts) {
  return posts.filter((p) => p.estado === "programado" && p.programado).map((p) => p.programado);
}

export function choca(iso, ocupadas) {
  const t = Date.parse(iso);
  return ocupadas.some((o) => Date.parse(o) === t);
}

export function siguienteFranjaLibre({ franjas, ocupadas = [], ahora, zonaHoraria, margenMin = 15, maxDias = 14 }) {
  const minimo = ahora.getTime() + margenMin * 60000;
  const ocupadasMs = new Set(ocupadas.map((o) => Date.parse(o)));
  const horas = [...franjas].sort();
  let dia = claveDia(ahora, zonaHoraria);
  for (let d = 0; d <= maxDias; d++) {
    for (const h of horas) {
      const iso = isoDesdeClave(dia, h);
      const t = Date.parse(iso);
      if (t >= minimo && !ocupadasMs.has(t)) return iso;
    }
    dia = sumarDias(dia, 1);
  }
  throw new Error(`No hay franjas libres en los próximos ${maxDias} días`);
}
