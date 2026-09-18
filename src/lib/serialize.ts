import { Prisma } from '@prisma/client'

// Convierte recursivamente cualquier `Prisma.Decimal` a `number` plano antes de
// cruzar el límite Server Component / Server Action -> Client Component. No
// toca consultas, permisos ni reglas de negocio — solo serialización.
// React Server Components no soporta pasar instancias de Decimal (ni Date
// anidado dentro de estructuras complejas en algunos casos), así que este
// helper se usa justo antes de devolver datos a un componente cliente.
export function serializar<T>(valor: T): T {
  if (valor instanceof Prisma.Decimal) {
    return Number(valor) as unknown as T
  }
  if (Array.isArray(valor)) {
    return valor.map(serializar) as unknown as T
  }
  if (valor instanceof Date) {
    return valor
  }
  if (valor !== null && typeof valor === 'object') {
    const resultado: Record<string, unknown> = {}
    for (const [clave, v] of Object.entries(valor)) {
      resultado[clave] = serializar(v)
    }
    return resultado as T
  }
  return valor
}
