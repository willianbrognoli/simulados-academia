'use strict';
// Matérias de partida (nota 08 do vault: taxonomia da LP de Belém + matérias que aparecem nas provas de GCM).
// O importador cria sozinho qualquer matéria nova que vier nos JSON; esta lista só garante nome, eixo e ordem.

const slug = s => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const EIXOS = ['Base de fogo', 'Frente legal', 'Eixo operacional GCM', 'Realidade local', 'Outras'];

const M = (nome, eixo) => ({ slug: slug(nome), nome, eixo });
const MATERIAS_PADRAO = [
  M('Língua Portuguesa', 'Base de fogo'),
  M('Raciocínio Lógico-Matemático', 'Base de fogo'),
  M('Matemática', 'Base de fogo'),
  M('Informática', 'Base de fogo'),
  M('Conhecimentos Gerais e Atualidades', 'Base de fogo'),
  M('Direito Constitucional', 'Frente legal'),
  M('Direito Administrativo', 'Frente legal'),
  M('Direito Penal', 'Frente legal'),
  M('Direito Processual Penal', 'Frente legal'),
  M('Estatuto Geral das Guardas Municipais', 'Eixo operacional GCM'),
  M('Legislação de Trânsito', 'Eixo operacional GCM'),
  M('Direitos Humanos', 'Eixo operacional GCM'),
  M('Legislação Especial', 'Eixo operacional GCM'),
  M('Estatuto do Desarmamento', 'Eixo operacional GCM'),
  M('Estatuto da Criança e do Adolescente', 'Eixo operacional GCM'),
  M('Segurança Pública e Defesa Civil', 'Eixo operacional GCM'),
  M('Realidades Municipais', 'Realidade local'),
  M('Lei Orgânica Municipal', 'Realidade local'),
  M('Estatuto dos Servidores Municipais', 'Realidade local'),
  M('Legislação Municipal', 'Realidade local'),
];

module.exports = { slug, EIXOS, MATERIAS_PADRAO };
