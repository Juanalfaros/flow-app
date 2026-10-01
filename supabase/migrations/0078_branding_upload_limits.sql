-- 0078_branding_upload_limits.sql — tope de tamaño y formatos permitidos
-- para el bucket `branding` (0077). El cliente ya recomprime y rechaza
-- HEIC antes de subir (features/workspace/branding-image.ts), pero eso es
-- solo la UI — cualquiera con el token de un admin podría llamar
-- `supabase.storage.from('branding').upload()` directo, sin pasar por esa
-- capa. Mismo criterio de siempre en este repo: validar en el cliente Y
-- endurecer la barrera real (acá, la config del bucket) para que no sea
-- "confiar en que el cliente use el camino correcto".
--
-- 5 MB: generoso para una imagen ya recomprimida por el cliente (login
-- background baja a JPEG calidad 0.85 con 1920px de lado mayor, el logo a
-- PNG con 480px), y suficiente colchón para una subida directa sin pasar
-- por esa recompresión.
update storage.buckets
set
  file_size_limit = 5242880, -- 5 MB en bytes
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
where id = 'branding';
