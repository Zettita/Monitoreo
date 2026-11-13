ALTER TABLE alertas_historico ADD COLUMN causa_resolucion TEXT;
ALTER TABLE alertas_historico ADD COLUMN acciones_resolucion TEXT;
ALTER TABLE alerta_parametros ADD COLUMN opciones_resolucion TEXT;
UPDATE alerta_parametros SET opciones_resolucion = '{"causas":[{"id":1,"nombre":"Falla del cliente","activo":1},{"id":2,"nombre":"Falla nuestra","activo":1},{"id":3,"nombre":"Proveedor o gateway","activo":1},{"id":4,"nombre":"Comportamiento esperado (promo, feriado, campaña)","activo":1},{"id":5,"nombre":"Falsa alarma","activo":1}],"acciones":[{"id":6,"nombre":"Se contactó al cliente","activo":1},{"id":7,"nombre":"Se corrigió","activo":1},{"id":8,"nombre":"Se escaló","activo":1},{"id":9,"nombre":"No requirió acción","activo":1}]}' WHERE id = 1 AND opciones_resolucion IS NULL;
