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
for (const f of arch)
  for (const l of fs.readFileSync(new URL('./' + f, import.meta.url), 'utf8').split('\n')) if (l.trim()) db.exec(l);
console.log('db lista', dst, sinUmbrales ? '(sin umbrales)' : '');
