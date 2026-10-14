'use strict';
// Matérias de partida (nota 08 do vault: taxonomia da LP de Belém + matérias que aparecem nas provas de GCM).
// O importador cria sozinho qualquer matéria nova que vier nos JSON; esta lista só garante nome, eixo e ordem.

const slug = s => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const EIXOS = ['Base de fogo', 'Frente legal', 'Eixo operacional GCM', 'Realidade local', 'Outras'];

const M = (nome, eixo, temas = []) => ({ slug: slug(nome), nome, eixo, temas });
// Taxonomia aprovada em 14/10/2026 (docx "Matérias e temas"): 21 matérias, temas por matéria.
const MATERIAS_PADRAO = [
  M("Língua Portuguesa", 'Base de fogo', ["Interpretação de texto", "Tipos e gêneros textuais", "Ortografia, acentuação e hífen", "Fonologia (sílabas, dígrafos, encontros)", "Classes de palavras", "Verbos (tempos, modos e vozes)", "Concordância verbal e nominal", "Regência e crase", "Colocação pronominal", "Termos da oração (sujeito, predicado, complementos)", "Período composto e conjunções", "Pontuação", "Semântica e figuras de linguagem", "Coesão, conectivos e reescrita", "Formação de palavras"]),
  M("Matemática", 'Base de fogo', ["Operações, frações e expressões numéricas", "MMC, MDC e divisibilidade", "Razão, proporção e regra de três", "Porcentagem", "Juros simples e compostos", "Equações e sistemas", "Funções", "Sequências, PA e PG", "Geometria plana e espacial", "Unidades de medida", "Estatística e médias", "Probabilidade e contagem"]),
  M("Raciocínio Lógico", 'Base de fogo', ["Proposições e conectivos", "Negações e equivalências", "Argumentos e silogismos", "Conjuntos e diagramas de Venn", "Sequências e padrões", "Associação e ordenação", "Problemas lógicos (verdades e mentiras, idades)"]),
  M("Informática", 'Base de fogo', ["Hardware e conceitos básicos", "Windows", "Linux", "Editores de texto (Word, Writer)", "Planilhas (Excel, Calc)", "Internet e navegadores", "Correio eletrônico", "Segurança da informação", "Nuvem e redes"]),
  M("Conhecimentos Gerais e Atualidades", 'Base de fogo', ["Atualidades (política, economia, mundo)", "História do Brasil", "Geografia do Brasil", "Meio ambiente e sustentabilidade", "Cultura, esportes e personalidades"]),
  M("Direito Constitucional", 'Frente legal', ["Princípios fundamentais", "Direitos e garantias individuais (art. 5º)", "Remédios constitucionais", "Direitos sociais", "Nacionalidade e direitos políticos", "Organização do Estado e Municípios", "Administração Pública na Constituição", "Poderes da República", "Segurança Pública (art. 144)", "Defesa do Estado (estado de defesa e de sítio)"]),
  M("Direito Administrativo", 'Frente legal', ["Princípios da Administração Pública", "Organização administrativa", "Poderes administrativos e poder de polícia", "Atos administrativos", "Agentes públicos", "Improbidade administrativa", "Licitações e contratos", "Serviços e bens públicos", "Responsabilidade civil do Estado", "Processo administrativo disciplinar"]),
  M("Direito Penal", 'Frente legal', ["Aplicação da lei penal", "Teoria do crime (dolo, culpa, tentativa)", "Excludentes de ilicitude", "Imputabilidade e concurso de pessoas", "Penas", "Crimes contra a pessoa e a honra", "Crimes contra o patrimônio", "Crimes contra a Administração Pública"]),
  M("Direito Processual Penal", 'Frente legal', ["Inquérito policial", "Prisão em flagrante", "Prisões cautelares e liberdade provisória", "Busca e apreensão", "Provas, corpo de delito e cadeia de custódia", "Ação penal e competência", "Juizados Especiais Criminais"]),
  M("Legislação Penal Especial", 'Frente legal', ["Lei Maria da Penha", "Abuso de autoridade", "Lei de Drogas", "Crimes hediondos e tortura", "Crimes ambientais", "Estatuto da Pessoa Idosa", "Estatuto da Pessoa com Deficiência", "Racismo e igualdade racial"]),
  M("Estatuto Geral das Guardas Municipais", 'Eixo operacional GCM', ["Natureza, criação e denominação", "Princípios mínimos de atuação", "Competências da guarda", "Requisitos, capacitação e carreira", "Controle: corregedoria e ouvidoria", "Prerrogativas e porte de arma", "Uso progressivo da força", "Casos práticos de atuação"]),
  M("Legislação de Trânsito", 'Eixo operacional GCM', ["Sistema Nacional de Trânsito e competências", "Normas de circulação e conduta", "Sinalização", "Infrações, penalidades e medidas administrativas", "Habilitação", "Veículos e documentação", "Crimes de trânsito", "Pedestres, ciclistas e motociclistas"]),
  M("Direitos Humanos", 'Eixo operacional GCM', ["Conceito, características e gerações", "Declaração Universal dos Direitos Humanos", "Tratados e sistemas de proteção", "Grupos vulneráveis e discriminação", "Direitos humanos na atuação policial"]),
  M("Estatuto do Desarmamento", 'Eixo operacional GCM', ["Registro e Sinarm", "Posse e porte", "Porte para guardas municipais", "Crimes e penas"]),
  M("Estatuto da Criança e do Adolescente", 'Eixo operacional GCM', ["Princípios e direitos fundamentais", "Prevenção, viagens e acesso a locais", "Medidas de proteção", "Ato infracional e apreensão", "Medidas socioeducativas", "Conselho Tutelar", "Crimes e infrações administrativas"]),
  M("Segurança Pública e Defesa Civil", 'Eixo operacional GCM', ["Sistema Único de Segurança Pública (Lei 13.675/2018)", "Defesa civil", "Procedimentos em ocorrências", "Prevenção e combate a incêndio"]),
  M("Primeiros Socorros e Segurança do Trabalho", 'Eixo operacional GCM', ["Avaliação da vítima e sinais vitais", "Reanimação cardiopulmonar", "Hemorragias e estado de choque", "Fraturas, queimaduras e engasgo", "EPI e acidentes de trabalho"]),
  M("Ética e Atendimento ao Público", 'Eixo operacional GCM', ["Ética profissional e no serviço público", "Atendimento ao cidadão", "Relações humanas e trabalho em equipe", "Postura e conduta do guarda"]),
  M("História e Geografia Local", 'Realidade local', ["História e fundação do município", "Geografia e dados do município", "Economia local", "Símbolos, cultura e turismo", "História e geografia do estado"]),
  M("Legislação Municipal", 'Realidade local', ["Lei Orgânica: poderes e competências do município", "Estatuto dos servidores: provimento e estabilidade", "Estatuto dos servidores: direitos e vantagens", "Estatuto dos servidores: deveres e regime disciplinar", "Lei da Guarda local: estrutura, carreira e disciplina", "Código de Posturas", "Plano diretor e outras leis"]),
];

module.exports = { slug, EIXOS, MATERIAS_PADRAO };
