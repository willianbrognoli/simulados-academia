'use strict';
// Checagens das regras puras (não precisam de banco): node --test test/
const test = require('node:test');
const assert = require('node:assert');
const { corrigir, normalizarRegras, duracaoSeg } = require('../lib/simulados');
const { validarQuestao, lerCSV } = require('../lib/importar');

test('correção: múltipla escolha não desconta; certo/errado desconta com erro_anula', () => {
  const itens = new Map([
    [1, { gabarito: 'B', formato: 'ME5', materia: 'Português', tema: 'Crase' }],
    [2, { gabarito: 'C', formato: 'CE', materia: 'Penal', tema: 'Legítima defesa' }],
    [3, { gabarito: 'E', formato: 'CE', materia: 'Penal', tema: 'Legítima defesa' }],
    [4, { gabarito: 'A', formato: 'ME5', materia: 'Português', tema: 'Crase' }],
  ]);
  const resp = { 1: 'B', 2: 'E', 3: 'E', 4: 'C' };
  const sem = corrigir([1, 2, 3, 4], resp, itens, normalizarRegras({}));
  assert.deepStrictEqual([sem.certos, sem.errados, sem.brancos, sem.nota], [2, 2, 0, 2]);
  const com = corrigir([1, 2, 3, 4], resp, itens, normalizarRegras({ erro_anula: true }));
  assert.strictEqual(com.nota, 1); // 2 certos − 1 erro em item CE (o erro em ME não desconta)
  assert.deepStrictEqual(com.porMateria['Penal'], { materia: 'Penal', total: 2, certos: 1, errados: 1, brancos: 0 });
});

test('duração padrão: 3 min por questão, mínimo 30 min', () => {
  assert.strictEqual(duracaoSeg(normalizarRegras({}), 50), 150 * 60);
  assert.strictEqual(duracaoSeg(normalizarRegras({}), 4), 30 * 60);
  assert.strictEqual(duracaoSeg(normalizarRegras({ duracao_min: 240 }), 60), 240 * 60);
});

test('validação de questão', () => {
  const ok = { id: 'x-2023-q1', origem: { ano: 2023 }, formato: 'ME4', enunciado: 'E?', materia: 'Português', alternativas: { A: '1', B: '2', C: '3', D: '4' }, gabarito: 'D' };
  assert.deepStrictEqual(validarQuestao(ok), []);
  assert.ok(validarQuestao({ ...ok, gabarito: 'E' }).length);
  assert.ok(validarQuestao({ ...ok, formato: 'ME5' }).length);
  assert.deepStrictEqual(validarQuestao({ ...ok, formato: 'CE', alternativas: null, gabarito: 'C' }), []);
});

test('CSV com ; e aspas', () => {
  const r = lerCSV('id;obs\r\na-1;"texto; com ponto e vírgula"\n');
  assert.deepStrictEqual(r, [{ id: 'a-1', obs: 'texto; com ponto e vírgula' }]);
});
