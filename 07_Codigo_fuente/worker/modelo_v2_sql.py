# Etapa 2 del modelo nuevo: genera el SQL que deja D1 lista para el Worker del patch24.
#   - Índice del perfil por (día de la semana, franja, tercio): lo usan la regla de ventana faltante y la demo.
#   - Borra las 7 vistas y las tablas que ya no se usan (core_metricas_esperadas, historico_metricas, calendario,
#     raw_metricas_recibidas, demo_escenarios).
#   - Vacía alertas, eventos, avisos, cache del tablero y TODAS las métricas observadas: la demo arranca sin datos
#     recibidos (el perfil ya está entrenado con la historia hasta el arranque) y la escena 1 es la primera llegada.
#
# Salidas: modelo_v2_d1.sql (una sentencia por línea; la usa mkdb.mjs) y
#          02_Base_de_datos_D1/09_modelo_v2_d1.txt (bloques numerados para la consola de D1).
# Uso: python modelo_v2_sql.py
import os
AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..'))


def main():
    bloques = [('Índice del perfil por día de la semana, franja y tercio (lo usan la regla de ventana faltante y la demo)',
                'CREATE INDEX IF NOT EXISTS ix_perfil_comportamiento_franja ON perfil_comportamiento (dia_semana, franja_horaria, tercio_mes);')]
    for v in ('v_alertas', 'v_alertas_observadas', 'v_alertas_faltantes', 'v_prealertas', 'v_comparacion', 'v_incidentes', 'v_prediccion_vigente'):
        bloques.append(('Borrar la vista ' + v + ' (su SQL ahora está en el Worker)', 'DROP VIEW IF EXISTS ' + v + ';'))
    for t, por_que in (('core_metricas_esperadas', 'la reemplaza perfil_comportamiento'),
                       ('historico_metricas', 'la historia es core_metricas_observadas; el perfil se entrena fuera de D1'),
                       ('calendario', 'el día de la semana y el tercio se calculan de la fecha'),
                       ('raw_metricas_recibidas', 'no se usa'), ('demo_escenarios', 'no se usa')):
        bloques.append(('Borrar la tabla ' + t + ' (' + por_que + ')', 'DROP TABLE IF EXISTS ' + t + ';'))
    for t in ('avisos', 'alerta_eventos', 'alertas_historico', 'prealertas_estado', 'series_estado', 'core_metricas_observadas'):
        bloques.append(('Vaciar ' + t, 'DELETE FROM ' + t + ';'))
    bloques.append(('Reloj de la demo en el arranque (lunes 26/10/2026 10:00 ARG)',
                    "UPDATE alerta_parametros SET ahora = '2026-10-26T13:00:00Z', horizonte_horas = 24 WHERE id = 1;"))
    bloques.append(('Marcar el tablero para que se recalcule', "UPDATE tablero_cache SET revision = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1;"))

    for _, b in bloques:
        assert '\n' not in b and len(b.encode()) < 100_000, b[:80]
    open(os.path.join(AQUI, 'modelo_v2_d1.sql'), 'w', encoding='utf-8', newline='\n').write('\n'.join(b for _, b in bloques) + '\n')
    txt = '''MODELO v2 · ETAPA 2 (para D1: helios-monitoring-dev) — el motor compara contra el perfil y se borran las vistas

Correr DESPUÉS de perfil_comportamiento_d1.txt (ya cargado) y ANTES de publicar el Worker nuevo.
Antes de empezar, en la consola: /bookmark (para poder volver con /restore).

Qué hace:
  1. Crea el índice ix_perfil_comportamiento_franja (lo usan la regla de ventana faltante y la demo).
  2-8. Borra las 7 vistas: su SQL ahora vive en el Worker.
  9-13. Borra las tablas que ya no se usan: core_metricas_esperadas, historico_metricas, calendario,
     raw_metricas_recibidas y demo_escenarios.
  14-19. Vacía avisos, eventos, alertas, el cache del tablero y TODAS las métricas observadas. La demo arranca sin datos
     recibidos: el perfil ya está entrenado con la historia hasta el lunes 26/10 a las 10:00 y la escena 1 es la primera
     llegada de datos de cada serie.
  20. Pone el reloj de la demo en el lunes 26/10/2026 10:00 ARG.
  21. Marca el tablero para que se recalcule.

Escrituras estimadas: unas 68.000 filas (el índice ~26.000; borrar las métricas viejas ~42.000 contando sus 3 índices).
Correrlo en un día con el cupo libre (se renueva a las 21:00 de Argentina). Todos los bloques se pueden repetir.
Después de publicar el Worker: Preparar demo y recorrer las escenas.

Son %d bloques: pegar cada uno (una sola línea) en orden. O con Wrangler, el archivo modelo_v2_d1.sql de 07_Codigo_fuente/worker:
  npx wrangler d1 execute helios-monitoring-dev --remote --file=07_Codigo_fuente/worker/modelo_v2_d1.sql
''' % len(bloques)
    for k, (t, b) in enumerate(bloques, 1):
        txt += '\n--- %d. %s ---\n%s\n' % (k, t, b)
    open(os.path.join(RAIZ, '02_Base_de_datos_D1', '09_modelo_v2_d1.txt'), 'w', encoding='utf-8', newline='\n').write(txt)
    print(len(bloques), 'bloques')


if __name__ == '__main__':
    main()
