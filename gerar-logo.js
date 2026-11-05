// Gera a logo da calculadora (SVG com texto em contorno + PNGs)
const opentype = require('opentype.js');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = process.argv[2];
const NOME_A = 'ORÇA', NOME_B = 'TOP';
const C = { fundo: '#1C2228', branco: '#FFFFFF', trena: '#F5B800' };
fs.mkdirSync(OUT, { recursive: true });

const font = opentype.loadSync(path.join(__dirname, 'node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff'));

// nome em duas cores, centralizado em cx, com a base da letra em y
function wordmark(cx, y, size, corA, corB, tracking = 0.02) {
  const adv = s => font.getAdvanceWidth(s, size) + tracking * size * (s.length - 1);
  const gap = tracking * size;
  const total = adv(NOME_A) + gap + adv(NOME_B);
  let x = cx - total / 2;
  const parts = [];
  for (const [txt, cor] of [[NOME_A, corA], [NOME_B, corB]]) {
    let d = '';
    for (const ch of txt) {
      d += font.getPath(ch, x, y, size).toPathData(2);
      x += font.getAdvanceWidth(ch, size) + gap;
    }
    parts.push(`<path fill="${cor}" d="${d}"/>`);
  }
  return parts.join('');
}

// Ícone: a folha do orçamento. Mesma lógica da lupa da BuscaTop:
// traço grosso branco, um trecho de destaque separado por cortes (a dobra do canto),
// e um símbolo dentro: linhas de itens que terminam na linha do total, em destaque.
function icone(corTraco, corDestaque) {
  const w = 30; // espessura do traço
  return `
  <g fill="none" stroke-width="${w}" stroke-linejoin="round">
    <path stroke="${corTraco}" stroke-linecap="butt" d="M640 498 V580 A20 20 0 0 1 620 600 H460 A20 20 0 0 1 440 580 V370 A20 20 0 0 1 460 350 H566"/>
    <path stroke="${corDestaque}" stroke-linecap="butt" d="M590 350 L640 400 V474"/>
  </g>
  <g fill="none" stroke-linecap="round">
    <path stroke="${corTraco}" stroke-width="18" d="M494 430 H536 M568 430 H586 M494 478 H524 M568 478 H586"/>
    <path stroke="${corDestaque}" stroke-width="24" d="M494 540 H586"/>
  </g>`;
}

function svg({ fundo, traco, destaque, nomeA, nomeB, comNome = true, viewBox = '0 0 1080 1080' }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="1080" height="1080">
  ${fundo ? `<rect width="1080" height="1080" fill="${fundo}"/>` : ''}
  ${icone(traco, destaque)}
  ${comNome ? wordmark(540, 748, 96, nomeA, nomeB) : ''}
</svg>`;
}

const versoes = {
  'orcatop-escuro': svg({ fundo: C.fundo, traco: C.branco, destaque: C.trena, nomeA: C.branco, nomeB: C.trena }),
  // no fundo claro o amarelo some no texto: o nome fica todo grafite e o amarelo só no ícone
  'orcatop-claro': svg({ fundo: '#FFFFFF', traco: C.fundo, destaque: C.trena, nomeA: C.fundo, nomeB: C.fundo }),
  'orcatop-transparente': svg({ fundo: null, traco: C.fundo, destaque: C.trena, nomeA: C.fundo, nomeB: C.fundo }),
  // só o ícone, recortado no quadrado do desenho (para favicon e app)
  'orcatop-icone': svg({ fundo: null, traco: C.branco, destaque: C.trena, comNome: false, viewBox: '400 310 280 330' }).replace('<svg ', '<svg ').replace(/<rect[^>]*\/>/, ''),
};
versoes['orcatop-icone'] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="112" fill="${C.fundo}"/>
  <g transform="translate(256 256) scale(1.05) translate(-540 -475)">${icone(C.branco, C.trena)}</g>
</svg>`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const [nome, conteudo] of Object.entries(versoes)) {
    fs.writeFileSync(path.join(OUT, nome + '.svg'), conteudo);
    const size = nome === 'orcatop-icone' ? 512 : 1080;
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:transparent">${conteudo}</body></html>`);
    await p.screenshot({ path: path.join(OUT, nome + '.png'), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  }
  await b.close();
  console.log('ok');
})();
