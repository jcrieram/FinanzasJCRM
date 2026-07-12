// Limpia y formatea un RUT chileno a la forma 12.345.678-9.
// Reconoce el RUT por su formato numérico: extrae solo dígitos y el
// dígito verificador (0-9 o K), ignorando palabras alrededor (útil cuando
// la transcripción escribe "Ruth", "cédula", "carnet", etc.).
// Devuelve '' si no hay un RUT plausible.
export function formatRut(raw) {
    if (typeof raw !== 'string') return '';
    // Conserva solo dígitos y K/k; descarta todo lo demás.
    const cleaned = raw.replace(/[^0-9kK]/g, '').toUpperCase();
    // RUT chileno: cuerpo de 6-8 dígitos + verificador => 7-9 caracteres.
    if (cleaned.length < 7 || cleaned.length > 9) return '';
    const body = cleaned.slice(0, -1);
    const dv = cleaned.slice(-1);
    // El cuerpo debe ser solo dígitos (la K solo es válida como verificador).
    if (!/^\d+$/.test(body)) return '';
    const bodyWithDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${bodyWithDots}-${dv}`;
}
