// Errores con el formato del contrato: { error: "codigo_corto", message: "texto en español" }
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

export const badRequest = (code: string, msg: string, details?: unknown) => new AppError(400, code, msg, details)
export const unauthorized = (code = 'no_autenticado', msg = 'Inicia sesión para continuar.') => new AppError(401, code, msg)
export const forbidden = (code = 'sin_permiso', msg = 'No tienes permiso para esta acción.') => new AppError(403, code, msg)
export const notFound = (msg = 'No encontrado.') => new AppError(404, 'no_encontrado', msg)
export const conflict = (code: string, msg: string) => new AppError(409, code, msg)
