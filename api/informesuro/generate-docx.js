// /api/informesuro/generate-docx — genera un Informe Urológico .docx con
// la librería `docx`, replicando exactamente el formato de generator.py
// del Streamlit original (azul #1F4E79, Arial, header con logo, tabla
// de paciente con shading, secciones I-VI, firma con imagen).

import { authenticate, getServiceClient } from '../../lib/auth.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
    Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel,
    Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
    HeightRule, ImageRun, PageOrientation, convertInchesToTwip,
    convertMillimetersToTwip, Footer, Header, TabStopType, TabStopPosition
} from 'docx';

export const config = { maxDuration: 30 };

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, '..', '..', 'informesuro', 'assets');

const AZUL = '1F4E79';
const AZUL_CLR = 'EBF3FB';
const GRIS = '808080';
const BLANCO = 'FFFFFF';

const MEDICO = {
    nombre: 'Dr. Juan Carlos Riera M.',
    rut: '25.279.729-7',
    especialidad: 'Especialista en Urología',
    ubicacion: 'V Región, Chile'
};

const CLINIC_LOGOS = {
    'Hospital Clínico Viña del Mar': 'logo_hospital_clinico.jpg',
    'Aquamed': 'logo_aquamed.jpg',
    'Clínica Provincia de Petorca': 'logo_petorca.webp',
    'Clínica Los Carrera': 'logo_los_carrera.png',
    'Redsalud': 'logo_redsalud.jpg',
    'Clínica Miraflores': 'logo_miraflores.png'
};

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function fechaHoy() {
    const h = new Date();
    return `${h.getDate()} de ${MESES[h.getMonth()]} de ${h.getFullYear()}`;
}

// Helpers de presentación
function arial(text, opts = {}) {
    return new TextRun({
        text,
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
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ children: [arial(text, { size: 10, bold: opts.bold, color: opts.color })] })]
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

function studiesTable(estudios) {
    const headerRow = new TableRow({
        children: [
            new TableCell({
                shading: { type: ShadingType.CLEAR, fill: AZUL },
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                children: [new Paragraph({ children: [arial('Examen', { size: 10, bold: true, color: BLANCO })] })]
            }),
            new TableCell({
                shading: { type: ShadingType.CLEAR, fill: AZUL },
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
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
                    margins: { top: 50, bottom: 50, left: 100, right: 100 },
                    children: [new Paragraph({ children: [arial(e.examen || '', { size: 10, bold: true })] })]
                }),
                new TableCell({
                    shading: { type: ShadingType.CLEAR, fill },
                    margins: { top: 50, bottom: 50, left: 100, right: 100 },
                    children: [new Paragraph({ children: [arial(e.resultado || '', { size: 10 })] })]
                })
            ]
        });
    });
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...dataRows]
    });
}

function loadImageBuffer(filename) {
    try {
        return readFileSync(join(ASSETS, filename));
    } catch {
        return null;
    }
}

function buildHeader(clinica, titulo) {
    const logoFile = CLINIC_LOGOS[clinica];
    const logoBuf = logoFile ? loadImageBuffer(logoFile) : null;

    const headerTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
            insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }
        },
        rows: [new TableRow({
            children: [
                new TableCell({
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    borders: {
                        top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
                        left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }
                    },
                    children: [new Paragraph({
                        children: logoBuf ? [
                            new ImageRun({
                                data: logoBuf,
                                transformation: { width: 120, height: 90 }
                            })
                        ] : [arial(clinica, { size: 10, bold: true, color: AZUL })]
                    })]
                }),
                new TableCell({
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    borders: {
                        top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
                        left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }
                    },
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

function buildSignature() {
    const firmaBuf = loadImageBuffer('firma.jpg');
    const blocks = [
        new Paragraph({ children: [] }),
        new Paragraph({ children: [arial('Atentamente,', { italic: true })] }),
        new Paragraph({ children: [] }),
        blueRule()
    ];
    if (firmaBuf) {
        blocks.push(new Paragraph({
            children: [new ImageRun({ data: firmaBuf, transformation: { width: 200, height: 80 } })]
        }));
    }
    blocks.push(
        new Paragraph({ children: [arial(MEDICO.nombre, { bold: true })] }),
        new Paragraph({ children: [arial(MEDICO.especialidad)] }),
        new Paragraph({ children: [arial(MEDICO.ubicacion, { italic: true, color: GRIS })] })
    );
    return blocks;
}

function buildInformeUrologico({ paciente, clinica, data }) {
    const sections = [];

    sections.push(
        new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [arial(fechaHoy(), { italic: true })]
        }),
        new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [arial('A fines de uso de paciente', { italic: true })]
        }),
        new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [arial('Presente', { italic: true })]
        }),
        new Paragraph({ children: [] }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [arial('INFORME UROLÓGICO', { size: 14, bold: true, color: AZUL, underline: true })]
        })
    );

    // I. Datos del paciente
    sections.push(sectionTitle('I. DATOS DEL PACIENTE'));
    sections.push(patientTable([
        ['Nombre del paciente', paciente.nombre],
        ['RUT',                 paciente.rut],
        ['Edad',                paciente.edad],
        ['Antecedentes relevantes', data.paciente?.antecedentes || '—'],
        ['Alergias a fármacos',     data.paciente?.alergias     || '—'],
        ['Antecedente quirúrgico',  data.paciente?.quirurgicos  || '—'],
        ['Tabaquismo',              data.paciente?.tabaquismo   || '—']
    ]));

    // II. Motivo de consulta
    sections.push(sectionTitle('II. MOTIVO DE CONSULTA Y RESUMEN CLÍNICO'));
    sections.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        children: [arial(data.motivo_resumen || '')]
    }));

    // III. Estudios
    if (Array.isArray(data.estudios) && data.estudios.length) {
        sections.push(sectionTitle('III. ESTUDIOS COMPLEMENTARIOS REALIZADOS'));
        sections.push(studiesTable(data.estudios));
    }

    // IV. Diagnóstico
    if (Array.isArray(data.diagnosticos) && data.diagnosticos.length) {
        sections.push(sectionTitle('IV. IMPRESIÓN DIAGNÓSTICA'));
        data.diagnosticos.forEach((dx, i) => {
            sections.push(new Paragraph({ children: [arial(`${i + 1}. ${dx}`)] }));
        });
    }

    // V. Indicación
    if (data.procedimiento || data.justificacion || data.consideraciones) {
        sections.push(sectionTitle('V. INDICACIÓN Y CONDUCTA PROPUESTA'));
        if (data.procedimiento) {
            sections.push(new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                children: [arial(data.procedimiento, { bold: true })]
            }));
        }
        if (data.justificacion) {
            sections.push(new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                children: [arial(data.justificacion)]
            }));
        }
        if (data.consideraciones) {
            sections.push(new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                children: [arial(data.consideraciones)]
            }));
        }
    }

    // VI. Análisis
    if (data.analisis) {
        sections.push(sectionTitle('VI. ANÁLISIS OBJETIVO DEL CASO'));
        sections.push(new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            children: [arial(data.analisis)]
        }));
    }

    // Firma
    buildSignature().forEach(p => sections.push(p));

    return new Document({
        creator: 'UroWorkNet',
        styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
        sections: [{
            properties: {
                page: {
                    size: { orientation: PageOrientation.PORTRAIT },
                    margin: {
                        top: convertMillimetersToTwip(25),
                        bottom: convertMillimetersToTwip(25),
                        left: convertMillimetersToTwip(25),
                        right: convertMillimetersToTwip(25)
                    }
                }
            },
            headers: { default: buildHeader(clinica, 'INFORME UROLÓGICO') },
            footers: { default: buildFooter() },
            children: sections
        }]
    });
}

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
        if (doc_type === 'informe') {
            docObj = buildInformeUrologico({ paciente, clinica, data });
        } else {
            return res.status(400).json({ error: `Tipo de documento '${doc_type}' aún no implementado` });
        }
    } catch (e) {
        return res.status(500).json({ error: `Error armando documento: ${e.message}` });
    }

    let buffer;
    try {
        buffer = await Packer.toBuffer(docObj);
    } catch (e) {
        return res.status(500).json({ error: `Error generando .docx: ${e.message}` });
    }

    // Persistir en Supabase (solo metadata; el .docx se regenera bajo demanda).
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
            // No bloqueamos la entrega del .docx por un fallo de logging.
            console.error('No se pudo persistir el documento:', e.message);
        }
    }

    const safeName = (paciente.nombre || 'paciente').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="informe_${safeName}.docx"`);
    res.send(buffer);
}
