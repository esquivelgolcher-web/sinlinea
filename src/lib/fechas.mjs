// Fechas en zona horaria. Módulo isomorfo: solo usa Intl, sin imports de Node.
export const ZONA_PANAMA = "America/Panama";
export const OFFSET_PANAMA = "-05:00"; // Panamá no usa horario de verano.

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function aFecha(v) {
  if (v instanceof Date) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error(`Fecha inválida: ${v}`);
  return d;
}

const pad2 = (n) => String(n).padStart(2, "0");

export function partesZona(date, zona = ZONA_PANAMA) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(aFecha(date)).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour === "24" ? "0" : p.hour), minute: Number(p.minute),
  };
}

export function claveDia(date, zona = ZONA_PANAMA) {
  const p = partesZona(date, zona);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

export function claveMinuto(date, zona = ZONA_PANAMA) {
  const p = partesZona(date, zona);
  return `${claveDia(date, zona)}-${pad2(p.hour)}${pad2(p.minute)}`;
}

export function fechaCorta(date, zona = ZONA_PANAMA) {
  const p = partesZona(date, zona);
  return `${p.day} ${MESES_CORTOS[p.month - 1]} ${p.year}`;
}

export function isoDesdeClave(clave, hhmm, offset = OFFSET_PANAMA) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clave)) throw new Error(`Clave de día inválida: ${clave}`);
  if (!/^\d{2}:\d{2}$/.test(hhmm)) throw new Error(`Hora inválida: ${hhmm}`);
  return `${clave}T${hhmm}:00${offset}`;
}

export function sumarDias(clave, n) {
  const [y, m, d] = clave.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + n * 86400000;
  const r = new Date(t);
  return `${r.getUTCFullYear()}-${pad2(r.getUTCMonth() + 1)}-${pad2(r.getUTCDate())}`;
}

export function horaMinutoDeIso(iso, zona = ZONA_PANAMA) {
  const p = partesZona(iso, zona);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}
