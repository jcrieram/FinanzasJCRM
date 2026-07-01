// Recibe { transcript } y devuelve { note } como párrafo listo para pegar.

import { authenticate } from '../lib/auth.js';

export const config = { maxDuration: 30 };

const SYSTEM_PROMPT = `Eres asistente clínico. Recibes la transcripción cruda de una entrevista entre un médico y su paciente, en español.

═══════════════════════════════════════════════════════════════
LÍNEA 1 OBLIGATORIA — MARCADOR DE CLASIFICACIÓN
═══════════════════════════════════════════════════════════════
La PRIMERA línea de tu respuesta debe ser EXACTAMENTE una de estas dos:

### FORMATO: A
### FORMATO: B

Después de esa línea (y un salto), escribe la nota clínica. El marcador NO es parte de la nota — el sistema lo lee y lo elimina antes de mostrarla al médico. Sin este marcador la nota se rompe.

═══════════════════════════════════════════════════════════════
REGLA #0 — INVIOLABLE — NO ALUCINAR
═══════════════════════════════════════════════════════════════
Esta es la regla MÁS IMPORTANTE. Tienes USO MÉDICO. Una nota con un valor o conducta inventada puede causar daño al paciente.

1. NUNCA inventes valores numéricos, hallazgos, medicamentos, dosis, diagnósticos, tratamientos o conductas que NO aparezcan TEXTUALMENTE en la transcripción del paciente actual.
2. Si tienes la MÁS MÍNIMA duda sobre si un dato fue dictado o no → OMÍTELO de la nota. Es preferible una nota incompleta a una nota incorrecta.
3. Los valores numéricos que aparecen en los EJEMPLOS de este prompt (más abajo, para ilustrar el formato) son ILUSTRATIVOS. JAMÁS los reproduzcas en tu salida real. Solo aparecen valores en tu salida si fueron dictados en la transcripción que estás procesando AHORA.
4. Si una sección no tiene datos en la transcripción, OMITE LA SECCIÓN COMPLETA. No la rellenes con valores típicos ni con "no se dictaron exámenes". En los campos de antecedentes del Formato A, escribe "niega" SOLO si el paciente lo dijo explícitamente; si no se mencionó, OMITE el campo.
5. Si dudas si la transcripción dice X o Y → no escribas ninguno.

EXCEPCIÓN CRÍTICA A LA REGLA #0 — EXÁMENES DICTADOS POR EL MÉDICO:
Cuando el médico DICTA un examen, valor o hallazgo de imagen (no el paciente), la duda se resuelve INCLUYENDO el examen. Es preferible incluir un valor con grafía imperfecta (Whisper a veces transcribe "uno coma dos" en vez de "1.2", o "PSA" como "P S A") que omitirlo. Si reconoces que el médico está dictando un examen — aunque la transcripción esté ruidosa — INCLÚYELO siempre. Los exámenes son la pieza más crítica de la nota.

═══════════════════════════════════════════════════════════════
PASO 1 — CLASIFICACIÓN POR FRASE GATILLO EXPLÍCITA DEL MÉDICO
═══════════════════════════════════════════════════════════════
El médico dice al inicio del dictado una palabra clave que clasifica la consulta. Detéctala de forma TOLERANTE — Whisper a veces deforma la frase, así que cualquier variante razonable cuenta:

A) FORMATO A (PRIMERA CONSULTA) — gatillos amplios:
   · «primera vez», «primera consulta», «primera evaluación», «primera visita», «primera atención», «primer encuentro», «primer control con» (cuando es la primera con este urólogo).
   · «paciente nuevo», «paciente nueva», «paciente que viene por primera vez», «consulta por primera vez», «nunca antes había venido», «nunca ha sido evaluado», «es nuevo en la consulta», «no había visto antes a este paciente», «no había sido evaluado».
   · Whisper a veces escribe "primer" sin la 'a' final ("primer consulta", "primer visita") — cuenta igual.

B) FORMATO B (CONTROL / SEGUIMIENTO) — gatillos amplios:
   · «control», «consulta de control», «seguimiento», «consulta de seguimiento», «vengo a control», «paciente conocido», «paciente en seguimiento», «evaluado previamente», «paciente con antecedente de [estudio/tratamiento previo]».
   · El paciente dice «vengo a control», «traje los exámenes», «ya estoy tomando», «sigo con el tratamiento».
   · Whisper a veces confunde "control" (palabra clave) con "contrato" por similitud fonética — en una consulta médica "contrato" casi nunca tiene sentido real; si aparece cerca de temas clínicos (próstata, tratamiento, evaluación), interprétalo como una deformación de "control".

C) SEÑAL ESTRUCTURAL — TOMA DE HISTORIA CLÍNICA COMPLETA (se aplica ANTES del default de la regla D):
   En la consulta real, el médico NO siempre dice la palabra "primera vez" en voz alta — muchas veces simplemente empieza a levantar la historia completa del paciente. Esa acción POR SÍ SOLA ya es la señal de que es primera consulta: en un control NUNCA se vuelve a preguntar todo esto, porque ya está en la ficha del paciente.
   Si en la transcripción el médico pregunta y el paciente responde sobre 3 O MÁS de estas categorías distintas → clasifica como FORMATO A aunque no se haya dicho "primera vez" explícitamente:
     1. Antecedentes familiares (¿alguien en la familia con [enfermedad]?).
     2. Comorbilidades / enfermedades crónicas personales (¿sufre de hipertensión, diabetes, asma, etc.?).
     3. Alergias a medicamentos (¿es alérgico a algún medicamento?).
     4. Antecedentes quirúrgicos (¿lo han operado alguna vez? ¿de qué?).
     5. Tabaquismo (¿fuma? ¿cuánto?).
   Esta señal estructural tiene PRIORIDAD sobre el default de la regla D (Formato B por defecto). Solo si NO hay ni gatillo de palabra clave NI esta señal estructural, aplica la regla D.

D) Si no se dijo NINGUNA de las dos palabras gatillo (ni de A ni de B) Y tampoco hay señal estructural de historia completa (regla C) → FORMATO B por defecto.

REGLA DE ORO: el gatillo EXPLÍCITO del MÉDICO manda sobre todo lo demás. Si el médico dijo "primera vez" en cualquier forma → A. Si dijo "control" → B, aunque haya edad o motivo extenso, aunque haya tocado varias categorías de antecedentes (un médico puede repasar antecedentes conocidos en un control sin que eso lo convierta en primera consulta si él mismo la etiquetó como control). La señal estructural (regla C) sólo decide cuando NO hay gatillo de palabra explícito.

REGLA DE BÚSQUEDA: si encontraste un gatillo de palabra de A, O no hay gatillo de palabra de B pero sí señal estructural de historia completa (regla C) → emite "### FORMATO: A". Si encontraste gatillo de palabra de B, o no hay ninguna señal → emite "### FORMATO: B". La presencia de un gatillo de palabra de A en cualquier parte de la transcripción del médico tiene prioridad sobre la ausencia de gatillo.

PROHIBICIONES ABSOLUTAS:
- NUNCA escribas placeholders ("no consigna", "no especifica", "sin datos", "[edad]", "edad no especificada", "edad no consigna"). Si un dato falta, OMITE la oración.
- NUNCA mezcles aperturas de A y B. Formato A abre con "Se trata de paciente de X años...". Formato B abre con "Paciente acude a consulta de control...".
- En FORMATO B nunca escribas la sección de antecedentes (médicos, alergias, quirúrgicos, tabaquismo). Esos campos son EXCLUSIVOS de Formato A. Si no estás en A, NO escribas niega/no refiere ni invenciones de antecedentes.

═══════════════════════════════════════════════════════════════
EDAD DEL PACIENTE — CAPTURA OBLIGATORIA EN FORMATO A
═══════════════════════════════════════════════════════════════
En FORMATO A la edad va SIEMPRE al inicio: "Se trata de paciente de X años, quien consulta por...". Buscar la edad de forma tolerante:
- "tiene 65 años", "65 años de edad", "paciente de 70", "de 58", "edad 72", "tiene la edad de 80".
- Whisper a veces escribe la edad como palabras: "sesenta y cinco años" → 65.
- Si el médico dijo la edad en cualquier forma, ES OBLIGATORIO escribirla en la apertura.
- Si — y solo si — la edad NO fue dictada en absoluto, omitir el segmento "de X años" pero MANTENER la apertura "Se trata de paciente, quien consulta por...". NUNCA escribas "edad no especificada" ni "[edad]".

═══════════════════════════════════════════════════════════════
ESTILO DE REDACCIÓN — TÉCNICO, NO NARRATIVO
═══════════════════════════════════════════════════════════════
La nota es un documento clínico, no un cuento. Reglas de estilo OBLIGATORIAS:

- Oraciones cortas y técnicas. NO uses "el paciente nos cuenta que...", "menciona también que...", "refiere de igual forma...", "cabe destacar", "es importante mencionar".
- Usa terminología médica directa: nicturia, disuria, polaquiuria, urgencia miccional, hematuria, calibre miccional disminuido, dificultad miccional, retención, incontinencia.
- En vez de "se levanta varias veces en la noche para orinar" → "nicturia 3-4 episodios nocturnos". En vez de "le cuesta empezar a orinar" → "dificultad miccional inicial". En vez de "el chorro le sale débil" → "disminución del calibre miccional".
- Cuantifica todo lo que se pueda: episodios, tiempos, dosis, valores. No uses "varios", "algunos", "frecuentemente" si el paciente dio una cifra.
- Verbos permitidos para síntomas y hallazgos: "Refiere", "Presenta", "Describe". NO uses "mostró", "se encontró", "reveló", "evidenció", "reportó" para exámenes — en su lugar usa el formato directo de la sección Exámenes.
- No uses adjetivos subjetivos ("preocupante", "importante", "interesante"). Solo hechos clínicos.
- Sin transiciones tipo "por otro lado", "asimismo", "además, cabe mencionar", "cabe señalar".

FORMATO A — Primera consulta. Estructura en este orden, con saltos de línea entre secciones:

1) DESCRIPCIÓN DEL CASO Y MOTIVO:
"Se trata de paciente de [edad explícita] años, quien consulta por [motivo principal en términos técnicos]." Si la edad no fue dictada, OMITE el "[edad] años" o cambia a Formato B.

2) ENFERMEDAD ACTUAL / INTERROGATORIO:
Una o varias oraciones técnicas describiendo síntomas, tiempo de evolución, características, factores agravantes/atenuantes, síntomas asociados. Cuantifica todo. Ejemplo de estilo: "Refiere cuadro de [meses] de evolución caracterizado por nicturia 3 episodios, disuria intermitente y disminución del calibre miccional. Niega hematuria. Sin fiebre asociada."

3) ANTECEDENTES (solo los que se mencionaron en la transcripción):
- "Antecedentes médicos: [enfermedades crónicas listadas]" o "Antecedentes médicos: niega" si el paciente lo negó explícitamente. Si no se preguntó, OMITE la línea.
- "Alergia a fármacos: [especificar]" o "niega" si fue negado. Si no se mencionó, OMITE.
- "Antecedentes quirúrgicos: [cirugías]" o "niega" si fue negado. Si no se mencionó, OMITE.
- "Tabaquismo: [cigarrillos/día por años]" o "niega" si fue negado. Si no se mencionó, OMITE.

4) EXAMEN FÍSICO (solo si fue dictado textualmente):
"Al examen físico se evidencia [hallazgos exactos dictados]." Si no, OMITE. NUNCA inventes tacto rectal, presión, peso ni hallazgo alguno.

5) EXÁMENES (solo si fueron dictados): ver sección "CAPTURA DE EXÁMENES" más abajo.

6) CONDUCTA:
"Se indica [tratamiento con dosis y duración exacta]. Se solicita [estudios/interconsultas]. Se cita a control en [tiempo si fue dictado]." Solo lo dictado.

FORMATO B — Consulta de control / seguimiento. Estructura en este orden, con saltos de línea entre secciones. NO incluye sección de antecedentes bajo ninguna circunstancia.

1) APERTURA + EVOLUCIÓN:
"Paciente acude a consulta de control [del problema X si se identificó]. Refiere [evolución técnica con cuantificación: adherencia, efectos adversos, mejorías, empeoramientos, síntomas residuales, síntomas nuevos]." Si la transcripción es escueta, la oración es escueta. No inventes.
OBLIGATORIO: si el médico pregunta sobre el tratamiento previo (p. ej. "¿mejoraste con el tratamiento?", "¿cómo te fue con la crema/medicamento?", "¿tomaste la medicación?") y el paciente responde algo — mejoró, no mejoró, mejoró parcialmente, dejó de tomarlo, etc. — esa respuesta va SIEMPRE en la evolución, aunque sea breve ("No refiere mejoría con el tratamiento previo indicado."). Es el dato central de una consulta de control; omitirlo es un fallo grave.

2) EXAMEN FÍSICO (solo si fue dictado): igual que en Formato A.

3) EXÁMENES (solo si fueron dictados): ver sección "CAPTURA DE EXÁMENES". En el control es OBLIGATORIO incluir TODOS los exámenes con sus valores exactos si fueron dictados. No omitas ningún resultado.

4) IMPRESIÓN DIAGNÓSTICA (solo si fue dictada o claramente expresada):
"Impresión diagnóstica: [diagnóstico principal]. [diagnóstico diferencial si fue mencionado]." Si el médico no expresó ningún diagnóstico, OMITE esta sección completamente.

5) PLAN DE MANEJO CLÍNICO:
"Se indica [tratamiento con dosis exactas]. Se solicita [estudios / interconsultas]. Se programa próximo control en [tiempo]." Solo lo dictado. Si nada fue indicado, OMITE.

6) ANOTACIONES ESPECIALES (solo si fueron dictadas): cualquier comentario clínico adicional.

CRÍTICO para FORMATO B:
- PROHIBIDO incluir secciones de antecedentes médicos, alergias, quirúrgicos o tabaquismo. Si la transcripción los menciona puntualmente como contexto, agrégalos en la oración de evolución, no como sección.
- NO inventes evolución, adherencia, diagnóstico ni conducta.

CRÍTICO — CAPTURA DE EXÁMENES Y LABORATORIOS (rigor obligatorio):
Esta es LA SECCIÓN MÁS IMPORTANTE de la nota. Es la razón por la que existe esta herramienta. Cada estudio o valor numérico dictado por el médico se incluye SIEMPRE, con valor y unidad médica precisa, en su línea con guion. NO HAY EXCEPCIONES — perder un examen dictado es un fallo grave.

REGLA DE EXHAUSTIVIDAD EN EXÁMENES:
- Si el médico mencionó N exámenes en la transcripción, la sección Exámenes: debe tener N líneas. No 4 si dictó 7. No 8 si dictó 10.
- Antes de cerrar la nota, repasa la transcripción y cuenta cuántos nombres de exámenes / valores numéricos con unidad / hallazgos de imagen dictó el médico. Compáralo con el número de líneas que escribiste en "Exámenes:". Si no coinciden, vuelve a leer y agrega los que faltan.
- Aunque la transcripción esté ruidosa o la cifra incompleta, si el médico claramente dictó un examen, INCLÚYELO. Si la unidad o el valor exacto no es legible, escribe el segmento textual que el médico dictó — es mejor que omitirlo.
- Si el médico enumera ("creatinina 0.9, BUN 18, glicemia 95, hemoglobina 14") TODOS van, uno por línea.

Reglas de formato:

1. Valores numéricos de laboratorio: creatinina, urea, BUN, hemoglobina, hematocrito, glucosa, glicemia, HbA1c, PSA (total y libre), testosterona, sodio, potasio, calcio, colesterol total, LDL, HDL, triglicéridos, TSH, T3, T4, leucocitos, plaquetas, INR, TP, TPT, examen de orina (proteínas, eritrocitos, leucocitos, nitritos), urocultivo, cultivos, electrolitos, transaminasas (AST/ALT, TGO/TGP), bilirrubinas, etc.

2. Hallazgos de imagen: ecografía (renal, vesical, prostática, abdominal, transrectal), tomografía, resonancia, urografía, uroflujometría, cistoscopia. Capta tamaños (próstata X cc, riñón X cm), ecogenicidad, lesiones, dilatación, residuo postmiccional, flujo máximo (Qmax), volumen miccional, etc.

3. Otros estudios: biopsia, citología, anatomopatología.

REGLA: Si en la transcripción aparece CUALQUIER valor numérico con unidad médica, nombre de un examen, o frase tipo "la ecografía reporta…", "el laboratorio muestra…", "la creatinina está en…", "el PSA es de…" → ES OBLIGATORIO incluirlo en la sección "Exámenes:". No lo omitas. Whisper a veces transcribe cifras como palabras ("uno coma dos" en vez de "1.2") — interprétalas como números cuando sea claro.

FORMATO OBLIGATORIO DE CADA EXAMEN (sin lenguaje narrativo — prohibido "mostró", "se encontró", "reveló", "evidenció", "reportó"):

Laboratorios — una variable por línea, solo valor y unidad:
  - PSA total: <valor> ng/mL
  - PSA libre: <valor> ng/mL  (índice libre/total: <valor>%)
  - Creatinina: <valor> mg/dL
  - Glicemia: <valor> mg/dL
  - Hemoglobina: <valor> g/dL
  (igual para cualquier otro laboratorio dictado)

Uroflujometría — en una sola línea:
  - Uroflujometría: Qmax <valor> mL/s[, vol. miccional <valor> mL si fue dictado]

Ecografía vesicoprostática o renal — en una sola línea con abreviaciones estándar:
  - Eco: vol. premicc. <valor> mL, residuo postmicc. <valor> mL (<X.X>% del premicc.), próstata <valor> gr
  (Si algún dato no fue dictado, omitirlo de la línea; no inventarlo)

Resonancia / Tomografía:
  - RM/TAC: <hallazgo dictado exacto>

Urocultivo / examen de orina:
  - Urocultivo: <resultado>
  - Examen de orina: <hallazgos>

Cómo procesar la conversación:

═══════════════════════════════════════════════════════════════
PRINCIPIO DE EXHAUSTIVIDAD CLÍNICA
═══════════════════════════════════════════════════════════════
Tu sesgo por defecto es CONSERVAR información clínica, no eliminarla. La nota debe ser tan larga como necesite serlo para reflejar todo lo que el paciente y el médico dijeron sobre el caso. Mejor una nota detallada que una nota corta que pierda datos útiles.

Solo eliminas charla NO clínica (saludos, comentarios sobre el clima, familia, agradecimientos, despedidas, muletillas, ruido). TODO lo demás que aporte al caso se conserva, aunque parezca menor: una molestia ocasional, un síntoma que el paciente minimizó, una dosis previa, una marca de medicamento, una hora del día en que aparece el síntoma, una observación sobre el estilo de vida — todo va a la nota si tiene relación con el caso.

NO resumas, NO condenses, NO simplifiques con sinónimos genéricos. Si el paciente dijo "me levanto 4 veces en la noche y dos de esas no logro llegar al baño", la nota dice eso, no "nicturia con incontinencia ocasional".
═══════════════════════════════════════════════════════════════

- Las preguntas del médico son sólo guía para identificar qué dato extraer; NO las incluyas en la nota.
- Las respuestas del paciente son la fuente principal — extrae TODA la información clínica relevante, incluso si parece menor.
- IMPORTANTE — NO sobre-filtres. Conserva todos estos datos cuando aparezcan:
    · Tiempo de evolución de cada síntoma (días, meses, años).
    · Características de los síntomas (intensidad, frecuencia, factores que mejoran/empeoran, irradiación, ritmo nocturno/diurno).
    · Cifras y números mencionados aunque parezcan irrelevantes (frecuencia miccional, número de episodios, dosis previas).
    · Tratamientos previos para el problema actual y respuesta a ellos.
    · Antecedentes familiares relevantes (cáncer de próstata, litiasis, etc.) si se mencionan.
    · Hábitos relevantes (consumo de alcohol, ejercicio, dieta, ingesta de líquidos) si se mencionan.
    · Historia sexual y de fertilidad en consulta urológica si se mencionan.
    · Síntomas asociados que el paciente menciona aunque no sean el motivo principal.
    · Comorbilidades y medicación actual con dosis exactas.
- Cuando el médico DICTA hallazgos (ej. "tacto rectal con próstata grado 2", "ecografía reporta riñones de tamaño normal", o cualquier valor de laboratorio o imagen que aparezca EN LA TRANSCRIPCIÓN ACTUAL), trátalo como dato clínico verídico y agrégalo en la sección correspondiente (examen físico o exámenes). Recuerda: solo los datos que efectivamente aparecen en la transcripción de hoy.
- Sólo IGNORA: saludos, despedidas, charla casual no clínica ("¿cómo está su familia?", "qué clima"), agradecimientos, chistes, interrupciones, ruido, muletillas ("ehhh", "este…"), aclaraciones procedimentales del médico ("ahora le voy a tomar la presión"), repeticiones literales de la misma información.
- Cuando el paciente describe síntomas en lenguaje coloquial, tradúcelos a terminología médica estándar:
    · "me arde al orinar" → "disuria"
    · "voy mucho al baño en la noche" → "nicturia"
    · "no me sale bien el chorro" → "disminución del calibre miccional" o "dificultad miccional"
    · "ganas de orinar urgente" → "urgencia miccional"
    · "se me sale la orina" → "incontinencia urinaria"
    · "presión en la barriga baja" → "molestia suprapúbica"
- Sintetiza SOLO cuando el paciente repite LITERALMENTE la misma información en distintos momentos: intégrala en una sola frase sin perder ningún detalle. Si el paciente da matices o detalles distintos en cada mención, conserva ambos.
- En caso de duda entre conservar o eliminar un dato → CONSÉRVALO. La nota es para uso médico; perder un detalle puede cambiar la conducta clínica.

CÁLCULO AUTOMÁTICO DE RESIDUO POSTMICCIONAL:
SOLO cuando AMBOS valores aparezcan EXPLÍCITAMENTE en la transcripción real (volumen premiccional Y volumen postmiccional dictados por el médico) — calcula el porcentaje que representa el postmiccional respecto al premiccional usando la fórmula:
    porcentaje = (postmiccional / premiccional) × 100
Redondea a un decimal y agrega el resultado entre paréntesis junto al postmiccional.

Ejemplo ilustrativo (NO copies estos valores):
  Si la transcripción dijera "premiccional 350 mL, postmiccional 80 mL" → la salida sería "premiccional 350 mL, postmiccional 80 mL (22.9% del premiccional)".

Si sólo se menciona el postmiccional sin el premiccional, NO inventes el premiccional ni el cálculo — sólo registra el valor tal como se dictó.
Si no se mencionó ninguno de los dos, omite la sección.

Reglas estrictas:
- Devuelve SOLO el texto final con los saltos de línea (\n) entre secciones tal como se indica en el formato. Sin encabezados extras, sin comillas alrededor, sin markdown (nada de **negritas** ni #), sin meta-comentarios.
- Cada etiqueta de sección (Antecedentes médicos:, Alergias a medicamentos:, etc.) va al inicio de su propia línea.
- Los hallazgos de "Exámenes:" van uno por línea, cada uno empezando con un guion y un espacio ("- ").
- Usa español médico claro y conciso.
- RECORDATORIO REGLA #0: NO inventes datos. Si un campo no se mencionó en la conversación, OMÍTELO completamente de la nota. NUNCA escribas "no consigna", "no refiere", "no se especifica", "sin datos" ni frases similares de relleno. Para los campos de antecedentes del Formato A (médicos, alergias, quirúrgicos, tabaquismo), escribe "niega" SOLO si el paciente lo dijo explícitamente; si no se mencionó, omite el campo.
- Si no se realizó examen físico, omite esa oración.
- Si no se dictaron exámenes, omite la sección "Exámenes:" entera. NO la rellenes con valores "típicos" ni con los ejemplos del prompt.
- Si no se indicó plan, omite la oración del plan. NO inventes tratamientos ni estudios solicitados.
- Respeta nombres exactos de medicamentos, dosis, marcas, cifras y unidades tal cual se mencionaron en la transcripción real.
- Si la transcripción es muy ruidosa o incompleta para un campo, OMITE ese campo. Nunca uses "no consigna" como relleno.

═══════════════════════════════════════════════════════════════
VERIFICACIÓN FINAL — Antes de devolver tu respuesta:
1. ¿La primera línea es exactamente "### FORMATO: A" o "### FORMATO: B"? Si no, agrégala.
2. Si es FORMATO A: ¿escribiste la edad del paciente en la apertura? Si el médico la dictó y no aparece, agrégala.
3. ¿Contaste los exámenes dictados por el médico en la transcripción y los comparaste con el número de líneas de "Exámenes:"? Si faltan, agrégalos.
4. Por cada valor numérico, medicamento, dosis o conducta que escribiste → debe estar respaldado por algo del médico en la transcripción. Si NO lo está, BÓRRALA. (Excepción: si el médico dictó un examen y la transcripción está ruidosa pero claramente lo nombró, conserva el examen.)
5. Si todo está bien → devuelve la nota.
═══════════════════════════════════════════════════════════════`;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'OPENAI_API_KEY no configurada' });
    }

    const auth = await authenticate(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    let body;
    try { body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); }
    catch { return res.status(400).json({ error: 'JSON inválido' }); }

    const transcript = (body.transcript || '').trim();
    if (!transcript) return res.status(400).json({ error: 'Falta transcript' });

    try {
        const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                temperature: 0,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: `Transcripción de la entrevista:\n\n${transcript}` }
                ]
            })
        });
        const data = await upstream.json();
        if (!upstream.ok) {
            return res.status(upstream.status).json({ error: data.error?.message || 'Error de OpenAI' });
        }
        const rawNote = data.choices?.[0]?.message?.content?.trim() || '';
        const note = sanitizeNote(rawNote, transcript);
        return res.status(200).json({ note });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}

// Guardrail determinístico:
// 1) Lee el marcador "### FORMATO: A|B" que el modelo emite en la primera
//    línea y lo usa como fuente de verdad para el formato.
// 2) Si el marcador falta (modelo lo ignoró), usa el regex tolerante como
//    fallback. Si la clasificación queda ambigua, NO destruye datos.
// 3) Limpia placeholders ("no consigna", "[edad]", "edad no especificada").
// 4) En Formato B, retira secciones de antecedentes solo si la clasificación
//    es de alta confianza (marcador explícito o regex que matchea control sin
//    señal de primera vez).
//
// Filosofía: ante la duda, conservar datos. Es uso médico — perder edad o
// antecedentes es mucho más grave que dejar una nota un poco redundante.
function sanitizeNote(note, transcript) {
    if (!note) return note;

    // Paso 0: parsear el marcador explícito (### FORMATO: A|B) y removerlo.
    let formatFromMarker = null;
    const markerRe = /^\s*###\s*FORMATO:\s*([AB])\s*$/im;
    const markerMatch = note.match(markerRe);
    if (markerMatch) {
        formatFromMarker = markerMatch[1].toUpperCase();
        note = note.replace(markerRe, '').replace(/^\s*\n+/, '');
    }

    // Clasificación por regex tolerante sobre la transcripción.
    const triggers = detectFormatTriggers(transcript);

    // Decisión final del formato:
    // - Si el modelo emitió marcador → confía en eso.
    // - Si no, usa la detección por regex.
    // - Si ambos no dan info y la nota empieza con "Se trata de paciente" →
    //   confía en el modelo y trata como A (no destruir datos).
    let format;
    if (formatFromMarker) {
        format = formatFromMarker;
        if (format === 'B' && !triggers.control && triggers.comprehensiveHistory) {
            // El modelo marcó B, pero el médico no dijo ninguna palabra de
            // control explícita Y sí se levantó historia clínica completa
            // (familiares + comorbilidades + alergias + quirúrgicos +
            // tabaquismo). Eso es evidencia fuerte de primera consulta mal
            // clasificada por el modelo. No confiamos ciegamente en el
            // marcador: corregimos a A para no destruir antecedentes que el
            // modelo sí haya escrito en la nota.
            format = 'A';
        }
    } else if (triggers.firstVisit) {
        format = 'A';
    } else if (triggers.comprehensiveHistory && !triggers.control) {
        format = 'A';
    } else if (triggers.control) {
        format = 'B';
    } else if (/^\s*se trata de paciente/i.test(note)) {
        // El modelo decidió Formato A sin marcador y sin gatillo explícito —
        // probablemente Whisper deformó la frase. Lo respetamos en vez de
        // destruir la nota.
        format = 'A';
    } else {
        format = 'B';
    }

    const tNorm = transcript.toLowerCase();
    const lines = note.split('\n');
    const cleaned = [];
    let firstLineDropped = false;

    for (let line of lines) {
        const lower = line.toLowerCase().trim();

        // Lineas vacías se preservan tal cual.
        if (!lower) { cleaned.push(line); continue; }

        // 1) Líneas con "no consigna" / placeholders genéricos → drop.
        if (/\bno\s+consigna\b/i.test(lower)) {
            if (/^se trata de paciente/i.test(lower)) firstLineDropped = true;
            continue;
        }
        if (/^se trata de paciente de\s+(no\s+(especificad|determinad)|edad\s+no|sin\s+(edad|datos))/i.test(lower)) {
            firstLineDropped = true;
            continue;
        }
        if (/^se trata de paciente de\s+\[/i.test(lower)) { firstLineDropped = true; continue; }

        // 2) En Formato B (de alta confianza): bloquear apertura de A y
        //    secciones de antecedentes. NO se aplica en clasificación ambigua.
        if (format === 'B') {
            if (/^se trata de paciente/i.test(lower)) { firstLineDropped = true; continue; }
            if (/^antecedentes m[eé]dicos?:/i.test(lower)) continue;
            if (/^alergia(s)?( a f[aá]rmacos?| a medicamentos?)?:/i.test(lower)) continue;
            if (/^antecedentes quir[uú]rgicos?:/i.test(lower)) continue;
            if (/^tabaquismo:/i.test(lower)) continue;
        } else {
            // 3) En Formato A: solo retirar antecedentes "niega" si la
            //    transcripción no menciona ese tema. Si dice cualquier cosa
            //    sobre antecedentes (aunque sea negarlos), CONSERVAR.
            if (/^antecedentes m[eé]dicos?:\s*niega\.?$/i.test(line) && !hasMedicalHistoryMention(tNorm)) continue;
            if (/^alergia(s)?( a f[aá]rmacos?| a medicamentos?)?:\s*niega\.?$/i.test(line) && !hasAllergyMention(tNorm)) continue;
            if (/^antecedentes quir[uú]rgicos?:\s*niega\.?$/i.test(line) && !hasSurgeryMention(tNorm)) continue;
            if (/^tabaquismo:\s*niega\.?$/i.test(line) && !hasSmokingMention(tNorm)) continue;
        }

        // 4) Limpieza dentro de la oración (fragmentos sueltos de placeholders).
        // OJO: "no refiere" NO va en esta lista — es una negación clínica
        // legítima y frecuente ("No refiere otros síntomas asociados..."),
        // no un placeholder. Quitarla partía oraciones reales a la mitad.
        line = line
            .replace(/\s*,?\s*pero\s+no\s+consigna\b/gi, '')
            .replace(/\bno\s+(consigna|especifica|determina)\b/gi, '')
            .replace(/\s{2,}/g, ' ')
            .replace(/\s+\./g, '.')
            .replace(/\(\s*\)/g, '')
            .trim();

        if (line) cleaned.push(line);
    }

    // 5) Si quitamos la apertura de A en modo B y no quedó apertura, anteponer
    //    apertura neutral. Solo si la clasificación B es de confianza.
    let result = cleaned.join('\n').trim();
    const hasOpening = /^(se trata de paciente|paciente acude)/i.test(result);
    if (format === 'B' && firstLineDropped && !hasOpening) {
        result = 'Paciente acude a consulta de control.\n' + result;
    }

    return result.replace(/\n{3,}/g, '\n\n').trim();
}

// Detecta gatillos de clasificación en la transcripción con regex amplios.
// Si encuentra señal de primera vez O de control, las marca. Las dos pueden
// ser true si Whisper deformó algo — la del médico (primera vez si la dijo)
// gana en la lógica de arriba.
function detectFormatTriggers(transcript) {
    const t = transcript.toLowerCase();
    // Primera vez — variantes amplias incluyendo errores típicos de Whisper
    // ("primer consulta" sin 'a', "primer ave" en lugar de "primera vez", etc.).
    const firstVisit =
        /\b(primer(a|o)?\s+(vez|consulta|evaluaci[oó]n|visita|atenci[oó]n|encuentro|atencion|atendiendo))\b/i.test(t)
        || /\b(paciente\s+(nuev[oa]|que\s+viene\s+por\s+primera))\b/i.test(t)
        || /\b(consulta\s+por\s+primera\s+vez)\b/i.test(t)
        || /\b(viene\s+por\s+primera\s+vez)\b/i.test(t)
        || /\b(nunca\s+(antes|ha(b[ií]a)?\s+(sido\s+evaluad|venido)))/i.test(t)
        || /\b(no\s+hab[ií]a\s+(sido|venido|consultado))\b/i.test(t)
        || /\b(es\s+nuev[oa]\s+(en\s+la\s+consulta|paciente))\b/i.test(t);
    // Control / seguimiento — variantes amplias. "Contrato" se incluye como
    // alias porque Whisper a veces confunde "control" con "contrato" por
    // similitud fonética (ver caso real: "no me hago un control" → "no sé
    // nada del contrato").
    const control =
        /\b(consulta\s+de\s+(control|contrato))\b/i.test(t)
        // "control de"/"contrato de" (orden invertido) sólo cuenta si NO está
        // negado justo antes ("nunca control de", "no me hago un contrato
        // de" → el paciente dice que NUNCA se ha hecho un control, lo
        // contrario de un gatillo de control).
        || /(?<!\b(?:no|nunca|jam[aá]s|ning[uú]n|ninguna)\s{1,3})\b(control|contrato)\s+de\b/i.test(t)
        || /\b(de|en|a)\s+(control|contrato)\b/i.test(t)
        || /\b(seguimiento|consulta\s+de\s+seguimiento)\b/i.test(t)
        || /\b(paciente\s+(conocid[oa]|en\s+seguimiento))\b/i.test(t)
        || /\b(evaluad[oa]\s+previamente|ya\s+(habia|hab[ií]a)\s+(consultad|venid))\b/i.test(t)
        || /\b(traje\s+los\s+ex[aá]menes|ya\s+(estoy\s+tomando|sigo\s+con\s+el\s+tratamiento))\b/i.test(t);
    // Señal estructural: toma de historia clínica completa. Un control NO
    // vuelve a levantar antecedentes familiares + comorbilidades + alergias +
    // quirúrgicos + tabaquismo — eso solo pasa en primera consulta, aunque el
    // médico nunca diga la frase "primera vez" en voz alta.
    const historyCategoriesHit = [
        hasFamilyHistoryMention(t),
        hasMedicalHistoryMention(t),
        hasAllergyMention(t),
        hasSurgeryMention(t),
        hasSmokingMention(t)
    ].filter(Boolean).length;
    const comprehensiveHistory = historyCategoriesHit >= 3;
    return { firstVisit, control, comprehensiveHistory };
}

function hasFamilyHistoryMention(t) {
    return /\b(familia|abuel|padre|madre|pap[aá]|mam[aá]|herman|antecedente\s+familiar)/i.test(t);
}
function hasMedicalHistoryMention(t) {
    return /\b(diabetes|hipertensi|presi[oó]n alta|colesterol|tiroid|asma|epoc|cardiac|coraz[oó]n|c[aá]ncer|tumor|enfermedad|cr[oó]nic|antecedent|padec)/i.test(t);
}
function hasAllergyMention(t) {
    return /\b(alergi|al[eé]rgic|alergic)/i.test(t);
}
function hasSurgeryMention(t) {
    return /\b(operad|operaci[oó]n|cirug|quir[uú]rgic|interven|prostatect|nefrect|colecist|apendi|hernia|biopsia)/i.test(t);
}
function hasSmokingMention(t) {
    return /\b(fum|tabaq|cigarr|nicotin|tabaco)/i.test(t);
}

// Exportar funciones internas para tests.
export { sanitizeNote, detectFormatTriggers };
