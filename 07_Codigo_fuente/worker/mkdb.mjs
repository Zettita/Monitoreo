import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
const [,, src, dst, sinUmbrales] = process.argv;
fs.copyFileSync(src, dst);
const db = new DatabaseSync(dst);
const arch = ['acceso_d1_tablas.sql', 'admin_d1_tablas.sql', 'asignacion_d1_tablas.sql', 'avisos_d1_tablas.sql', 'cache_d1_tablas.sql', 'vistas_fecha.sql', 'prealertas_prod.sql'];
if (!sinUmbrales) arch.push('umbrales_d1.sql', 'feriados_d1.sql');
// Modelo v2: perfil de comportamiento (03_Modelo_v2_perfil) y etapa 2 (motor sin vistas + carga base de la demo)
if (!sinUmbrales) arch.push('../../03_Modelo_v2_perfil/perfil_comportamiento_d1.sql', 'modelo_v2_d1.sql');
// Avisos push en el dispositivo (parche 26)
if (!sinUmbrales) arch.push('push_d1.sql');
// Asistente de IA (parche 28)
if (!sinUmbrales) arch.push('asistente_d1.sql');
if (!sinUmbrales) arch.push('contexto_d1.sql');
if (!sinUmbrales) arch.push('ticketera_d1.sql');
if (!sinUmbrales) arch.push('evidencia_d1.sql');
if (!sinUmbrales) arch.push('revision_d1.sql');
// Etapa 3b (parche 38): script 16 (reglas_alerta + columnas del caché) y script 17 (borra las tablas viejas).
// SIN_ETAPA_3B=1 arma la base como estaba antes (para probar la migración).
if (!sinUmbrales && !process.env.SIN_ETAPA_3B) arch.push('reglas_cache_d1.sql', 'limpieza_d1.sql');
if (!sinUmbrales && !process.env.SIN_ETAPA_3B) arch.push('plantillas_d1.sql', 'tickets_d1.sql');   // parches 40 y 41: plantillas de correo (script 18) y tickets (script 19)
if (!sinUmbrales && !process.env.SIN_ETAPA_3B) arch.push('disponibilidad_d1.sql');   // parche 45: objetivo mensual y pesos de disponibilidad (script 20)
if (!sinUmbrales && !process.env.SIN_ETAPA_3B) arch.push('comunicados_d1.sql');   // parche 46: comunicar incidente (script 21)
if (!sinUmbrales && !process.env.SIN_ETAPA_3B && !process.env.SIN_SCRIPT_22) arch.push('equipos_comunicados_d1.sql');   // parche 63: equipos y listas de difusión unificados (script 22)
if (!sinUmbrales && !process.env.SIN_ETAPA_3B && !process.env.SIN_SCRIPT_23) arch.push('correo_usuarios_d1.sql');   // parche 68: correo de cada usuario (script 23)
if (!sinUmbrales && !process.env.SIN_ETAPA_3B && !process.env.SIN_SCRIPT_24) arch.push('sala_crisis_d1.sql');   // parche 69: sala de crisis (script 24)
if (!sinUmbrales && !process.env.SIN_ETAPA_3B && !process.env.SIN_SCRIPT_25) arch.push('teams_bot_memoria_d1.sql');   // parche 77: memoria del bot de Teams (script 25)
for (const f of arch)
  for (const l of fs.readFileSync(new URL('./' + f, import.meta.url), 'utf8').split('\n')) if (l.trim()) db.exec(l);
console.log('db lista', dst, sinUmbrales ? '(sin umbrales)' : '');
