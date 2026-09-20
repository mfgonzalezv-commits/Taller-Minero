// Lo ejecuta el cron de Railway cada 5 minutos: llama al motor de alertas de la aplicación y termina.
// Variables: ALERTAS_CRON_SECRET (mismo valor que en la aplicación) y APP_URL (por defecto la URL pública de producción).
// No imprime el secreto.
const secreto = process.env.ALERTAS_CRON_SECRET
const url = (process.env.APP_URL || 'https://taller-minero-production.up.railway.app').replace(/\/$/, '') + '/api/alertas/procesar'
if (!secreto) { console.error('Falta ALERTAS_CRON_SECRET'); process.exit(1) }
const res = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${secreto}` }, signal: AbortSignal.timeout(60_000) })
console.log(`alertas: HTTP ${res.status} ${res.ok ? await res.text() : ''}`)
process.exit(res.ok ? 0 : 1)
