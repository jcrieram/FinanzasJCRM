// Datos compartidos entre el frontend y los endpoints de InformesUro.
// Códigos FONASA, ayudantes, anestesia, clínicas, contactos, insumos HoLEP
// y catálogo de medicamentos urológicos comunes.

export const MEDICO = {
    nombre: 'Dr. Juan Carlos Riera M.',
    rut: '25.279.729-7',
    cm: 'CM 42316-0',
    especialidad: 'Especialista en Urología',
    ubicacion: 'V Región, Chile'
};

export const CLINIC_LOGOS = {
    'Hospital Clínico Viña del Mar': 'logo_hospital_clinico.jpg',
    'Aquamed': 'logo_aquamed.jpg',
    'Clínica Provincia de Petorca': 'logo_petorca.webp',
    'Clínica Los Carrera': 'logo_los_carrera.png',
    'Redsalud': 'logo_redsalud.jpg',
    'Clínica Miraflores': 'logo_miraflores.png'
};

export const CLINIC_LIST = Object.keys(CLINIC_LOGOS);

// Coordinación quirúrgica por clínica (igual que el config original).
export const COORDINADORES = {
    'Clínica Miraflores':  { nombre: 'Viviana Moreno',  telefono: '+56 9 7779 3590' },
    'Clínica Los Carrera': { nombre: 'Patricia Cruces', telefono: '+56 9 6149 5450' }
};

export const AYUDANTES = ['— Sin ayudante —', 'Fernando Guerra', 'Laura Ordóñez'];

export const ANESTESIA = ['General', 'Regional', 'Espinal', 'Sedación', 'Local'];

// HoLEP requiere ambos códigos.
export const HOLEP_COD1 = '19 02 055';
export const HOLEP_COD2 = '19 02 031';

// Insumos sugeridos para HoLEP (autocompleta el campo, el médico edita libre).
export const HOLEP_INSUMOS = [
    'Resectoscopio HoLEP',
    'Fibras láser holmium (550-600 µm)',
    'Morcelador prostático'
].join('\n');

// Previsiones de salud chilenas para el formulario de Solicitud de Cirugía.
export const PREVISIONES = [
    'Fonasa',
    'Isapre Banmédica',
    'Isapre Colmena',
    'Isapre Consalud',
    'Isapre Cruz Blanca',
    'Isapre Vida Tres',
    'Isapre Nueva Masvida',
    'Esencial',
    'Particular',
    'Otra'
];

export const FONASA_CODES = [
    // ENDOSCOPÍA / EXPLORACIÓN
    { codigo: '19 01 001', nombre: 'Exploración de uretra con bujía/explorador/sonda/beniqué/medición residuo vesical', categoria: 'Endoscopía / Exploración' },
    { codigo: '19 01 002', nombre: 'Cistoscopía con o sin sondeo ureteral, con o sin biopsia', categoria: 'Endoscopía / Exploración' },
    { codigo: '19 01 003', nombre: 'Cistoscopia / uretrocistoscopia / uretroscopia (proc. aut.)', categoria: 'Endoscopía / Exploración' },
    { codigo: '19 01 004', nombre: 'Ureteronefroscopia', categoria: 'Endoscopía / Exploración' },
    { codigo: '19 01 005', nombre: 'Biopsia prostática transrectal o transperineal con apoyo ecográfico', categoria: 'Endoscopía / Exploración' },
    // RIÑÓN
    { codigo: '19 02 005', nombre: 'Litiasis renal, tratamiento quirúrgico percutáneo c/s ultrasonido', categoria: 'Riñón' },
    { codigo: '19 02 006', nombre: 'Litiasis renal o ureteral por cirugía abierta o laparoscópica', categoria: 'Riñón' },
    { codigo: '19 02 008', nombre: 'Lumbotomía exploradora c/s drenaje, c/s biopsia', categoria: 'Riñón' },
    { codigo: '19 02 009', nombre: 'Nefrectomía parcial, cualquier vía y técnica', categoria: 'Riñón' },
    { codigo: '19 02 010', nombre: 'Nefrectomía radical por cáncer renal, vía abierta, laparoscópica o robótica', categoria: 'Riñón' },
    { codigo: '19 02 011', nombre: 'Nefrectomía por patología benigna o malformación', categoria: 'Riñón' },
    { codigo: '19 02 012', nombre: 'Drenaje percutáneo o endoscópico de hidronefrosis', categoria: 'Riñón' },
    { codigo: '19 02 013', nombre: 'Pielotomía exploradora y/o terapéutica (incluye pielostomía y/o pieloplastía)', categoria: 'Riñón' },
    { codigo: '19 02 015', nombre: 'Suprarrenalectomía unilateral', categoria: 'Riñón' },
    { codigo: '19 02 090', nombre: 'Litiasis urinaria por litotripsia extracorpórea (LEOC)', categoria: 'Riñón' },
    // URÉTER
    { codigo: '19 02 016', nombre: 'Anastomosis de los uréteres', categoria: 'Uréter' },
    { codigo: '19 02 017', nombre: 'Fístula urétero-vaginal, tratamiento quirúrgico', categoria: 'Uréter' },
    { codigo: '19 02 018', nombre: 'Nefroureterectomía en patología tumoral o malformación, cualquier vía', categoria: 'Uréter' },
    { codigo: '19 02 019', nombre: 'Ureterectomía', categoria: 'Uréter' },
    { codigo: '19 02 020', nombre: 'Urétero-litotomía abierta', categoria: 'Uréter' },
    { codigo: '19 02 021', nombre: 'Urétero o nefro-litotomía endoscópica con ureteroscopia rígida o flexible', categoria: 'Uréter' },
    { codigo: '19 02 022', nombre: 'Ureterectomía / ureteroplastía / ureterorrafia / ureterolisis / transureteroanastomosis', categoria: 'Uréter' },
    { codigo: '19 02 023', nombre: 'Ureterorrafia y/o ureterolisis', categoria: 'Uréter' },
    { codigo: '19 02 024', nombre: 'Ureterostomía bilateral: vesical, cutánea o intestinal', categoria: 'Uréter' },
    { codigo: '19 02 025', nombre: 'Ureterostomía unilateral: vesical, cutánea o intestinal', categoria: 'Uréter' },
    // VEJIGA
    { codigo: '19 02 027', nombre: 'Cistectomía parcial y/o tratamiento quirúrgico de divertículo vesical', categoria: 'Vejiga' },
    { codigo: '19 02 028', nombre: 'Cistectomía radical, cualquier vía o técnica, incluye linfadenectomía', categoria: 'Vejiga' },
    { codigo: '19 02 029', nombre: 'Cistoplastía, proc. completo', categoria: 'Vejiga' },
    { codigo: '19 02 030', nombre: 'Reparación vesical por trauma', categoria: 'Vejiga' },
    { codigo: '19 02 031', nombre: 'Cistostomía / extracción litiasis / catéter suprapúbico, vía abierta o endoscópica', categoria: 'Vejiga' },
    { codigo: '19 02 033', nombre: 'Fístula vésico-cutánea / vaginal / intestinal, tratamiento quirúrgico', categoria: 'Vejiga' },
    { codigo: '19 02 034', nombre: 'Cirugía abierta o endoscópica de lesiones cuello vesical / hemovejiga', categoria: 'Vejiga' },
    { codigo: '19 02 037', nombre: 'Resección endoscópica de cáncer vesical (RTU vejiga)', categoria: 'Vejiga' },
    // URETRA
    { codigo: '19 02 043', nombre: 'Uretroplastía sin substitución / uretrorrafía', categoria: 'Uretra' },
    { codigo: '19 02 044', nombre: 'Uretroplastía de substitución, cada tiempo', categoria: 'Uretra' },
    { codigo: '19 02 045', nombre: 'Incontinencia urinaria de esfuerzo / DIE, cualquier vía, c/s mallas o esfínter artificial', categoria: 'Uretra' },
    { codigo: '19 02 049', nombre: 'Uretrectomía y/o plastia abierta de uretra por trauma, estenosis o cualquier etiología', categoria: 'Uretra' },
    { codigo: '19 02 052', nombre: 'Uretrotomía externa', categoria: 'Uretra' },
    { codigo: '19 02 053', nombre: 'Uretrotomía interna y/o uretrolitotomía', categoria: 'Uretra' },
    // PRÓSTATA
    { codigo: '19 02 055', nombre: 'Adenoma o cáncer prostático, resección endoscópica desobstructiva — HoLEP / RTU / láser', categoria: 'Próstata' },
    { codigo: '19 02 056', nombre: 'Adenoma prostático, tratamiento quirúrgico abierto', categoria: 'Próstata' },
    { codigo: '19 02 057', nombre: 'Prostatectomía radical por cáncer prostático, vía abierta, laparoscópica o robótica', categoria: 'Próstata' },
    // TESTÍCULO / ESCROTO
    { codigo: '19 02 059', nombre: 'Biopsia quirúrgica de testículo y/o aspiración epididimaria', categoria: 'Testículo / Escroto' },
    { codigo: '19 02 063', nombre: 'Hidatidectomía unilateral c/s eversión vaginal', categoria: 'Testículo / Escroto' },
    { codigo: '19 02 064', nombre: 'Hidrocele y/o hematocele, quistes cordón/epidídimo', categoria: 'Testículo / Escroto' },
    { codigo: '19 02 065', nombre: 'Orquidectomía unilateral', categoria: 'Testículo / Escroto' },
    { codigo: '19 02 066', nombre: 'Orquidopexia unilateral', categoria: 'Testículo / Escroto' },
    { codigo: '19 02 068', nombre: 'Orquidectomía ampliada por cáncer testicular', categoria: 'Testículo / Escroto' },
    { codigo: '19 02 074', nombre: 'Exploración escroto agudo', categoria: 'Testículo / Escroto' },
    { codigo: '19 02 075', nombre: 'Varicocele unilateral y/o denervación cordón espermático', categoria: 'Testículo / Escroto' },
    { codigo: '19 02 076', nombre: 'Vasectomía bilateral', categoria: 'Testículo / Escroto' },
    // PENE
    { codigo: '19 02 080', nombre: 'Biopsia de pene', categoria: 'Pene' },
    { codigo: '19 02 081', nombre: 'Cirugía del priapismo, cualquier vía o técnica', categoria: 'Pene' },
    { codigo: '19 02 082', nombre: 'Circuncisión (incluye frenillo, sinequias, incisión dorsal)', categoria: 'Pene' },
    { codigo: '19 02 083', nombre: 'Cirugía traumatismo peneano o curvaturas adquiridas de la albugínea', categoria: 'Pene' },
    { codigo: '19 02 085', nombre: 'Implantación prótesis peneana, cualquier tipo o vía', categoria: 'Pene' },
    // HERNIA
    { codigo: '18 02 001', nombre: 'Hernia abdominal por laparotomía (no incluye malla)', categoria: 'Hernia' },
    { codigo: '18 02 154', nombre: 'Hernia abdominal por acceso mininvasivo (no incluye malla)', categoria: 'Hernia' },
    // PIEL
    { codigo: '16 02 201', nombre: 'Biopsia de piel y/o mucosa por curetaje o sección tangencial c/s electro — 1 lesión', categoria: 'Piel / Lesiones cutáneas' },
    { codigo: '16 02 202', nombre: 'Extirpación/biopsia lesiones benignas cutáneas — cabeza, cuello, genitales hasta 3 lesiones', categoria: 'Piel / Lesiones cutáneas' },
    { codigo: '16 02 203', nombre: 'Extirpación/biopsia lesiones benignas cutáneas — resto del cuerpo hasta 3 lesiones', categoria: 'Piel / Lesiones cutáneas' },
    { codigo: '16 02 204', nombre: 'Extirpación/biopsia lesiones benignas cutáneas — cabeza, cuello, genitales 4 a 6 lesiones', categoria: 'Piel / Lesiones cutáneas' },
    { codigo: '16 02 205', nombre: 'Extirpación/biopsia lesiones benignas cutáneas — resto del cuerpo 4 a 6 lesiones', categoria: 'Piel / Lesiones cutáneas' }
];

// Catálogo personal del Dr. Juan Carlos Riera M.
// Cada item: { nombre, posologia, duracion_n, duracion_u }
// duracion_u ∈ { 'dias', 'semanas', 'meses', 'permanente', '' }
// Si duracion_u vacío y duracion_n vacío → la duración la define el médico al usar.
export const MEDICATIONS = {
    'HPB / LUTS — combinaciones': [
        { nombre: 'Prostop D 0,4/0,5 mg',         posologia: 'tomar 1 cápsula al día', duracion_n: '', duracion_u: 'permanente' },
        { nombre: 'Finaprost 0,4/0,5 mg',         posologia: 'tomar 1 cápsula al día', duracion_n: '', duracion_u: 'permanente' },
        { nombre: 'Gotely Duo 0,4/0,5 mg',        posologia: 'tomar 1 cápsula al día', duracion_n: '', duracion_u: 'permanente' },
        { nombre: 'Sulix Plus 0,4/6 mg',          posologia: 'tomar 1 comprimido al día', duracion_n: '', duracion_u: 'permanente' },
        { nombre: 'Gotely Soli 0,4/6 mg',         posologia: 'tomar 1 comprimido al día', duracion_n: '', duracion_u: 'permanente' }
    ],
    'HPB / LUTS — alfa bloqueadores': [
        { nombre: 'Sulix 0,4 mg',                 posologia: 'tomar 1 cápsula al día por la noche', duracion_n: '', duracion_u: 'permanente' },
        { nombre: 'Gotely 0,4 mg',                posologia: 'tomar 1 cápsula al día por la noche', duracion_n: '', duracion_u: 'permanente' }
    ],
    'Vejiga hiperactiva / espasmolíticos': [
        { nombre: 'Detrucalm 200 mg',             posologia: 'tomar 1 comprimido cada 8 horas', duracion_n: 7, duracion_u: 'dias' },
        { nombre: 'Bladuril 200 mg',              posologia: 'tomar 1 comprimido cada 8 horas', duracion_n: 7, duracion_u: 'dias' },
        { nombre: 'Eltoven 2 mg',                 posologia: 'tomar 1 comprimido al día', duracion_n: '', duracion_u: 'permanente' },
        { nombre: 'Urostop 2 mg',                 posologia: 'tomar 1 comprimido al día', duracion_n: '', duracion_u: 'permanente' },
        { nombre: 'Spasmex 30 mg',                posologia: 'tomar 1 comprimido cada 8 horas', duracion_n: '', duracion_u: 'permanente' },
        { nombre: 'Mictium 50 mg',                posologia: 'tomar 1 comprimido al día', duracion_n: '', duracion_u: 'permanente' },
        { nombre: 'Mestinon 60 mg',               posologia: 'tomar 1 comprimido cada 8 horas', duracion_n: '', duracion_u: 'permanente' },
        { nombre: 'Duloxetina 30 mg',             posologia: 'tomar 1 cápsula al día', duracion_n: '', duracion_u: 'permanente' }
    ],
    'Disfunción eréctil': [
        { nombre: 'Exim 5 mg',                    posologia: 'tomar 1 comprimido al día', duracion_n: '', duracion_u: 'permanente' },
        { nombre: 'Tadamax 5 mg',                 posologia: 'tomar 1 comprimido al día', duracion_n: '', duracion_u: 'permanente' },
        { nombre: 'Tadamax 20 mg',                posologia: 'tomar 1 comprimido 30 min antes de la actividad sexual', duracion_n: '', duracion_u: '' },
        { nombre: 'Bectam 20 mg',                 posologia: 'tomar 1 comprimido en la mañana', duracion_n: '', duracion_u: 'permanente' }
    ],
    'Antibióticos / ITU': [
        { nombre: 'Ciproval 500 mg',              posologia: 'tomar 1 comprimido cada 12 horas', duracion_n: 7,  duracion_u: 'dias' },
        { nombre: 'Azitromicina 500 mg',          posologia: 'tomar 1 comprimido al día', duracion_n: 3,  duracion_u: 'dias' },
        { nombre: 'Levoxin 750 mg',               posologia: 'tomar 1 comprimido al día', duracion_n: 7,  duracion_u: 'dias' },
        { nombre: 'Doxicilina 100 mg',            posologia: 'tomar 1 cápsula cada 12 horas', duracion_n: 10, duracion_u: 'dias' },
        { nombre: 'Nordox 200 mg',                posologia: 'tomar 1 cápsula al día', duracion_n: 10, duracion_u: 'dias' },
        { nombre: 'Cefadroxilo 500 mg',           posologia: 'tomar 1 cápsula cada 12 horas', duracion_n: 7,  duracion_u: 'dias' },
        { nombre: 'Cefirax 200 mg',               posologia: 'tomar 1 comprimido cada 12 horas', duracion_n: 7,  duracion_u: 'dias' },
        { nombre: 'Acecnou 3 gr',                 posologia: 'tomar 1 sobre disuelto en agua, dosis única', duracion_n: '', duracion_u: '' },
        { nombre: 'Macrosan 100 mg',              posologia: 'tomar 1 cápsula cada 12 horas', duracion_n: 7,  duracion_u: 'dias' }
    ],
    'Antifúngicos': [
        { nombre: 'Itrac 100 mg',                 posologia: 'tomar 1 cápsula al día', duracion_n: 7,  duracion_u: 'dias' },
        { nombre: 'Fluconazol 150 mg',            posologia: 'tomar 1 cápsula, dosis única', duracion_n: '', duracion_u: '' }
    ],
    'Tópicos': [
        { nombre: 'Donomix crema',                posologia: 'aplicar fina capa en zona afectada cada 12 horas', duracion_n: 7, duracion_u: 'dias' },
        { nombre: 'Canesten crema',               posologia: 'aplicar fina capa en zona afectada cada 12 horas', duracion_n: 7, duracion_u: 'dias' },
        { nombre: 'Mucivil crema',                posologia: 'aplicar fina capa en zona afectada cada 12 horas', duracion_n: 7, duracion_u: 'dias' },
        { nombre: 'Mupax ungüento',               posologia: 'aplicar fina capa en zona afectada cada 8 horas', duracion_n: 7, duracion_u: 'dias' }
    ],
    'Analgésicos / antiinflamatorios': [
        { nombre: 'Prolertus 140 mg',             posologia: 'tomar 1 comprimido cada 12 horas con alimentos', duracion_n: 5, duracion_u: 'dias' },
        { nombre: 'Promerpal 140 mg',             posologia: 'tomar 1 comprimido cada 12 horas con alimentos', duracion_n: 5, duracion_u: 'dias' },
        { nombre: 'Dolgenal SL 30 mg',            posologia: '1 comprimido sublingual cada 8 horas según dolor', duracion_n: 3, duracion_u: 'dias' },
        { nombre: 'Coxidol 120 mg',               posologia: 'tomar 1 comprimido al día con alimentos', duracion_n: 5, duracion_u: 'dias' },
        { nombre: 'Lertus RL 150 mg',             posologia: 'tomar 1 comprimido al día con alimentos', duracion_n: 5, duracion_u: 'dias' }
    ],
    'Hormonales': [
        { nombre: 'Sustenam 250 mg ampollas',     posologia: 'aplicar 1 ampolla intramuscular cada mes', duracion_n: '', duracion_u: 'permanente' },
        { nombre: 'Nebido 1000 mg ampollas',      posologia: 'aplicar 1 ampolla intramuscular cada 3 meses', duracion_n: '', duracion_u: 'permanente' }
    ],
    'Otros': [
        { nombre: 'Urifem',                       posologia: 'aplicar según indicación en zona genital', duracion_n: '', duracion_u: '' }
    ]
};

// Paquetes preconfigurados de exámenes de laboratorio / imagen.
export const EXAM_PACKAGES = {
    'Pre-quirúrgico': [
        'Hemograma',
        'PT y TTPK',
        'Creatinina',
        'Uremia',
        'Glicemia',
        'Grupo sanguíneo',
        'Electrocardiograma'
    ],
    'Estudio HPB': [
        'PSA total',
        'Orina completa',
        'Urocultivo',
        'Ecografía renal-vesical-prostática',
        'Uroflujometría',
        'Glicemia',
        'Creatinina'
    ],
    'Estudio Hematuria': [
        'Orina completa',
        'Urocultivo',
        'Citología urinaria',
        'Ecografía renal-vesical',
        'UroTAC'
    ],
    'Estudio Litiasis': [
        'Orina completa',
        'Urocultivo',
        'Función renal',
        'PieloTAC'
    ],
    'ITU Recurrente': [
        'Orina completa',
        'Urocultivo',
        'Cultivo clamidia',
        'Cultivo ureaplasma',
        'Cultivo micoplasma',
        'Cultivo vaginal',
        'Ecografía pélvica femenina',
        'Ecografía renal'
    ],
    'Disfunción Sexual': [
        'Testosterona total y libre',
        'Antígeno prostático específico (APE)',
        'Perfil hepático',
        'Perfil lipídico',
        'Perfil tiroideo (TSH, T3, T4)',
        'Orina completa',
        'Urocultivo',
        'Glicemia',
        'Hemoglobina glicosilada (HbA1c)',
        'Creatinina'
    ]
};

// Paquetes preconfigurados de estudios diagnósticos (procedimientos).
export const STUDY_PACKAGES = {
    'Cistoscopía': [
        'Cistoscopía rígida diagnóstica',
        'Toma de biopsia vesical en caso de hallazgos sospechosos'
    ],
    'Urodinamia': [
        'Estudio urodinámico completo',
        'Cistometría',
        'Flujo-presión',
        'EMG perineal',
        'Volumen residual postmiccional'
    ],
    'Biopsia prostática': [
        'Biopsia prostática transrectal con apoyo ecográfico',
        'Profilaxis antibiótica con ciprofloxacino',
        'Anatomía patológica de los cilindros obtenidos'
    ],
    'Uroflujometría': [
        'Uroflujometría libre',
        'Volumen miccional',
        'Volumen residual postmiccional por ecografía'
    ],
    'Estudio funcional vesical completo': [
        'Uroflujometría',
        'Volumen residual postmiccional',
        'Estudio urodinámico',
        'Cistoscopía diagnóstica'
    ]
};

// Cuerpo automático de epicrisis según el procedimiento.
export function generateEpicrisisBody({ edad, fechaCirugia, cod1, cod2, cod1Nombre, cod2Nombre }) {
    const f = fechaCirugia || '___';
    const e = (edad || '').replace(/\s*años?/i, '').trim() || '___';
    if (isHolep(cod1, cod2)) {
        return `Paciente de ${e} años quien fue llevado a pabellón el día ${f}, para realizar enucleación prostática con láser de holmio (HoLEP) con instalación de catéter vesical, con óptima evolución, procedimiento bien tolerado. Actualmente sin complicaciones y resultados esperados óptimos. Se indica control SOS y programado según se explica a paciente.`;
    }
    const proc = (cod2 && cod2Nombre)
        ? `${cod1Nombre} y ${cod2Nombre}`
        : (cod1Nombre || 'el procedimiento indicado');
    return `Paciente de ${e} años quien fue llevado a pabellón el día ${f}, para realizar ${proc} con óptima evolución, procedimiento bien tolerado. Actualmente sin complicaciones y resultados esperados óptimos. Se indica control SOS y programado según se explica a paciente.`;
}

// Construye la frase de duración a partir de número + unidad.
//   '' / ''        -> ''
//   '' / permanente -> 'permanente'
//   N / dias       -> 'por N días'
//   N / semanas    -> 'por N semanas'
//   N / meses      -> 'por N meses'
export function formatDuracion(n, u) {
    if (u === 'permanente') return 'permanente';
    if (!n || !u) return '';
    const map = { dias: 'días', semanas: 'semanas', meses: 'meses' };
    const word = map[u];
    if (!word) return '';
    return `por ${n} ${word}`;
}

export const FONASA_CATEGORIES = [...new Set(FONASA_CODES.map(c => c.categoria))];

export function findFonasa(codigo) {
    return FONASA_CODES.find(c => c.codigo === codigo) || null;
}

export function isHolep(cod1, cod2) {
    return (cod1 === HOLEP_COD1 && cod2 === HOLEP_COD2) ||
           (cod1 === HOLEP_COD2 && cod2 === HOLEP_COD1);
}
