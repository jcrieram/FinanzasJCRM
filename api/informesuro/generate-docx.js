// /api/informesuro/generate-docx — genera el .docx del documento solicitado
// (informe, cirugia, receta) replicando el formato del Streamlit original.

import { authenticate, getServiceClient } from '../../lib/auth.js';
import { MEDICO, CLINIC_LOGOS, COORDINADORES, isHolep } from '../../lib/uro-data.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
    Document, Packer, Paragraph, TextRun, AlignmentType,
    Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
    ImageRun, PageOrientation, convertMillimetersToTwip,
    Footer, Header
} from 'docx';

export const config = { maxDuration: 30 };

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, '..', '..', 'informesuro', 'assets');

const AZUL = '1F4E79';
const AZUL_CLR = 'EBF3FB';
const GRIS = '808080';
const BLANCO = 'FFFFFF';

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const fechaHoy = () => {
    const h = new Date();
    return `${h.getDate()} de ${MESES[h.getMonth()]} de ${h.getFullYear()}`;
};

// ─── Helpers de presentación ────────────────────────────────────────────────

function arial(text, opts = {}) {
    return new TextRun({
        text: String(text ?? ''),
        font: 'Arial',
        size: (opts.size || 11) * 2,
        bold: opts.bold || false,
        italics: opts.italic || false,
        color: opts.color || '000000',
        underline: opts.underline ? { type: 'single' } : undefined
    });
}

function blueRule() {
    return new Paragraph({
        spacing: { before: 80, after: 0 },
        border: { bottom: { color: AZUL, size: 12, space: 1, style: BorderStyle.SINGLE } },
        children: []
    });
}

function sectionTitle(text) {
    return new Paragraph({
        spacing: { before: 200, after: 80 },
        children: [arial(text, { size: 11, bold: true, color: AZUL, underline: true })]
    });
}

function shadedCell(text, opts = {}) {
    return new TableCell({
        shading: { type: ShadingType.CLEAR, fill: opts.fill || AZUL_CLR },
        margins: { top: 30, bottom: 30, left: 100, right: 100 },
        children: [new Paragraph({
            spacing: { before: 0, after: 0, line: 240 },
            children: [arial(text, { size: 10, bold: opts.bold, color: opts.color })]
        })]
    });
}

function patientTable(rows) {
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: rows.map(([label, value]) => new TableRow({
            children: [
                shadedCell(label, { bold: true }),
                shadedCell(String(value || '—'))
            ]
        }))
    });
}

function loadImageBuffer(filename) {
    try { return readFileSync(join(ASSETS, filename)); }
    catch { return null; }
}

function buildHeader(clinica, titulo) {
    const logoFile = CLINIC_LOGOS[clinica];
    const logoBuf = logoFile ? loadImageBuffer(logoFile) : null;
    const noBorder = {
        top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }
    };
    const headerTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { ...noBorder, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
        rows: [new TableRow({
            children: [
                new TableCell({
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    borders: noBorder,
                    children: [new Paragraph({
                        children: logoBuf
                            ? [new ImageRun({ data: logoBuf, transformation: { width: 120, height: 90 } })]
                            : [arial(clinica || '', { size: 10, bold: true, color: AZUL })]
                    })]
                }),
                new TableCell({
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    borders: noBorder,
                    children: [new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        children: [arial(titulo, { size: 12, bold: true, color: AZUL })]
                    })]
                })
            ]
        })]
    });
    return new Header({ children: [headerTable, blueRule()] });
}

function buildFooter() {
    return new Footer({
        children: [
            blueRule(),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 80 },
                children: [arial('Documento emitido por especialista en ejercicio privado', { size: 8, color: GRIS })]
            })
        ]
    });
}

function buildSignature(compact = false) {
    const firmaBuf = loadImageBuffer('firma.jpg');
    const blocks = [];
    if (!compact) {
        blocks.push(new Paragraph({ children: [] }));
        blocks.push(new Paragraph({ children: [arial('Atentamente,', { italic: true })] }));
        blocks.push(new Paragraph({ children: [] }));
    }
    blocks.push(blueRule());
    if (firmaBuf) {
        blocks.push(new Paragraph({
            children: [new ImageRun({ data: firmaBuf, transformation: { width: compact ? 160 : 200, height: compact ? 64 : 80 } })]
        }));
    }
    blocks.push(
        new Paragraph({ children: [arial(MEDICO.nombre, { bold: true, size: compact ? 10 : 11 })] }),
        new Paragraph({ children: [arial(MEDICO.especialidad, { size: compact ? 10 : 11 })] }),
        new Paragraph({ children: [arial(MEDICO.ubicacion, { italic: true, color: GRIS, size: compact ? 9 : 11 })] })
    );
    return blocks;
}

function fechaParagraph() {
    return new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 0, after: 40 },
        children: [arial(fechaHoy(), { italic: true })]
    });
}

function centerTitle(text) {
    return new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 160 },
        children: [arial(text, { size: 14, bold: true, color: AZUL, underline: true })]
    });
}

// ─── Documentos ─────────────────────────────────────────────────────────────

function buildInformeUrologico({ paciente, clinica, data }) {
    const sections = [];

    sections.push(
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [arial(fechaHoy(), { italic: true })] }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [arial('A fines de uso de paciente', { italic: true })] }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [arial('Presente', { italic: true })] }),
        new Paragraph({ children: [] }),
        centerTitle('INFORME UROLÓGICO')
    );

    sections.push(sectionTitle('DATOS DEL PACIENTE'));
    sections.push(patientTable([
        ['Nombre del paciente', paciente.nombre],
        ['RUT', paciente.rut],
        ['Edad', paciente.edad],
        ['Antecedentes relevantes', data.paciente?.antecedentes || '—'],
        ['Alergias a fármacos', data.paciente?.alergias || '—'],
        ['Antecedente quirúrgico', data.paciente?.quirurgicos || '—'],
        ['Tabaquismo', data.paciente?.tabaquismo || '—']
    ]));

    sections.push(sectionTitle('MOTIVO DE CONSULTA Y RESUMEN CLÍNICO'));
    sections.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        children: [arial(data.motivo_resumen || '')]
    }));

    if (Array.isArray(data.estudios) && data.estudios.length) {
        sections.push(sectionTitle('ESTUDIOS COMPLEMENTARIOS REALIZADOS'));
        sections.push(studiesTable(data.estudios));
    }

    if (Array.isArray(data.diagnosticos) && data.diagnosticos.length) {
        sections.push(sectionTitle('IMPRESIÓN DIAGNÓSTICA'));
        data.diagnosticos.forEach((dx, i) => {
            sections.push(new Paragraph({ children: [arial(`${i + 1}. ${dx}`)] }));
        });
    }

    if (data.procedimiento || data.justificacion || data.consideraciones) {
        sections.push(sectionTitle('INDICACIÓN Y CONDUCTA PROPUESTA'));
        if (data.procedimiento) sections.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [arial(data.procedimiento, { bold: true })] }));
        if (data.justificacion) sections.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [arial(data.justificacion)] }));
        if (data.consideraciones) sections.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [arial(data.consideraciones)] }));
    }

    if (data.analisis) {
        sections.push(sectionTitle('ANÁLISIS OBJETIVO DEL CASO'));
        sections.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [arial(data.analisis)] }));
    }

    buildSignature(false).forEach(p => sections.push(p));

    return wrapDocument({ sections, title: 'INFORME UROLÓGICO', clinica });
}

function studiesTable(estudios) {
    const headerRow = new TableRow({
        children: [
            new TableCell({
                shading: { type: ShadingType.CLEAR, fill: AZUL },
                margins: { top: 40, bottom: 40, left: 100, right: 100 },
                children: [new Paragraph({ children: [arial('Examen', { size: 10, bold: true, color: BLANCO })] })]
            }),
            new TableCell({
                shading: { type: ShadingType.CLEAR, fill: AZUL },
                margins: { top: 40, bottom: 40, left: 100, right: 100 },
                children: [new Paragraph({ children: [arial('Resultado / Hallazgo', { size: 10, bold: true, color: BLANCO })] })]
            })
        ]
    });
    const dataRows = estudios.map((e, i) => {
        const fill = i % 2 === 0 ? AZUL_CLR : 'FFFFFF';
        return new TableRow({
            children: [
                new TableCell({
                    shading: { type: ShadingType.CLEAR, fill },
                    margins: { top: 30, bottom: 30, left: 100, right: 100 },
                    children: [new Paragraph({ spacing: { line: 240 }, children: [arial(e.examen || '', { size: 10, bold: true })] })]
                }),
                new TableCell({
                    shading: { type: ShadingType.CLEAR, fill },
                    margins: { top: 30, bottom: 30, left: 100, right: 100 },
                    children: [new Paragraph({ spacing: { line: 240 }, children: [arial(e.resultado || '', { size: 10 })] })]
                })
            ]
        });
    });
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...dataRows] });
}

function buildSolicitudCirugia({ paciente, clinica, clinica_destino, data }) {
    const sections = [];
    const cod1 = data.cod1_codigo || '';
    const cod2 = data.cod2_codigo || '';
    const proc1 = data.cod1_nombre || '';
    const proc2 = data.cod2_nombre || '';
    const holep = isHolep(cod1, cod2);
    // La clínica destino es donde se opera; si no viene, caemos a la clínica origen
    // (compatibilidad con payloads antiguos).
    const clinicaTarget = clinica_destino || clinica;

    sections.push(fechaParagraph());
    sections.push(centerTitle('SOLICITUD DE INTERVENCIÓN QUIRÚRGICA'));
    if (clinicaTarget) {
        sections.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 200 },
            children: [arial(`A ${clinicaTarget}`, { size: 12, bold: true, color: '4b5563' })]
        }));
    }

    // Datos del paciente
    sections.push(sectionTitle('DATOS DEL PACIENTE'));
    sections.push(patientTable([
        ['Nombre del paciente', paciente.nombre],
        ['RUT', paciente.rut],
        ['Edad', paciente.edad],
        ['Clínica de origen', clinica || '—'],
        ['Previsión', data.prevision || '—'],
        ['Teléfono', data.telefono || '—']
    ]));

    // Procedimiento
    sections.push(sectionTitle('PROCEDIMIENTO SOLICITADO'));
    const procRows = [
        ['Código FONASA 1', cod1 || '—'],
        ['Procedimiento 1', proc1 || '—']
    ];
    if (cod2 && proc2) {
        procRows.push(['Código FONASA 2', cod2], ['Procedimiento 2', proc2]);
    }
    procRows.push(
        ['Tipo de cirugía', data.tipo || 'Electiva'],
        ['Cirujano', MEDICO.nombre],
        ['Ayudante', data.ayudante || '— Sin ayudante —'],
        ['Insumos especiales', data.insumos || '—']
    );
    // Cuando es HoLEP el peso de próstata es OBLIGATORIO (independiente del checkbox).
    if (data.peso_prostata || holep) procRows.push(['Solicitud adicional', 'Peso de próstata para anatomía patológica']);
    sections.push(patientTable(procRows));

    // Indicación clínica
    if (data.indicacion) {
        sections.push(sectionTitle('INDICACIÓN CLÍNICA'));
        sections.push(new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            children: [arial(data.indicacion)]
        }));
    }

    // Coordinación quirúrgica (Miraflores / Los Carrera) — basada en la clínica destino
    if (COORDINADORES[clinicaTarget]) {
        const c = COORDINADORES[clinicaTarget];
        sections.push(sectionTitle('COORDINACIÓN QUIRÚRGICA'));
        sections.push(new Paragraph({
            children: [
                arial('Contactar a '),
                arial(c.nombre, { bold: true }),
                arial(` (${clinicaTarget}) al `),
                arial(c.telefono, { bold: true }),
                arial(' para coordinar fecha y confirmar la cirugía.')
            ]
        }));
    }

    buildSignature(true).forEach(p => sections.push(p));

    // El header/logo del documento usa la clínica destino (donde se opera).
    return wrapDocument({ sections, title: 'SOLICITUD DE CIRUGÍA', clinica: clinicaTarget });
}

function buildReceta({ paciente, clinica, data }) {
    const sections = [];

    // Encabezado del médico (alineado a la derecha)
    sections.push(
        new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 20 }, children: [arial(MEDICO.nombre, { size: 13, bold: true, color: AZUL })] }),
        new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 20 }, children: [arial(MEDICO.rut, { size: 11, color: AZUL })] }),
        new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 60 }, children: [arial(MEDICO.cm, { size: 11, color: AZUL })] }),
        new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 80 }, children: [arial(fechaHoy(), { italic: true })] })
    );

    sections.push(centerTitle('RECETA MÉDICA'));

    sections.push(sectionTitle('DATOS DEL PACIENTE'));
    sections.push(patientTable([
        ['Nombre del paciente', paciente.nombre],
        ['RUT', paciente.rut],
        ['Edad', paciente.edad]
    ]));

    if (data.diagnostico) {
        sections.push(sectionTitle('DIAGNÓSTICO'));
        sections.push(new Paragraph({ children: [arial(data.diagnostico)] }));
    }

    sections.push(sectionTitle('PRESCRIPCIÓN FARMACOLÓGICA'));
    const meds = Array.isArray(data.medicamentos) ? data.medicamentos : [];
    meds.forEach(m => {
        // Formato final: "Bladuril 200 mg tomar 1 comprimido cada 8 horas por 6 días."
        const frase = [m.nombre, m.posologia, m.duracion]
            .map(s => (s || '').trim())
            .filter(Boolean)
            .join(' ');
        const notas = (m.notas || '').trim();
        sections.push(new Paragraph({
            spacing: { before: 60, after: 60 },
            children: [arial(`• ${frase}${frase.endsWith('.') ? '' : '.'}${notas ? '   ' + notas : ''}`, { size: 11 })]
        }));
    });

    if (data.indicaciones_generales) {
        sections.push(sectionTitle('INDICACIONES GENERALES'));
        sections.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [arial(data.indicaciones_generales)] }));
    }

    buildSignature(true).forEach(p => sections.push(p));

    return wrapDocument({ sections, title: 'RECETA MÉDICA', clinica });
}

function buildSolicitudExamenes({ paciente, clinica, data, titulo = 'SOLICITUD DE EXÁMENES' }) {
    const sections = [];
    sections.push(fechaParagraph());
    sections.push(centerTitle(titulo));

    sections.push(sectionTitle('DATOS DEL PACIENTE'));
    sections.push(patientTable([
        ['Nombre del paciente', paciente.nombre],
        ['RUT', paciente.rut],
        ['Edad', paciente.edad]
    ]));

    // Items pueden venir como strings (legacy) o como { name, type }.
    const all = (Array.isArray(data.items) ? data.items : [])
        .map(it => typeof it === 'string' ? { name: it, type: 'lab' } : it)
        .filter(it => (it?.name || '').trim());
    const labItems    = all.filter(it => it.type === 'lab').map(it => it.name);
    const imagenItems = all.filter(it => it.type === 'imagen').map(it => it.name);

    function buildItemsTable(items, headerLabel) {
        const headerRow = new TableRow({
            children: ['N°', headerLabel].map(t => new TableCell({
                shading: { type: ShadingType.CLEAR, fill: AZUL },
                margins: { top: 40, bottom: 40, left: 100, right: 100 },
                children: [new Paragraph({ children: [arial(t, { size: 10, bold: true, color: BLANCO })] })]
            }))
        });
        const dataRows = items.map((item, i) => {
            const fill = i % 2 === 0 ? 'FFFFFF' : AZUL_CLR;
            return new TableRow({
                children: [
                    new TableCell({
                        shading: { type: ShadingType.CLEAR, fill },
                        margins: { top: 30, bottom: 30, left: 100, right: 100 },
                        children: [new Paragraph({ children: [arial(String(i + 1), { size: 10, bold: true })] })]
                    }),
                    new TableCell({
                        shading: { type: ShadingType.CLEAR, fill },
                        margins: { top: 30, bottom: 30, left: 100, right: 100 },
                        children: [new Paragraph({ children: [arial(item, { size: 10 })] })]
                    })
                ]
            });
        });
        return new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headerRow, ...dataRows]
        });
    }

    if (labItems.length) {
        sections.push(sectionTitle('EXÁMENES DE LABORATORIO'));
        sections.push(buildItemsTable(labItems, 'Examen'));
    }

    if (data.indicacion) {
        sections.push(sectionTitle('INDICACIÓN CLÍNICA'));
        sections.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [arial(data.indicacion)] }));
    }
    if (data.prioridad && data.prioridad !== 'Normal') {
        sections.push(new Paragraph({
            spacing: { before: 120 },
            children: [arial(`Prioridad: ${data.prioridad}`, { bold: true, color: AZUL })]
        }));
    }

    buildSignature(true).forEach(p => sections.push(p));

    // Una hoja independiente por cada estudio de imagen — para que cada solicitud
    // se imprima en su propia página y se entregue por separado.
    imagenItems.forEach(estudio => {
        sections.push(new Paragraph({
            children: [arial('')],
            pageBreakBefore: true
        }));
        sections.push(fechaParagraph());
        sections.push(centerTitle('SOLICITUD DE ESTUDIO DE IMAGEN'));
        sections.push(sectionTitle('DATOS DEL PACIENTE'));
        sections.push(patientTable([
            ['Nombre del paciente', paciente.nombre],
            ['RUT', paciente.rut],
            ['Edad', paciente.edad]
        ]));
        sections.push(sectionTitle('ESTUDIO SOLICITADO'));
        sections.push(buildItemsTable([estudio], 'Estudio'));
        if (data.indicacion) {
            sections.push(sectionTitle('INDICACIÓN CLÍNICA'));
            sections.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [arial(data.indicacion)] }));
        }
        if (data.prioridad && data.prioridad !== 'Normal') {
            sections.push(new Paragraph({
                spacing: { before: 120 },
                children: [arial(`Prioridad: ${data.prioridad}`, { bold: true, color: AZUL })]
            }));
        }
        buildSignature(true).forEach(p => sections.push(p));
    });

    return wrapDocument({ sections, title: titulo, clinica });
}

function buildSolicitudEstudio({ paciente, clinica, data }) {
    const sections = [];
    const titulo = data.titulo || 'SOLICITUD DE ESTUDIO';

    sections.push(fechaParagraph());
    sections.push(centerTitle(titulo));

    sections.push(sectionTitle('DATOS DEL PACIENTE'));
    sections.push(patientTable([
        ['Nombre del paciente', paciente.nombre],
        ['RUT', paciente.rut],
        ['Edad', paciente.edad]
    ]));

    sections.push(sectionTitle('SOLICITUD'));
    const cuerpo = (data.body || '').split('\n');
    cuerpo.forEach(line => {
        sections.push(new Paragraph({
            spacing: { before: 0, after: 60 },
            children: [arial(line, { size: 11 })]
        }));
    });

    buildSignature(true).forEach(p => sections.push(p));
    return wrapDocument({ sections, title: titulo, clinica });
}

function buildAltaMedica({ paciente, clinica, data }) {
    const sections = [];

    sections.push(sectionTitle('IDENTIFICACIÓN DEL PACIENTE'));
    sections.push(patientTable([
        ['Nombre del paciente', paciente.nombre],
        ['RUT', paciente.rut],
        ['Edad', paciente.edad],
        ['Fecha de cirugía', data.fecha_cirugia || '—'],
        ['Fecha de emisión', fechaHoy()],
        ['Clínica / Centro', clinica || '—']
    ]));

    sections.push(sectionTitle('DIAGNÓSTICO Y PROCEDIMIENTO'));
    const cod1Display = data.cod1_codigo
        ? `${data.cod1_codigo}  —  ${data.cod1_nombre || ''}`
        : (data.cod1_nombre || '—');
    const cod2Display = (data.cod2_codigo && data.cod2_nombre)
        ? `${data.cod2_codigo}  —  ${data.cod2_nombre}`
        : '—';
    sections.push(patientTable([
        ['Diagnóstico de egreso', data.diagnostico || '—'],
        ['Procedimiento principal (FONASA)', cod1Display],
        ['Procedimiento secundario (FONASA)', cod2Display]
    ]));

    if (data.cuerpo) {
        sections.push(sectionTitle('EVOLUCIÓN CLÍNICA Y HOSPITALARIA'));
        data.cuerpo.split(/\n\n+/).forEach(parr => {
            sections.push(new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                spacing: { before: 40, after: 120 },
                children: [arial(parr.trim())]
            }));
        });
    }

    if (data.indicaciones) {
        sections.push(sectionTitle('INDICACIONES AL ALTA'));
        data.indicaciones.split('\n').forEach(linea => {
            const t = linea.trim();
            if (!t) return;
            sections.push(new Paragraph({
                spacing: { before: 20, after: 20 },
                children: [arial(`• ${t}`, { size: 10 })]
            }));
        });
    }

    buildSignature(false).forEach(p => sections.push(p));
    return wrapDocument({ sections, title: 'INFORME DE ALTA MÉDICA', clinica });
}

// ─── Post Quirúrgico helpers ─────────────────────────────────────────────────

function buildExamTable(examenes) {
    const headerRow = new TableRow({
        children: [
            new TableCell({
                shading: { type: ShadingType.CLEAR, fill: AZUL },
                margins: { top: 30, bottom: 30, left: 100, right: 100 },
                children: [new Paragraph({ children: [arial('N°', { size: 9, bold: true, color: BLANCO })] })]
            }),
            new TableCell({
                shading: { type: ShadingType.CLEAR, fill: AZUL },
                margins: { top: 30, bottom: 30, left: 100, right: 100 },
                children: [new Paragraph({ children: [arial('Examen', { size: 9, bold: true, color: BLANCO })] })]
            })
        ]
    });
    const dataRows = examenes.map((nombre, i) => {
        const fill = i % 2 === 0 ? AZUL_CLR : 'FFFFFF';
        return new TableRow({
            children: [
                new TableCell({ shading: { type: ShadingType.CLEAR, fill }, margins: { top: 30, bottom: 30, left: 100, right: 100 }, children: [new Paragraph({ spacing: { line: 240 }, children: [arial(String(i + 1), { size: 9, bold: true })] })] }),
                new TableCell({ shading: { type: ShadingType.CLEAR, fill }, margins: { top: 30, bottom: 30, left: 100, right: 100 }, children: [new Paragraph({ spacing: { line: 240 }, children: [arial(nombre, { size: 10, bold: true })] })] })
            ]
        });
    });
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...dataRows] });
}

function buildPostVasectomia({ paciente, clinica, data }) {
    const secs = [];
    const fechaEsp = data.fecha_espermiograma || '—';

    // Hoja 1: Recomendaciones
    secs.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 160 },
        children: [arial('RECOMENDACIONES VASECTOMÍA', { size: 14, bold: true, color: AZUL, underline: true })]
    }));
    const pacRows = [];
    if (paciente.nombre) pacRows.push(['Paciente', paciente.nombre]);
    if (paciente.rut) pacRows.push(['RUT', paciente.rut]);
    if (pacRows.length) { secs.push(patientTable(pacRows)); secs.push(new Paragraph({ children: [] })); }
    secs.push(new Paragraph({ spacing: { before: 120 }, children: [arial('RECUERDE:', { size: 12, bold: true, color: AZUL })] }));
    [
        'DEBE USAR MÉTODOS ANTICONCEPTIVOS (AL MÍNIMO 3 MESES) HASTA QUE TENGAMOS EL ESPERMIOGRAMA CONTROL (SOLICITADO HOY)',
        'DEBE TENER EYACULACIONES HABITUALES DURANTE ESTE TIEMPO (1-2 semanal)',
        'ESTA CIRUGÍA NO INTERFIERE CON SU ERECCIÓN, LA CUAL SEGUIRÁ SIENDO EXACTAMENTE COMO ANTES DE LA CIRUGÍA'
    ].forEach((item, i) => {
        secs.push(new Paragraph({ spacing: { before: 160, after: 120 }, children: [arial(`${i + 1}. ${item}`, { size: 11, bold: true })] }));
    });
    buildSignature(true).forEach(p => secs.push(p));

    // Hoja 2: Solicitud Espermiograma
    secs.push(new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 40 }, children: [arial(fechaHoy(), { italic: true })] }));
    secs.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 160 }, children: [arial('SOLICITUD DE EXAMEN DE LABORATORIO', { size: 13, bold: true, color: AZUL, underline: true })] }));
    secs.push(sectionTitle('I. DATOS DEL PACIENTE'));
    secs.push(patientTable([['Nombre del paciente', paciente.nombre], ['RUT', paciente.rut], ['Edad', paciente.edad]]));
    secs.push(sectionTitle('II. EXAMEN SOLICITADO'));
    secs.push(buildExamTable(['ESPERMIOGRAMA']));
    secs.push(new Paragraph({ children: [] }));
    secs.push(new Paragraph({ children: [arial('Indicación clínica: ', { size: 10, bold: true }), arial('Control post-vasectomía', { size: 10 })] }));
    secs.push(new Paragraph({ spacing: { before: 120 }, children: [arial('No olvide que debe realizarse el espermiograma en fecha estimada: ', { size: 10, bold: true, color: AZUL }), arial(fechaEsp, { size: 12, bold: true })] }));
    buildSignature(true).forEach(p => secs.push(p));

    return wrapDocument({ sections: secs, title: 'POST-VASECTOMÍA', clinica });
}

function buildPostProstata({ paciente, clinica, data }) {
    const secs = [];

    // Hoja 1: Instrucciones
    secs.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 160 }, children: [arial('INSTRUCCIONES POST CIRUGÍA DE PRÓSTATA', { size: 13, bold: true, color: AZUL, underline: true })] }));
    const pacRows = [];
    if (paciente.nombre) pacRows.push(['Paciente', paciente.nombre]);
    if (paciente.rut) pacRows.push(['RUT', paciente.rut]);
    if (pacRows.length) { secs.push(patientTable(pacRows)); secs.push(new Paragraph({ children: [] })); }
    secs.push(new Paragraph({ spacing: { before: 80 }, children: [arial('Estimado Paciente,', { size: 11, bold: true })] }));
    secs.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { before: 120, after: 120 }, children: [arial('El próximo control será cuando le entreguen el resultado de la biopsia tomada el día de la cirugía y el examen de orina y urocultivo que debe realizarse al momento de retirar la biopsia. Con esos exámenes debe acudir a la consulta control.', { size: 11 })] }));
    secs.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { before: 80 }, children: [arial('No olvide contactarme en caso de cualquier situación inesperada, como fiebre, dolor intenso, sangrado abundante o dificultad para orinar.', { size: 11, bold: true })] }));
    buildSignature(true).forEach(p => secs.push(p));

    // Hoja 2: Solicitud exámenes
    secs.push(new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 40 }, children: [arial(fechaHoy(), { italic: true })] }));
    secs.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 160 }, children: [arial('SOLICITUD DE EXÁMENES DE LABORATORIO', { size: 13, bold: true, color: AZUL, underline: true })] }));
    secs.push(sectionTitle('I. DATOS DEL PACIENTE'));
    secs.push(patientTable([['Nombre del paciente', paciente.nombre], ['RUT', paciente.rut], ['Edad', paciente.edad]]));
    secs.push(sectionTitle('II. EXÁMENES SOLICITADOS'));
    secs.push(buildExamTable(['Orina completa', 'Urocultivo']));
    secs.push(new Paragraph({ children: [] }));
    secs.push(new Paragraph({ children: [arial('Indicación clínica: ', { size: 10, bold: true }), arial('Control post-cirugía prostática. Realizar al momento de retirar resultado de biopsia.', { size: 10 })] }));
    buildSignature(true).forEach(p => secs.push(p));

    return wrapDocument({ sections: secs, title: 'POST CIRUGÍA PROSTÁTICA', clinica });
}

function buildPostHolep({ paciente, clinica }) {
    const secs = [];

    const p9 = (text, opts = {}) => new Paragraph({
        alignment: opts.justify ? AlignmentType.JUSTIFIED : undefined,
        spacing: { before: opts.sb || 40, after: opts.sa || 40 },
        children: [arial(text, { size: 9, bold: opts.bold, color: opts.color })]
    });
    const subtitulo = (text) => new Paragraph({ spacing: { before: 80, after: 20 }, children: [arial(text, { size: 9, bold: true, color: AZUL, underline: true })] });
    const bullet = (text) => new Paragraph({ spacing: { before: 20, after: 20 }, children: [arial(`• ${text}`, { size: 9 })] });

    secs.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 80 }, children: [arial('Ejercicios posterior a HoLEP', { size: 12, bold: true, color: AZUL, underline: true })] }));
    const pacRows = [];
    if (paciente.nombre) pacRows.push(['Paciente', paciente.nombre]);
    if (paciente.rut) pacRows.push(['RUT', paciente.rut]);
    if (pacRows.length) secs.push(patientTable(pacRows));

    secs.push(p9('Estimado paciente,', { bold: true, sb: 80, sa: 40 }));
    secs.push(p9('Después de la cirugía HoLEP, es normal que algunos hombres presenten pérdida leve de orina al toser, levantarse o hacer fuerza. Ocurre porque trabajamos muy cerca del esfínter urinario, que puede quedar transitoriamente debilitado. Esto no significa que algo salió mal — la gran mayoría recupera el control completo en pocas semanas o meses.', { justify: true }));
    secs.push(p9('Para acelerar esa recuperación, te indico ejercicios de Kegel, que fortalecen el suelo pélvico.', { justify: true }));

    secs.push(subtitulo('¿Cómo se hacen los ejercicios de Kegel?'));
    secs.push(p9('1. Identifica el músculo correcto:', { bold: true }));
    secs.push(p9('Al orinar, intenta detener el chorro por 3–5 segundos. Ese músculo que contraes es el que ejercitaremos.'));
    secs.push(p9('2. Ejecuta el ejercicio:', { bold: true }));
    secs.push(bullet('Aprieta ese músculo 3–5 segundos y suelta.'));
    secs.push(bullet('10 repeticiones, 3 veces al día (mañana, tarde y noche).'));

    secs.push(subtitulo('Consejos útiles'));
    ['Hazlos acostado, sentado o de pie, como te sea más cómodo.',
     'No aprietes glúteos, abdomen ni piernas al ejercitar.',
     'No los hagas mientras orinas normalmente (solo para identificar el músculo).',
     'Hidratación: al menos 2 litros de agua al día.',
     'Usa protectores masculinos si hay pérdida leve mientras te recuperas — es temporal.',
     'Evita café, alcohol y bebidas gaseosas: irritan la vejiga.',
     'No levantes objetos pesados las primeras 3 semanas.',
     'Retoma el ejercicio físico de forma gradual, comenzando con caminatas cortas.'
    ].forEach(c => secs.push(bullet(c)));

    secs.push(p9('La incontinencia temporal es pasajera y tratable. Con constancia la mejoría llega.', { bold: true, sb: 80, sa: 20 }));
    secs.push(p9('No olvide contactarme en caso de cualquier situación inesperada.', { bold: true }));
    buildSignature(true).forEach(p => secs.push(p));

    return wrapDocument({ sections: secs, title: 'POST HoLEP', clinica });
}

// ─── Wrapper común ──────────────────────────────────────────────────────────

function wrapDocument({ sections, title, clinica }) {
    return new Document({
        creator: 'UroWorkNet · InformesUro',
        styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
        sections: [{
            properties: {
                page: {
                    size: { orientation: PageOrientation.PORTRAIT },
                    margin: {
                        top: convertMillimetersToTwip(22),
                        bottom: convertMillimetersToTwip(22),
                        left: convertMillimetersToTwip(22),
                        right: convertMillimetersToTwip(22)
                    }
                }
            },
            headers: { default: buildHeader(clinica, title) },
            footers: { default: buildFooter() },
            children: sections
        }]
    });
}

// ─── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const auth = await authenticate(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    let body;
    try { body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); }
    catch { return res.status(400).json({ error: 'JSON inválido' }); }

    const { doc_type = 'informe', paciente = {}, clinica = '', clinica_destino = '', data = {}, case_text = '' } = body;
    if (!paciente.nombre || !paciente.rut) {
        return res.status(400).json({ error: 'Faltan nombre y RUT del paciente' });
    }

    let docObj;
    try {
        if (doc_type === 'informe')           docObj = buildInformeUrologico({ paciente, clinica, data });
        else if (doc_type === 'cirugia')      docObj = buildSolicitudCirugia({ paciente, clinica, clinica_destino, data });
        else if (doc_type === 'receta')       docObj = buildReceta({ paciente, clinica, data });
        else if (doc_type === 'examenes')     docObj = buildSolicitudExamenes({ paciente, clinica, data: { ...data, kind: 'examenes' }, titulo: 'SOLICITUD DE EXÁMENES' });
        else if (doc_type === 'estudios')     docObj = buildSolicitudEstudio({ paciente, clinica, data });
        else if (doc_type === 'alta')         docObj = buildAltaMedica({ paciente, clinica, data });
        else if (doc_type === 'postvasectomia') docObj = buildPostVasectomia({ paciente, clinica, data });
        else if (doc_type === 'postprostata')   docObj = buildPostProstata({ paciente, clinica, data });
        else if (doc_type === 'postholep')      docObj = buildPostHolep({ paciente, clinica, data });
        else return res.status(400).json({ error: `Tipo de documento '${doc_type}' aún no implementado` });
    } catch (e) {
        return res.status(500).json({ error: `Error armando documento: ${e.message}` });
    }

    let buffer;
    try { buffer = await Packer.toBuffer(docObj); }
    catch (e) { return res.status(500).json({ error: `Error generando .docx: ${e.message}` }); }

    if (auth.user) {
        try {
            const supa = getServiceClient();
            await supa.from('generated_documents').insert({
                user_id: auth.user.id,
                doc_type,
                patient_name: paciente.nombre,
                patient_rut: paciente.rut,
                patient_age: paciente.edad || null,
                clinic: clinica || null,
                case_text,
                data
            });
        } catch (e) {
            console.error('No se pudo persistir el documento:', e.message);
        }
    }

    const safeName = (paciente.nombre || 'paciente').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    const fileLabel = doc_type === 'cirugia' ? 'solicitud_cirugia'
                    : doc_type === 'receta' ? 'receta'
                    : doc_type === 'examenes' ? 'solicitud_examenes'
                    : doc_type === 'estudios' ? 'solicitud_estudios'
                    : doc_type === 'alta' ? 'alta_medica'
                    : doc_type === 'postvasectomia' ? 'post_vasectomia'
                    : doc_type === 'postprostata' ? 'post_prostata'
                    : doc_type === 'postholep' ? 'post_holep'
                    : 'informe';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fileLabel}_${safeName}.docx"`);
    res.send(buffer);
}
