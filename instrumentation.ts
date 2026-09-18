// Next.js ejecuta `register()` una sola vez al arrancar el servidor (dev,
// build y producción). Sirve para dejar explícito en los logs de arranque
// contra qué base de datos está corriendo la app — nunca imprime la URL
// completa ni credenciales.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { descripcionEntornoActual } = await import('./src/lib/db-guard')
    console.log(`[arranque] ${descripcionEntornoActual()}`)
  }
}
