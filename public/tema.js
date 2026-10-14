// carregado no <head> (síncrono) para aplicar o tema antes de pintar a página
try {
  var t = localStorage.getItem('tema') || (matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'escuro');
  if (t === 'claro') document.documentElement.dataset.tema = 'claro';
} catch (e) {}
