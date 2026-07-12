import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRut } from '../lib/rut.js';

test('formatea RUT sin puntos', () => {
    assert.equal(formatRut('12345678-9'), '12.345.678-9');
});

test('respeta RUT ya formateado', () => {
    assert.equal(formatRut('12.345.678-9'), '12.345.678-9');
});

test('extrae RUT rodeado de palabras (caso Ruth)', () => {
    assert.equal(formatRut('Ruth 12 345 678 9'), '12.345.678-9');
});

test('dígito verificador K en mayúscula', () => {
    assert.equal(formatRut('12345678k'), '12.345.678-K');
});

test('cuerpo de 7 dígitos', () => {
    assert.equal(formatRut('7654321-0'), '7.654.321-0');
});

test('cadena vacía devuelve vacío', () => {
    assert.equal(formatRut(''), '');
});

test('texto sin dígitos devuelve vacío', () => {
    assert.equal(formatRut('no mencionado'), '');
});

test('menos de 7 caracteres útiles devuelve vacío', () => {
    assert.equal(formatRut('123'), '');
});

test('entrada nula/no-string devuelve vacío', () => {
    assert.equal(formatRut(null), '');
    assert.equal(formatRut(undefined), '');
});
