# UroAtlas — Guía de setup paso a paso

Esta guía cubre lo que el Dr. Juan Carlos tiene que hacer **antes** de
que empecemos a programar. Son tres bloques: crear cuenta de Supabase,
crear el proyecto, y subir los 82 PDFs.

Dedicación estimada: **30-45 minutos**, todo desde el navegador.

---

## Bloque A — Crear cuenta y proyecto en Supabase

### A.1 Crear cuenta
1. Entrar a https://supabase.com.
2. Botón "Start your project" arriba a la derecha.
3. Iniciar sesión con GitHub (recomendado, ya tienes cuenta) o con
   email.
4. Confirmar el email si te lo pide.

### A.2 Crear el proyecto
1. Una vez dentro del dashboard, botón verde "New project".
2. Llenar:
   - **Name**: `uroworknet` (o el que quieras, no afecta).
   - **Database Password**: una contraseña fuerte. **Guárdala en un
     gestor de contraseñas, la vas a necesitar.** Si la pierdes,
     Supabase no la recupera.
   - **Region**: la más cercana. Para Chile/Latinoamérica:
     `South America (São Paulo)` o `East US (North Virginia)`.
   - **Pricing Plan**: Free.
3. Botón "Create new project".
4. Esperar 1-2 minutos a que termine de aprovisionarse.

### A.3 Anotar las credenciales del proyecto
Una vez creado, ir a **Settings → API** (engranaje en la barra
lateral). Copiar y guardar en un lugar seguro:

- **Project URL** (algo como `https://xxxxx.supabase.co`)
- **anon public key** (clave larga, empieza con `eyJ…`)
- **service_role key** (otra clave larga, **mantenerla privada**, no
  compartirla nunca por chat ni email; es como una contraseña de
  administrador)

> Cuando arranquemos la Fase 1, te voy a pedir estas tres credenciales
> para configurar la app. Mándamelas por un canal seguro.

---

## Bloque B — Crear el bucket de almacenamiento

El "bucket" es la carpeta donde van a vivir los PDFs.

1. En el panel lateral del proyecto, clic en **Storage** (ícono de
   carpeta).
2. Botón "New bucket".
3. Llenar:
   - **Name**: `uroatlas-sources`
   - **Public bucket**: **dejarlo desmarcado** (queremos que sea
     privado, solo accesible con auth).
   - **File size limit**: 50 MB (algunos libros son grandes).
   - **Allowed MIME types**: dejar vacío para permitir todo, o
     escribir `application/pdf`.
4. Botón "Create bucket".

---

## Bloque C — Organizar los PDFs en tu Mac antes de subir

Antes de empezar a subir, **organiza los 82 PDFs en 4 carpetas
locales** en tu Mac. Esto nos sirve para que el script de ingesta
(que armaré en Fase 2) sepa de dónde viene cada documento y los
clasifique correctamente.

Estructura recomendada:
```
~/UroAtlas-Sources/
├── eau-pocket/        (20 PDFs)
├── aua-non-onc/       (38 PDFs)
├── aua-onc/           (17 PDFs)
└── libros/            (7 PDFs)
```

Cómo hacerlo:
1. En Finder, crea una carpeta nueva en tu Mac llamada
   `UroAtlas-Sources` (en Documentos o donde prefieras).
2. Dentro, crea las 4 subcarpetas con esos nombres exactos
   (en minúsculas, con guiones, sin tildes ni espacios).
3. Descarga los PDFs desde Drive y muévelos a la carpeta
   correspondiente. Tip: en Drive, selecciona todos los archivos
   de una carpeta (Cmd+A) → clic derecho → "Descargar". Te
   bajará un .zip con todos.
4. Descomprime el zip y arrastra los PDFs a la subcarpeta correcta
   en `UroAtlas-Sources`.

> No renombres los archivos. Los nombres tal como están sirven para
> que el script identifique de qué guideline viene cada uno.

---

## Bloque D — Subir los PDFs a Supabase

Una vez que tienes las 4 carpetas organizadas en tu Mac:

1. Volvé al dashboard de Supabase, sección **Storage**.
2. Clic en el bucket `uroatlas-sources`.
3. Botón "Upload files" arriba a la derecha → "Upload folder".
4. Selecciona la carpeta `eau-pocket` desde tu Mac. Supabase
   subirá los 20 PDFs manteniendo la estructura de carpeta.
5. Esperar a que termine la barra de progreso (puede tardar
   varios minutos según tu conexión).
6. Repetir el paso 3-5 para `aua-non-onc`, `aua-onc` y `libros`.

Al terminar, dentro del bucket deberías ver 4 carpetas, cada una
con sus PDFs.

### Verificación
- Total de archivos: **82 PDFs** distribuidos en 4 carpetas.
- Tamaño total estimado: ~250 MB (los libros pesan más).
- Free tier de Supabase Storage: 1 GB. Vamos cómodos.

---

## Bloque E — Lo que sigue (lo hago yo)

Cuando me confirmes que terminaste los bloques A-D y me pases las
3 credenciales (Project URL, anon key, service_role key), arranco
con la Fase 1 del roadmap:

1. Configurar Supabase Auth (email + contraseña).
2. Crear las tablas `documents` y `cases` en la base de datos.
3. Migrar ConsultaVoz del PIN actual a Supabase Auth.
4. Crear el shell de UroAtlas en `/uroatlas` con la UI estilo
   médico profesional.

Luego (Fase 2) escribo el script `scripts/ingest-uroatlas.js` que:
- Se conecta a tu bucket.
- Lee cada PDF, lo clasifica por carpeta de origen.
- Extrae texto, lo divide en chunks.
- Genera embeddings con Voyage AI.
- Inserta todo en la tabla `documents`.

Y de ahí seguimos con las fases 3, 4 y 5 del documento de diseño.

---

## Resumen rápido (checklist)

- [ ] Crear cuenta en Supabase
- [ ] Crear proyecto `uroworknet` (región más cercana, plan Free)
- [ ] Anotar Project URL, anon key, service_role key
- [ ] Crear bucket privado `uroatlas-sources`
- [ ] Organizar los 82 PDFs en 4 carpetas locales
- [ ] Subir las 4 carpetas al bucket
- [ ] Avisarme y mandarme las credenciales

Cuando todo esté listo, arrancamos a programar.
