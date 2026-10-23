# GestorPractiques

CRM sencillo de empresas con envío de correos por Gmail, historial de contactos, notificación de respuestas y envíos masivos con plantilla.

**Stack:** React (Vite) · Node.js + Express · Supabase (Postgres, Auth, Realtime) · Gmail API.

## Puesta en marcha
1. **Supabase**: crea un proyecto y ejecuta `supabase/schema.sql` en el SQL Editor.
2. **Google Cloud**: crea un proyecto, activa la *Gmail API*, configura la pantalla de consentimiento OAuth (añade tu correo como usuario de prueba) y crea unas credenciales *ID de cliente OAuth* (aplicación web) con la URI de redirección `http://localhost:3001/api/gmail/callback`.
3. **Backend**: `cd backend && cp .env.example .env` (rellénalo) `&& npm install && npm run dev`.
4. **Frontend**: `cd frontend && cp .env.example .env` (rellénalo) `&& npm install && npm run dev`.
5. Abre http://localhost:5173, crea tu cuenta, pulsa **Conectar Gmail** y ya puedes trabajar.

## Cómo funciona
- Los correos se envían con tu cuenta mediante la Gmail API y quedan guardados en el historial de cada empresa.
- El backend consulta Gmail cada minuto; si hay una respuesta en un hilo que empezaste tú, guarda la interacción y crea una notificación que aparece al instante en la app (Supabase Realtime).
- Los envíos masivos salen escalonados (`SEND_DELAY_MS`) y con un máximo de 400 por campaña, por los límites de Gmail.

## Limitaciones de la v1
- Sin baja/darse de baja automática: añade tú el aviso en la plantilla (RGPD/LSSI).
- Pensada para un único usuario: desactiva el registro público en Supabase (Authentication > Providers > Email) tras crear tu cuenta.
- Sin edición ni borrado de registros desde la interfaz.
