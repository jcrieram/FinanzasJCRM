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

function buildSolicitudCirugia({ paciente, clinica, data }) {
    const sections = [];
    const cod1 = data.cod1_codigo || '';
    const cod2 = data.cod2_codigo || '';
    const proc1 = data.cod1_nombre || '';
    const proc2 = data.cod2_nombre || '';
    const holep = isHolep(cod1, cod2);

    sections.push(fechaParagraph());
    sections.push(centerTitle('SOLICITUD DE INTERVENCIÓN QUIRÚRGICA'));

    // Datos del paciente
    sections.push(sectionTitle('DATOS DEL PACIENTE'));
    sections.push(patientTable([
        ['Nombre del paciente', paciente.nombre],
        ['RUT', paciente.rut],
        ['Edad', paciente.edad],
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
        ['Anestesia', data.anestesia || '—'],
        ['Insumos especiales', data.insumos || '—']
    );
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

    // Coordinación quirúrgica (Miraflores / Los Carrera)
    if (COORDINADORES[clinica]) {
        const c = COORDINADORES[clinica];
        sections.push(sectionTitle('COORDINACIÓN QUIRÚRGICA'));
        sections.push(new Paragraph({
            children: [
                arial('Contactar a '),
                arial(c.nombre, { bold: true }),
                arial(` (${clinica}) al `),
                arial(c.telefono, { bold: true }),
                arial(' para coordinar fecha y confirmar la cirugía.')
            ]
        }));
    }

    buildSignature(true).forEach(p => sections.push(p));

    return wrapDocument({ sections, title: 'SOLICITUD DE CIRUGÍA', clinica });
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
        const partes = [
            m.nombre,
            m.frecuencia ? `— ${m.frecuencia}` : '',
            m.duracion ? `— ${m.duracion}` : '',
            m.notas ? ` (${m.notas})` : ''
        ].filter(Boolean).join(' ');
        sections.push(new Paragraph({
            spacing: { before: 60, after: 60 },
            children: [arial(`• ${partes}`, { size: 11 })]
        }));
    });

    if (data.indicaciones_generales) {
        sections.push(sectionTitle('INDICACIONES GENERALES'));
        sections.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [arial(data.indicaciones_generales)] }));
    }

    buildSignature(true).forEach(p => sections.push(p));

    return wrapDocument({ sections, title: 'RECETA MÉDICA', clinica });
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

    const { doc_type = 'informe', paciente = {}, clinica = '', data = {}, case_text = '' } = body;
    if (!paciente.nombre || !paciente.rut) {
        return res.status(400).json({ error: 'Faltan nombre y RUT del paciente' });
    }

    let docObj;
    try {
        if (doc_type === 'informe') docObj = buildInformeUrologico({ paciente, clinica, data });
        else if (doc_type === 'cirugia') docObj = buildSolicitudCirugia({ paciente, clinica, data });
        else if (doc_type === 'receta') docObj = buildReceta({ paciente, clinica, data });
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
                    : 'informe';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fileLabel}_${safeName}.docx"`);
    res.send(buffer);
}
