-- 0088_attachment_storage_key_check.sql — Auditoría de seguridad
-- 2026-09-16, hallazgo S4.
--
-- `task_attachments_insert_self` (0038, reescrita en 0084) valida que
-- `uploaded_by = auth.uid()` y que quien inserta pueda acceder al
-- `node_id` — pero nunca valida ninguna relación entre `storage_key` y
-- `node_id`. El Worker genera la key como `{node_id}/{uuid}-{filename}`
-- (worker/attachments.ts), pero la fila la inserta el cliente por su
-- cuenta (src/features/attachments/api.ts), que puede mandar el
-- `storage_key` que quiera.
--
-- `handleAttachmentDownload` (worker/attachments.ts) autoriza buscando
-- la fila POR `storage_key` bajo la RLS de quien pide — sin este CHECK,
-- insertar en un nodo propio una fila cuyo `storage_key` apunte al
-- archivo de OTRO nodo permite descargarlo. `storage_key` ya es `unique`
-- (0038), así que mientras la fila original exista el INSERT falla, pero
-- el ataque solo necesita un objeto huérfano en R2 (archivo subido sin
-- que su fila de metadata se llegara a insertar — el propio código
-- documenta que eso puede pasar) para recuperar el hueco.
--
-- Verificado contra la base real antes de aplicar: las 5 filas
-- existentes de `task_attachments` ya cumplen el patrón (mismo formato
-- que siempre generó el Worker), así que el CHECK no rompe nada vigente.
alter table public.task_attachments
  add constraint task_attachments_storage_key_matches_node
  check (storage_key like node_id::text || '/%');
