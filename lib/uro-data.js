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
    'Morcelador prostático',
    'Suero fisiológico 0,9% (irrigación, 9000 mL aprox.)',
    'Sonda Foley 3 vías 22 Fr siliconada',
    'Bolsa colectora cerrada',
    'Caja instrumental urológico básico',
    'Solicitud de anatomía patológica para fragmentos prostáticos'
].join('\n');

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

// Catálogo preconfigurado de medicamentos urológicos comunes.
// Para cada uno: nombre, dosis típica, frecuencia, duración sugerida.
// El médico puede editar todo libremente.
export const MEDICATIONS = {
    'HPB / LUTS': [
        { nombre: 'Tamsulosina 0,4 mg', frecuencia: 'Cada 24 h, por la noche', duracion: 'Permanente' },
        { nombre: 'Doxazosina 4 mg', frecuencia: 'Cada 24 h, por la noche', duracion: 'Permanente' },
        { nombre: 'Alfuzosina 10 mg', frecuencia: 'Cada 24 h después de la cena', duracion: 'Permanente' },
        { nombre: 'Silodosina 8 mg', frecuencia: 'Cada 24 h con la comida principal', duracion: 'Permanente' },
        { nombre: 'Finasteride 5 mg', frecuencia: 'Cada 24 h', duracion: 'Permanente' },
        { nombre: 'Dutasteride 0,5 mg', frecuencia: 'Cada 24 h', duracion: 'Permanente' },
        { nombre: 'Dutasteride/Tamsulosina 0,5/0,4 mg', frecuencia: 'Cada 24 h', duracion: 'Permanente' },
        { nombre: 'Tadalafil 5 mg', frecuencia: 'Cada 24 h', duracion: 'Permanente' }
    ],
    'Disfunción eréctil': [
        { nombre: 'Sildenafil 50 mg', frecuencia: '30-60 min antes de actividad sexual', duracion: 'Según necesidad' },
        { nombre: 'Sildenafil 100 mg', frecuencia: '30-60 min antes de actividad sexual', duracion: 'Según necesidad' },
        { nombre: 'Tadalafil 20 mg', frecuencia: '30 min antes de actividad sexual', duracion: 'Según necesidad' },
        { nombre: 'Tadalafil 5 mg', frecuencia: 'Cada 24 h', duracion: 'Continuo' },
        { nombre: 'Vardenafil 20 mg', frecuencia: '30 min antes de actividad sexual', duracion: 'Según necesidad' },
        { nombre: 'Avanafil 100 mg', frecuencia: '15-30 min antes de actividad sexual', duracion: 'Según necesidad' }
    ],
    'Infección urinaria': [
        { nombre: 'Ciprofloxacino 500 mg', frecuencia: 'Cada 12 h', duracion: '7 días' },
        { nombre: 'Nitrofurantoína 100 mg', frecuencia: 'Cada 12 h', duracion: '7 días' },
        { nombre: 'Fosfomicina 3 g', frecuencia: 'Dosis única', duracion: 'Única dosis' },
        { nombre: 'Cefuroxima axetilo 500 mg', frecuencia: 'Cada 12 h', duracion: '7 días' },
        { nombre: 'Cefadroxilo 500 mg', frecuencia: 'Cada 12 h', duracion: '7 días' },
        { nombre: 'Trimetoprim/Sulfametoxazol 160/800 mg', frecuencia: 'Cada 12 h', duracion: '7 días' }
    ],
    'Vejiga hiperactiva': [
        { nombre: 'Oxibutinina 5 mg', frecuencia: 'Cada 12 h', duracion: 'Continuo' },
        { nombre: 'Solifenacina 5 mg', frecuencia: 'Cada 24 h', duracion: 'Continuo' },
        { nombre: 'Solifenacina 10 mg', frecuencia: 'Cada 24 h', duracion: 'Continuo' },
        { nombre: 'Tolterodina LP 4 mg', frecuencia: 'Cada 24 h', duracion: 'Continuo' },
        { nombre: 'Mirabegron 50 mg', frecuencia: 'Cada 24 h', duracion: 'Continuo' }
    ],
    'Cólico renal / Litiasis': [
        { nombre: 'Tamsulosina 0,4 mg', frecuencia: 'Cada 24 h, por la noche', duracion: 'Hasta expulsión del cálculo' },
        { nombre: 'Ketorolaco 30 mg IM', frecuencia: 'Cada 8 h SOS', duracion: '2-3 días' },
        { nombre: 'Diclofenaco 50 mg', frecuencia: 'Cada 8 h con alimentos', duracion: '5-7 días' },
        { nombre: 'Tramadol 50 mg', frecuencia: 'Cada 6-8 h SOS', duracion: 'Según dolor' }
    ],
    'Cáncer de próstata / hormonal': [
        { nombre: 'Bicalutamida 50 mg', frecuencia: 'Cada 24 h', duracion: 'Según indicación oncológica' },
        { nombre: 'Leuprolide 22,5 mg depot', frecuencia: 'Cada 3 meses IM', duracion: 'Según indicación' },
        { nombre: 'Goserelin 10,8 mg implante', frecuencia: 'Cada 3 meses SC', duracion: 'Según indicación' },
        { nombre: 'Enzalutamida 160 mg', frecuencia: 'Cada 24 h', duracion: 'Según indicación' },
        { nombre: 'Abiraterona 1000 mg + Prednisona 5 mg c/12h', frecuencia: 'Cada 24 h', duracion: 'Según indicación' }
    ],
    'Otros': [
        { nombre: 'Paracetamol 1 g', frecuencia: 'Cada 8 h SOS', duracion: 'Según dolor' },
        { nombre: 'Omeprazol 20 mg', frecuencia: 'Cada 24 h en ayunas', duracion: 'Mientras dure tratamiento gástrico' }
    ]
};

export const FONASA_CATEGORIES = [...new Set(FONASA_CODES.map(c => c.categoria))];

export function findFonasa(codigo) {
    return FONASA_CODES.find(c => c.codigo === codigo) || null;
}

export function isHolep(cod1, cod2) {
    return (cod1 === HOLEP_COD1 && cod2 === HOLEP_COD2) ||
           (cod1 === HOLEP_COD2 && cod2 === HOLEP_COD1);
}
