// Ayudas para las corridas multi-cuenta: código de salida y anotaciones para GitHub Actions.
// Política: una corrida solo falla (rojo) cuando fallan TODAS las cuentas; un fallo parcial se
// anota con ::error:: para que se vea en el resumen de la corrida sin impedir el commit de las demás.

export function todasFallaron(resultados) {
  const valores = Object.values(resultados || {});
  return valores.length > 0 && valores.every((x) => x && x.error);
}

export function anotarFallos(resultados, flujo, emitir = console.log) {
  for (const [cuenta, r] of Object.entries(resultados || {})) {
    if (r && r.error) emitir(`::error::${flujo} · cuenta ${cuenta}: ${r.error}`);
  }
}

export function resumirResultados(resultados, describir) {
  return Object.entries(resultados || {}).map(([cuenta, r]) => `${cuenta}: ${r && r.error ? `ERROR (${r.error})` : describir(r)}`).join(" · ");
}
