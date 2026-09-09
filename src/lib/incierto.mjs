// Error compartido por los clientes de las redes: la petición que publica se envió y no hubo respuesta clara (corte de
// red, timeout). La publicación pudo o no haberse creado: el destino queda "incierto" hasta reconciliar con evidencia o
// decidirlo a mano (diseño §4.2). Nunca se reintenta a ciegas.
export class ErrorIncierto extends Error {
  constructor(mensaje, causa = null) {
    super(mensaje);
    this.name = "ErrorIncierto";
    this.incierto = true;
    this.causa = causa;
  }
}

export const esIncierto = (err) => Boolean(err && err.incierto === true);
