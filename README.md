# Helios · Monitoreo de alertas

MVP de la plataforma de observabilidad de Helios: compara cada ventana de 15 minutos contra un perfil de comportamiento esperado y genera alertas, pre-alertas, avisos y tableros. Corre en Cloudflare (Worker `worker-alertas-cron` + base D1 `helios-monitoring-dev`, plan gratuito). Todos los datos son ficticios.

## Si sos una IA (o una persona) que llega al proyecto, leé en este orden

1. [`05_Documentacion/contexto_helios_para_ia.md`](05_Documentacion/contexto_helios_para_ia.md): **fuente de verdad** del sistema (tablas, reglas, pantallas, permisos, decisiones, pendientes, cambios recientes en la sección 16).
2. [`CLAUDE.md`](CLAUDE.md): cómo se trabaja, el entorno real en Cloudflare, cómo construir y probar, en qué etapa estamos.
3. [`LEEME.md`](LEEME.md): qué hay en cada carpeta.
4. Novedades puntuales: [`05_Documentacion/novedades_avisos_push_y_app.md`](05_Documentacion/novedades_avisos_push_y_app.md).

## Cómo se mantiene al día

- Este repositorio es la copia compartida del proyecto. Cada cambio probado se sube acá con un mensaje que dice qué cambió, y la documentación (`contexto_helios_para_ia.md`, `CLAUDE.md`) se actualiza en el mismo commit.
- Antes de trabajar: `git pull`. Para ver qué cambió desde la última vez: `git log --oneline` o la sección 16 del contexto.
- `01_Worker/worker_alertas_cron.js` es siempre la última versión del Worker; se genera desde `07_Codigo_fuente/worker` (no se edita a mano).

## Lo que no está en el repositorio

- **Claves:** el secreto `VAPID_JWK` (avisos push) vive solo en Cloudflare. Nunca se sube una clave, token o contraseña real.
- Bases de prueba `*.sqlite` (las arma `mkdb.mjs` a partir de `07_Codigo_fuente/pruebas/base.sqlite`) y la salida del build (`w.mjs`).
