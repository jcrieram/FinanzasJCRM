// /api/uroatlas/report-docx — Convierte el texto del informe ya generado
// por /api/uroatlas/report a un archivo .docx descargable.
// Body: { text, patient: { nombre, edad, rut }, fecha }

import { authenticate } from '../../lib/auth.js';
import {
    Document, Packer, Paragraph, TextRun, AlignmentType,
    PageOrientation, convertMillimetersToTwip, BorderStyle
} from 'docx';

export const config = { maxDuration: 15 };

const AZUL = '0B5394';
const NAVY = '0F2A47';
const NEGRO = '1A2332';
const GRIS = '7B8794';

function arial(text, opts = {}) {
    return new TextRun({
        text,
        font: 'Arial',
        size: opts.size || 22,
        bold: !!opts.bold,
        italics: !!opts.italic,
        color: opts.color || NEGRO,
        superScript: !!opts.superScript
    });
}

// Detecta líneas que actúan como TÍTULOS DE SECCIÓN en el output del prompt:
// están en mayúsculas, miden 3-80 chars, no terminan en punto.
function isSectionTitle(line) {
    const t = line.trim();
    if (t.length < 3 || t.length > 80) return false;
    if (/[.:]$/.test(t)) return false;
    // Debe contener al menos 2 letras mayúsculas y ninguna minúscula.
    if (/[a-záéíóúñ]/.test(t)) return false;
    if ((t.match(/[A-ZÁÉÍÓÚÑ]/g) || []).length < 3) return false;
    return true;
}

function parseSections(text) {
    const out = [];
    let current = { title: null, body: [] };
    for (const raw of text.split('\n')) {
        if (isSectionTitle(raw)) {
            if (current.title || current.body.length) out.push(current);
            current = { title: raw.trim(), body: [] };
        } else {
            current.body.push(raw);
        }
    }
    if (current.title || current.body.length) out.push(current);
    return out;
}

// Renderiza un párrafo respetando **negritas** y citas [n] como superíndice.
function paragraphFromInline(text) {
    const runs = [];
    // Token: **bold**, [n], o texto plano
    const regex = /(\*\*[^*]+\*\*|\[\d+\])/g;
    let last = 0;
    let m;
    while ((m = regex.exec(text)) !== null) {
        if (m.index > last) runs.push(arial(text.slice(last, m.index)));
        const tok = m[0];
        if (tok.startsWith('**')) {
            runs.push(arial(tok.slice(2, -2), { bold: true }));
        } else {
            runs.push(arial(tok, { superScript: true, color: AZUL, size: 18 }));
        }
        last = m.index + tok.length;
    }
    if (last < text.length) runs.push(arial(text.slice(last)));
    if (!runs.length) runs.push(arial(text));
    return new Paragraph({
        spacing: { after: 100 },
        alignment: AlignmentType.JUSTIFIED,
        children: runs
    });
}

function buildDoc({ text, patient, fecha }) {
    const children = [];

    // Encabezado
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [arial('INFORME MÉDICO UROLÓGICO', { size: 28, bold: true, color: NAVY })]
    }));
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 280 },
        border: { bottom: { color: AZUL, space: 4, style: BorderStyle.SINGLE, size: 12 } },
        children: [arial(fecha || '', { size: 18, color: GRIS, italic: true })]
    }));

    const sections = parseSections(text);

    // Si la primera sección no es DATOS DEL PACIENTE, agregamos un bloque mínimo.
    if (!sections.length || sections[0].title !== 'DATOS DEL PACIENTE') {
        sections.unshift({
            title: 'DATOS DEL PACIENTE',
            body: [
                `Nombre: ${patient.nombre || ''}`,
                patient.edad ? `Edad: ${patient.edad}` : null,
                `RUT: ${patient.rut || ''}`,
                `Fecha: ${fecha || ''}`
            ].filter(Boolean)
        });
    }

    for (const sec of sections) {
        if (sec.title) {
            children.push(new Paragraph({
                spacing: { before: 240, after: 120 },
                border: { bottom: { color: AZUL, space: 2, style: BorderStyle.SINGLE, size: 6 } },
                children: [arial(sec.title, { size: 22, bold: true, color: AZUL })]
            }));
        }
        const bodyText = sec.body.join('\n').replace(/\n{3,}/g, '\n\n').trim();
        if (!bodyText) continue;
        for (const para of bodyText.split(/\n\s*\n/)) {
            const lines = para.split('\n').map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
                children.push(paragraphFromInline(line));
            }
        }
    }

    // Firma
    children.push(new Paragraph({ spacing: { before: 360 }, children: [arial('')] }));
    children.push(new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 60 },
        children: [arial('Atentamente,', { size: 22 })]
    }));
    children.push(new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [arial('Dr. Juan Carlos Riera M. — Urólogo', { size: 22, bold: true })]
    }));

    return new Document({
        creator: 'UroAtlas',
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
            children
        }]
    });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const auth = await authenticate(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    let body;
    try { body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); }
    catch { return res.status(400).json({ error: 'JSON inválido' }); }

    const { text = '', patient = {}, fecha = '' } = body;
    if (!text || !patient.nombre || !patient.rut) {
        return res.status(400).json({ error: 'Faltan text, patient.nombre o patient.rut' });
    }

    let buffer;
    try {
        const docObj = buildDoc({ text, patient, fecha });
        buffer = await Packer.toBuffer(docObj);
    } catch (e) {
        return res.status(500).json({ error: 'Error generando DOCX: ' + e.message });
    }

    const safe = (patient.nombre || 'paciente').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="informe_uroatlas_${safe}.docx"`);
    res.send(buffer);
}
