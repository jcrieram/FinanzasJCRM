# FinanzasJCRM

Repo con dos apps web (PWA) servidas desde Vercel:

- **/** → Asistente Financiero (control de gastos personal) — `INDEX.html`
- **/consulta/** → Asistente de Consulta clínica (graba la entrevista, transcribe y genera la nota lista para pegar en la ficha digital)

## Asistente de Consulta

PWA instalable en iPhone que graba la entrevista médico-paciente, la transcribe con Whisper, redacta la nota clínica con gpt-4o-mini siguiendo el esquema acordado, y permite **copiar la nota** o **enviarla por email**.

### Flujo

1. Abres `https://<tu-dominio>/consulta/` en Safari.
2. Compartir → "Añadir a pantalla de inicio".
3. Tocas Grabar, haces la entrevista, tocas Detener.
4. La app sube el audio → transcribe → extrae los campos → te muestra el párrafo final.
5. Tocas **Copiar todo** y lo pegas en la ficha. Opcional: **Enviar por email**.

El audio nunca se persiste en el servidor — se reenvía en streaming a OpenAI y se descarta.

### Esquema de la nota

> Se trata de paciente de [edad] años, quien consulta por [motivo y enfermedad actual]. Como antecedentes médicos refiere [enfermedades crónicas]. Alergias a medicamentos: [...]. Antecedentes quirúrgicos: [...]. Tabaquismo: [...]. [Si aplica: Al examen físico se evidencia... incluyendo tacto rectal/próstata o examen de genitales.]

### Variables de entorno (configurar en Vercel)

| Variable | Para qué sirve |
|---|---|
| `OPENAI_API_KEY` | Whisper (transcripción) + gpt-4o-mini (extracción) |
| `RESEND_API_KEY` | Envío del email |
| `RESEND_FROM` | Remitente. Por defecto `Consulta <onboarding@resend.dev>` (funciona sin dominio propio) |

### Deploy

```
# 1. En Vercel: importar el repo (ya está conectado) y hacer redeploy
# 2. Project → Settings → Environment Variables → agregar las dos keys
# 3. Volver a deployar
```

### Costos aproximados

- Whisper: $0.006 / minuto (consulta de 20 min ≈ $0.12)
- gpt-4o-mini para extraer: ≈ $0.001 por consulta
- Resend: gratis hasta 3000 emails/mes

### Límites

- Tamaño máximo de audio: 25 MB (límite de Whisper). En Opus mono a 24 kbps esto da ~140 minutos de grabación, pero el plan **Hobby de Vercel limita el body a 4.5 MB** (~25 minutos). Si grabas más, subir a plan Pro o cortar la consulta.
- iOS Safari puede pausar la grabación al bloquear pantalla. La app pide `wake lock` para mantenerla activa, pero conviene dejar la pantalla abierta durante la entrevista.

### Privacidad

- Audio nunca se guarda en el servidor.
- Conexión HTTPS (Vercel default).
- OpenAI no usa los datos de API para entrenar (política por defecto desde 2023).
- Considera borrar los emails de Gmail cuando ya hayas pegado la nota en la ficha si manejas datos sensibles.
