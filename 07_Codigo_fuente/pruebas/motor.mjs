// Ayuda para las pruebas: el SQL del motor (modelo v2, sin vistas) tal como está en el Worker construido (w.mjs).
//   alertas()    = lo que antes devolvía v_alertas (reglas 1 a 11 + ventana faltante)
//   faltantes()  = lo que antes devolvía v_alertas_faltantes
//   prealertas() = lo que antes devolvía v_prealertas
// referencia(db): consultas del tablero anterior (referencia_tablero.mjs: Q_SERIES, Q_INCIDENTES, Q_KPIS); crea
// v_incidentes como vista TEMPORAL (solo en la conexión de la prueba) con la definición que tenía en la base.
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const W = fs.readFileSync(new URL('../worker/w.mjs', import.meta.url), 'utf8');
import { Q_SERIES, Q_INCIDENTES, Q_KPIS } from './referencia_tablero.mjs';

const constante = (fuente, nombre) => {
  let i = fuente.indexOf('const ' + nombre + ' = `');
  if (i < 0) throw new Error('No está la constante ' + nombre);
  i = fuente.indexOf('`', i) + 1;
  return fuente.slice(i, fuente.indexOf('`;', i));
};
export const sqlDe = (nombre) => constante(W, nombre);

export function motor(db) {
  const obs = db.prepare(sqlDe('SQL_ALERTAS_OBSERVADAS'));
  const fal = db.prepare(sqlDe('SQL_ALERTAS_FALTANTES'));
  const pre = db.prepare(sqlDe('SQL_PREALERTAS'));
  return { alertas: () => [...obs.all(), ...fal.all()], faltantes: () => fal.all(), prealertas: () => pre.all() };
}

export function referencia(db) {
  const base = new DatabaseSync(new URL('./base.sqlite', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), { readOnly: true });
  const v = base.prepare("SELECT sql FROM sqlite_master WHERE name = 'v_incidentes'").get().sql;
  base.close();
  db.exec(v.replace('CREATE VIEW v_incidentes', 'CREATE TEMP VIEW IF NOT EXISTS v_incidentes'));
  return { series: Q_SERIES, inc: Q_INCIDENTES, kpis: Q_KPIS };
}
