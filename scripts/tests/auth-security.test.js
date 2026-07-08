// scripts/tests/auth-security.test.js
//
// Tests de las funciones de seguridad de lib/auth.js (Fase 1 de la auditoría):
//   - emailAllowed: lista blanca de correos (ALLOWED_EMAILS).
//   - safeEqual: comparación en tiempo constante del PIN.
//   - safeNext (replicada): sanitización del redirect del login.
//
// Corre con: node scripts/tests/auth-security.test.js

import { _internal } from '../../lib/auth.js';

let pass = 0, fail = 0;
function check(name, cond) {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}`); }
}

const { emailAllowed, safeEqual } = _internal;

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nGRUPO A: lista blanca de correos (ALLOWED_EMAILS)');
// ─────────────────────────────────────────────────────────────────────────────
{
    process.env.ALLOWED_EMAILS = 'jcrieram@gmail.com, otro@clinica.cl';
    check('correo en lista pasa', emailAllowed('jcrieram@gmail.com') === true);
    check('correo en lista, case-insensitive', emailAllowed('JCRieraM@Gmail.com') === true);
    check('segundo correo de la lista pasa', emailAllowed('otro@clinica.cl') === true);
    check('correo ajeno se rechaza', emailAllowed('atacante@evil.com') === false);
    check('correo vacío se rechaza', emailAllowed('') === false);
    check('undefined se rechaza', emailAllowed(undefined) === false);
}
{
    // Sin la env var → permite cualquiera (compat hacia atrás, con warning).
    delete process.env.ALLOWED_EMAILS;
    check('sin ALLOWED_EMAILS permite cualquiera (compat)', emailAllowed('quien@sea.com') === true);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nGRUPO B: comparación constant-time del PIN');
// ─────────────────────────────────────────────────────────────────────────────
{
    check('PIN igual → true', safeEqual('1234', '1234') === true);
    check('PIN distinto mismo largo → false', safeEqual('1234', '9999') === false);
    check('PIN distinto largo → false', safeEqual('1234', '123456') === false);
    check('vacío vs vacío → true', safeEqual('', '') === true);
    check('no-string → false', safeEqual(null, '1234') === false);
    check('undefined → false', safeEqual(undefined, undefined) === false);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nGRUPO C: sanitización del redirect (safeNext)');
// ─────────────────────────────────────────────────────────────────────────────
// Réplica exacta de la función en portal/login.html para probar la lógica.
function safeNext(raw) {
    const v = raw || '/portal/';
    if (/^\/(?!\/)/.test(v) && !v.includes('\\')) return v;
    return '/portal/';
}
{
    check('ruta interna simple pasa', safeNext('/uroatlas/') === '/uroatlas/');
    check('ruta interna con query pasa', safeNext('/consulta/?x=1') === '/consulta/?x=1');
    check('URL externa https se bloquea', safeNext('https://evil.com') === '/portal/');
    check('protocol-relative //evil se bloquea', safeNext('//evil.com') === '/portal/');
    check('javascript: se bloquea', safeNext('javascript:alert(1)') === '/portal/');
    check('backslash-trick /\\evil se bloquea', safeNext('/\\evil.com') === '/portal/');
    check('vacío → default', safeNext('') === '/portal/');
    check('null → default', safeNext(null) === '/portal/');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass}/${pass + fail} pasaron\x1b[0m`);
process.exit(fail === 0 ? 0 : 1);
