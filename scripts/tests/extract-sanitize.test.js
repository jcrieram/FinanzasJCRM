// scripts/tests/extract-sanitize.test.js
//
// Tests del guardrail determinístico de api/extract.js. Cubre los 4 bugs
// reportados por el doctor (jun 2026):
//   1. No separa primera vez vs control aunque se diga.
//   2. No anota la edad del paciente.
//   3. No registra todos los exámenes dictados.
//   4. Deja la consulta incompleta (sin antecedentes en Formato A).
//
// Corre con: node scripts/tests/extract-sanitize.test.js
//
// (No usa framework de tests — un assert simple. Suficiente para tests
// unitarios de una función determinística.)

import { sanitizeNote, detectFormatTriggers } from '../../api/extract.js';

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nGRUPO 1: clasificación por gatillos amplios');
// ─────────────────────────────────────────────────────────────────────────────

const firstVisitPhrases = [
    'Es la primera vez que veo a este paciente.',
    'Paciente que viene por primera consulta.',
    'Esta es una primera evaluación urológica.',
    'Es su primera visita.',
    'Paciente nuevo de 65 años.',
    'Paciente nueva con cuadro de cistitis.',
    'Es nuevo en la consulta, vamos a tomar antecedentes completos.',
    'Nunca antes había venido a urología.',
    'No había sido evaluado por urólogo.',
    'Vamos a hacer la primera atención del paciente.',
    // Errores típicos de Whisper:
    'Es primer consulta.',
    'Es primer evaluación urológica.'
];
firstVisitPhrases.forEach(p => {
    const t = detectFormatTriggers(p);
    check(`firstVisit detecta: "${p}"`, t.firstVisit);
});

const controlPhrases = [
    'Paciente viene a control de su HPB.',
    'Es una consulta de control.',
    'Paciente conocido con antecedente de litiasis.',
    'Vengo a control doctor.',
    'Ya estoy tomando la tamsulosina como me indicó.',
    'Traje los exámenes que me pidió.',
    'Paciente en seguimiento.'
];
controlPhrases.forEach(p => {
    const t = detectFormatTriggers(p);
    check(`control detecta: "${p}"`, t.control);
});

// Casos negativos.
const ambiguous = ['Paciente con dolor lumbar.', 'Hola doctor, cómo está.'];
ambiguous.forEach(p => {
    const t = detectFormatTriggers(p);
    check(`ambiguo no marca primera vez: "${p}"`, !t.firstVisit);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nGRUPO 2: marcador del modelo manda');
// ─────────────────────────────────────────────────────────────────────────────

{
    // Modelo dice A pero la transcripción no tiene gatillo evidente. Antes el
    // sanitizer destruía la edad y los antecedentes; ahora confía en el marcador.
    const note = `### FORMATO: A
Se trata de paciente de 65 años, quien consulta por nicturia 3-4 episodios.
Antecedentes médicos: hipertensión arterial.
Tabaquismo: 10 cig/día por 30 años.`;
    const transcript = 'tiene 65 años con hipertensión y fuma 10 cigarros al día y se levanta varias veces en la noche';
    const out = sanitizeNote(note, transcript);
    check('Marcador A conserva edad', out.includes('65 años'));
    check('Marcador A conserva antecedentes médicos', /Antecedentes m[eé]dicos:/i.test(out));
    check('Marcador A conserva tabaquismo', /Tabaquismo:/i.test(out));
    check('Marcador NO aparece en la salida', !out.includes('### FORMATO'));
}

{
    // Modelo dice B explícitamente → debe limpiar antecedentes que el modelo
    // generó por error.
    const note = `### FORMATO: B
Paciente acude a consulta de control de su HPB. Refiere mejoría con tamsulosina.
Antecedentes médicos: hipertensión.
Tabaquismo: 10 cig/día.`;
    const transcript = 'paciente viene a control de su HPB, está mejor con la tamsulosina';
    const out = sanitizeNote(note, transcript);
    check('Marcador B remueve antecedentes médicos', !/Antecedentes m[eé]dicos:/i.test(out));
    check('Marcador B remueve tabaquismo', !/^Tabaquismo:/im.test(out));
    check('Marcador B conserva apertura de control', /Paciente acude a consulta de control/i.test(out));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nGRUPO 3: BUG REPORTADO — no destruir datos si la clasificación es ambigua');
// ─────────────────────────────────────────────────────────────────────────────

{
    // Caso real del bug: el doctor dijo "primera vez" pero Whisper lo deformó
    // a "primer vez" (sin 'a'). Antes del fix: sanitizer fuerza B, borra edad
    // y antecedentes. Después del fix: el regex amplio matchea "primer vez",
    // se respeta Formato A.
    const note = `### FORMATO: A
Se trata de paciente de 70 años, quien consulta por disuria.
Antecedentes médicos: diabetes mellitus tipo 2.
Tabaquismo: niega.
Exámenes:
- PSA total: 3.5 ng/mL
- Creatinina: 0.9 mg/dL`;
    const transcript = 'es la primer vez que veo a este paciente de 70 años con disuria, es diabético, no fuma, PSA 3.5 y creatinina 0.9';
    const out = sanitizeNote(note, transcript);
    check('Whisper deformó "primera vez" → la edad se conserva', out.includes('70 años'));
    check('Whisper deformó "primera vez" → diabetes se conserva', /diabetes/i.test(out));
    check('Whisper deformó "primera vez" → exámenes se conservan', out.includes('PSA total: 3.5 ng/mL'));
}

{
    // Doctor dictó "primera visita" — el regex viejo no lo capturaba.
    const note = `### FORMATO: A
Se trata de paciente de 58 años, quien consulta por hematuria.
Exámenes:
- Examen de orina: leucocitos 25 por campo
- Urocultivo: pendiente`;
    const transcript = 'es la primera visita del paciente, tiene 58 años, viene por hematuria, en el examen de orina hay 25 leucos por campo, el urocultivo está pendiente';
    const out = sanitizeNote(note, transcript);
    check('"primera visita" → edad conservada', out.includes('58 años'));
    check('"primera visita" → todos los exámenes conservados',
        out.includes('Examen de orina') && out.includes('Urocultivo'));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nGRUPO 4: fallback sin marcador');
// ─────────────────────────────────────────────────────────────────────────────

{
    // Modelo olvidó el marcador (regresión). El sanitizer NO debe ser
    // destructivo: si la nota empieza con "Se trata de paciente", asume A.
    const note = `Se trata de paciente de 72 años, quien consulta por nicturia 4 episodios.
Antecedentes médicos: HTA en tratamiento.
Exámenes:
- PSA total: 8.2 ng/mL`;
    const transcript = 'tengo aquí a un paciente de 72 años con nicturia de 4 episodios, hipertenso en tratamiento, PSA 8.2';
    const out = sanitizeNote(note, transcript);
    check('Sin marcador, apertura A → respeta A (no destruye edad)', out.includes('72 años'));
    check('Sin marcador, apertura A → respeta antecedentes', /Antecedentes m[eé]dicos:/i.test(out));
    check('Sin marcador, apertura A → respeta exámenes', out.includes('PSA total'));
}

{
    // Modelo olvidó marcador y arrancó con "Paciente acude a control".
    // El sanitizer debe respetar B y no agregar apertura extra.
    const note = `Paciente acude a consulta de control de su HPB. Refiere mejoría.
Exámenes:
- Uroflujometría: Qmax 15 mL/s`;
    const transcript = 'paciente viene a control de HPB, mejor';
    const out = sanitizeNote(note, transcript);
    check('Sin marcador, apertura B → mantiene B', out.startsWith('Paciente acude'));
    check('Sin marcador, apertura B → NO duplica la apertura',
        out.split('Paciente acude').length === 2);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nGRUPO 5: limpieza de placeholders (regresión)');
// ─────────────────────────────────────────────────────────────────────────────

{
    const note = `### FORMATO: A
Se trata de paciente de [edad no especificada] años, quien consulta por nicturia.
Antecedentes médicos: no consigna.
Tabaquismo: niega.`;
    const transcript = 'paciente con nicturia, no fuma, primera vez';
    const out = sanitizeNote(note, transcript);
    check('Drop línea con "[edad no especificada]"', !out.includes('[edad'));
    check('Drop línea con "no consigna"', !out.toLowerCase().includes('no consigna'));
    check('Mantiene Tabaquismo: niega (mencionado)', /Tabaquismo:\s*niega/i.test(out));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass}/${pass + fail} pasaron\x1b[0m`);
process.exit(fail === 0 ? 0 : 1);
