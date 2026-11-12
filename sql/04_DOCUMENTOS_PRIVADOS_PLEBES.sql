-- Plebes Wings: almacén privado y fichas legales. APLICADO a plebes-wings-prod el 10-nov-2026.
-- Este archivo es respaldo de la migración; no debe ejecutarse nuevamente sin revisar políticas existentes.
DO $check$
BEGIN
 IF EXISTS (SELECT 1 FROM storage.buckets WHERE id='pw-internal-documents' AND public) THEN
   RAISE EXCEPTION 'El almacén de Plebes Wings existe como público. Detener la migración.';
 END IF;
END $check$;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('pw-internal-documents','pw-internal-documents',false,8388608,
        ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO NOTHING;
CREATE POLICY "pw_doc_read_managers_v1" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='pw-internal-documents'
 AND split_part(name,'/',1)='legal'
 AND split_part(name,'/',2) IN ('pw-leg-01','pw-leg-02','pw-ops-03')
 AND split_part(name,'/',3)<>'' AND (SELECT private.pw_is_manager()));
CREATE POLICY "pw_doc_upload_managers_v1" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='pw-internal-documents'
 AND split_part(name,'/',1)='legal'
 AND split_part(name,'/',2) IN ('pw-leg-01','pw-leg-02','pw-ops-03')
 AND split_part(name,'/',3)<>'' AND (SELECT private.pw_is_manager()));
INSERT INTO public.pw_project_docs(id,title,description,category,status,url,note)
VALUES
('pw-leg-01','Convenio de confidencialidad y protección de información reservada',
 'Control de recetas, formulaciones, sistemas, credenciales e información empresarial.','Legal','Pendiente de revisión',NULL,
 'Completar datos del titular y trabajador, revisar jurídicamente y firmar. Archivo privado pendiente de carga.'),
('pw-leg-02','Aviso de privacidad integral para personal',
 'Tratamiento de datos laborales y derechos de las personas titulares.','Datos personales','Pendiente de revisión',NULL,
 'Completar domicilio, responsable, canal ARCO y fecha. Archivo privado pendiente de carga.'),
('pw-ops-03','Política integral de operación, tickets y seguridad digital',
 'Procedimientos internos sobre tickets, inventario y seguridad de la información.','Operación','Pendiente de revisión',NULL,
 'Aprobar controles y canales. No anunciar garantía por falta de ticket hasta contar con POS y procedimientos probados.')
ON CONFLICT (id) DO NOTHING;
