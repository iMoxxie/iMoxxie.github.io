// Testes do OrçaTop combinado (2026-11-01): contas, cadastro, recibo, lembrete, PDF,
// backup, importação da v1, modo "nuvem" simulado, celular e tema escuro.
// Rodar: NODE_PATH=<pasta com playwright>/node_modules node testes/teste-orcatop.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const APP = 'file://' + path.resolve(__dirname, '..', 'OrçaTop.html').split('/').map(encodeURIComponent).join('/').replace(/%3A/g, ':');
const OUT = path.join(process.env.TEST_OUT || __dirname, 'out-orcatop');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
execSync(`magick -size 400x140 xc:"#20281F" -fill "#A9762F" -draw "rectangle 20,20 120,120" -fill white -pointsize 40 -draw "text 150,85 'LOGO'" "${OUT}/logo.png"`);

const results = [];
function check(name, ok, detail = '') { results.push({ name, ok }); console.log((ok ? 'OK    ' : 'FALHA ') + name + (detail ? '  -> ' + detail : '')); }
const pages = p => parseInt(execSync(`pdfinfo "${p}"`).toString().match(/Pages:\s+(\d+)/)[1], 10);
const txt = (page, sel) => page.textContent(sel).then(s => (s || '').replace(/\s+/g, ' ').trim());

async function download(page, click) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), click()]);
  const p = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(p);
  return p;
}
async function act(page, act, arg) {
  // navegação direto pela função (nem toda tela tem botão para todo lugar)
  if (act === 'go') { const [n, p] = String(arg).split(':'); await page.evaluate(([n, p]) => go(n, p), [n, p]); return; }
  // sem arg = o botão "novo" (sem data-arg); arg começando com "$" = termina com
  const sel = arg === undefined ? `[data-act="${act}"]:not([data-arg])`
    : String(arg).startsWith('$') ? `[data-act="${act}"][data-arg$="${String(arg).slice(1)}"]`
    : `[data-act="${act}"][data-arg="${arg}"]`;
  await page.locator(sel).first().click();
}
async function typeTime(page, prefix, h, m) { await page.fill(`#${prefix}-h`, h); await page.fill(`#${prefix}-m`, m); await page.dispatchEvent(`#${prefix}-m`, 'input'); }
async function noHScroll(page) { return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1); }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto(APP);
  await page.waitForSelector('.big-action');
  check('abre como arquivo, em modo local', (await txt(page, '.mode-note')).includes('só neste navegador'));

  // ---------- configurações ----------
  await act(page, 'go', 'config');
  await page.setInputFiles('#cfg-logo-file', path.join(OUT, 'logo.png'));
  await page.waitForSelector('#cfg-logo-box img');
  await page.fill('#cfg-nome', 'Oficina "Teste" <Ltda>');
  await page.fill('#cfg-cnpj', '12.345.678/0001-90');
  await page.fill('#cfg-telefone', '48988887777');
  check('máscara de telefone', (await page.inputValue('#cfg-telefone')) === '(48) 98888-7777');
  await page.fill('#cfg-cidade', 'Florianópolis'); await page.fill('#cfg-estado', 'sc');
  await page.fill('#cfg-pix', 'pix@oficina.com');
  await page.fill('#cfg-obs', 'Pagamento: 50% de entrada.');
  for (const id of ['cfg-mostrar-pix', 'cfg-mostrar-endereco', 'cfg-assinatura-empresa', 'cfg-assinatura-cliente']) await page.check('#' + id);
  await act(page, 'cfgSalvar');
  await page.waitForSelector('.big-action.primary');
  await page.waitForFunction(() => document.querySelector('.topbar').textContent.includes('Oficina'), null, { timeout: 5000 }).catch(() => {});
  check('empresa salva aparece no início', (await txt(page, '.topbar')).includes('Oficina "Teste" <Ltda>'));

  // ---------- novo orçamento ----------
  await act(page, 'novo');
  await page.fill('#f-cliente-nome', "José \"Zé\" D'Ávila <Silva>");
  await page.dispatchEvent('#f-cliente-nome', 'input');
  await page.fill('#f-cliente-tel', '48999998888');
  check('observação padrão já vem preenchida', (await page.inputValue('#f-descricao')) === 'Pagamento: 50% de entrada.');

  // serviço fixo com descrição, salvo no catálogo (valor digitado com vírgula)
  await act(page, 'servAbrir');
  await page.fill('#s-titulo', 'Troca de "tomada"');
  await page.fill('#s-desc', 'Troca de 3 tomadas na cozinha');
  await page.fill('#s-valor', '150,50'); await page.dispatchEvent('#s-valor', 'input');
  await page.check('#s-salvar-lista');
  check('valor com vírgula (150,50) é entendido', (await txt(page, '#s-total')) === 'R$ 150,50');
  await act(page, 'servConfirmar');

  // por hora, início e fim: 08:00–12:30, pausa 30 => 4h x 80 = 320
  await act(page, 'servAbrir', 'hora');
  await typeTime(page, 's-inicio', '08', '00'); await typeTime(page, 's-fim', '12', '30');
  await page.fill('#s-pausa', '30'); await page.fill('#s-preco-hora', '80'); await page.dispatchEvent('#s-preco-hora', 'input');
  check('hora por início e fim: 4h x 80 = 320,00', (await txt(page, '#s-tempo')) === '04:00' && (await txt(page, '#s-total')) === 'R$ 320,00');
  await act(page, 'servConfirmar');

  // por hora, estimado: 3,5h x 80 = 280
  await act(page, 'servAbrir', 'hora');
  await page.fill('#s-titulo', 'Instalação de luminária');
  await act(page, 'servHModo', 'estimado');
  await page.fill('#s-horas', '3,5'); await page.fill('#s-preco-hora', '80'); await page.dispatchEvent('#s-preco-hora', 'input');
  check('horas estimadas: 3,5h x 80 = 280,00', (await txt(page, '#s-total')) === 'R$ 280,00');
  await act(page, 'servConfirmar');

  // materiais com margem
  const addMat = async (nome, qtd, un, valor, tipo, margem, cat) => {
    await act(page, 'matAbrir');
    await page.fill('#m-titulo', nome); await page.fill('#m-qtd', qtd); await page.fill('#m-unidade', un); await page.fill('#m-valor', valor);
    if (tipo) { await page.check('#m-margem-on'); await page.selectOption('#m-margem-tipo', tipo); await page.fill('#m-margem-valor', margem); }
    await page.dispatchEvent('#m-valor', 'input');
    if (cat) await page.check('#m-salvar-lista');
    const t = await txt(page, '#m-total');
    await act(page, 'matConfirmar');
    return t;
  };
  check('margem 10%: 3 x 11,11 = 33,33', (await addMat('Tomada 10A', '3', 'und', '10,10', 'pct', '10', true)) === 'R$ 33,33');
  check('margem 10% e qtd fracionada: 2,5 x 7,70 = 19,25', (await addMat('Fio 2,5mm', '2,5', 'm', '7', 'pct', '10')) === 'R$ 19,25');
  check('margem fixa: 2 x (25 + 5) = 60,00', (await addMat('Disjuntor 20A', '2', 'und', '25', 'fixo', '5')) === 'R$ 60,00');
  await page.waitForTimeout(300);
  check('total no formulário = 863,08', (await txt(page, '#f-total')) === 'R$ 863,08', await txt(page, '#f-total'));
  check('prévia ao vivo mostra o total', (await txt(page, '#side-frame .tl.grand')).includes('R$ 863,08'));
  check('prévia escapa aspas e < > do nome', (await txt(page, '#side-frame .to .name')) === "José \"Zé\" D'Ávila <Silva>");
  check('margem não aparece para o cliente (unitário final 11,11)', (await txt(page, '#side-frame')).includes('R$ 11,11') && !(await txt(page, '#side-frame')).includes('margem'));
  await page.screenshot({ path: path.join(OUT, '01-form-desktop.png'), fullPage: false });

  await act(page, 'formSalvar');
  await page.waitForSelector('#d-status');
  const numero = (await txt(page, '.topbar h1')).replace('Nº ', '');
  const ym = new Date().getFullYear() + String(new Date().getMonth() + 1).padStart(2, '0');
  check('número automático AAAAMM-1', numero === ym + '-1', numero);
  check('cliente novo entrou no cadastro com telefone', (await txt(page, '.card .sub')).includes('(48) 99999-8888'));
  check('botão de WhatsApp com 55 + DDD', (await page.getAttribute('.btn-wa', 'href')) === 'https://wa.me/5548999998888');

  // PDF do orçamento
  const pdf1 = await download(page, () => act(page, 'pdf', '$:orcamento'));
  check('PDF do orçamento: 1 página', pages(pdf1) === 1, pdf1);
  execSync(`pdftoppm -png -r 70 "${pdf1}" "${OUT}/pdf-orcamento"`);

  // recibo
  await page.locator('[data-act="reciboAbrir"]').first().click();
  check('recibo sugere o saldo', (await page.inputValue('#r-valor')) === '863,08');
  await page.fill('#r-valor', '300');
  const pdfR = await download(page, () => page.locator('[data-act="reciboConfirmar"]').click());
  execSync(`pdftoppm -png -r 70 "${pdfR}" "${OUT}/pdf-recibo"`);
  await page.waitForTimeout(300);
  const resumo = await txt(page, '.main');
  check('recebido 300,00 e a receber 563,08', /Recebido\s*R\$ 300,00/.test(resumo) && /A receber\s*R\$ 563,08/.test(resumo));

  // lembrete atrasado (ontem 09:15) e conferência do horário ao reabrir
  const ontem = new Date(Date.now() - 86400000); const p = n => String(n).padStart(2, '0');
  const val = `${ontem.getFullYear()}-${p(ontem.getMonth() + 1)}-${p(ontem.getDate())}T09:15`;
  await page.locator('[data-act="lembreteAbrir"]').first().click();
  await page.fill('#l-data', val); await page.fill('#l-desc', 'Ligar para o "Zé"');
  await page.locator('[data-act="lembreteSalvar"]').click();
  await page.waitForSelector('.reminder.late');
  await page.locator('[data-act="lembreteAbrir"]').click();
  check('lembrete reabre com o mesmo horário (sem pular 3h)', (await page.inputValue('#l-data')) === val, await page.inputValue('#l-data'));
  await act(page, 'close');

  // etapa
  await page.selectOption('#d-status', 'aprovado');
  await page.waitForTimeout(200);
  check('mudar etapa atualiza o selo', (await txt(page, '.topbar .pill')) === 'Aprovado');
  // desde 2026-11-05 aprovar pergunta "Marcar na agenda?"; aqui a resposta é não
  await page.waitForSelector('#confirm-overlay'); await page.click('#confirm-overlay [data-no]');

  // duplicar e excluir a cópia (confirmação dentro da página)
  await page.locator('[data-act="duplicar"]').first().click();
  await page.waitForFunction(n => document.querySelector('.topbar h1').textContent.includes(n), ym + '-2');
  check('duplicar cria nº AAAAMM-2', true);
  await page.locator('[data-act="orcExcluir"]').first().click();
  await page.click('#confirm-overlay [data-yes]');
  await page.waitForSelector('.orc-card');
  await page.waitForFunction(() => document.querySelectorAll('.orc-card').length === 1, null, { timeout: 5000 }).catch(() => {});
  check('excluir com confirmação na página', (await page.locator('.orc-card').count()) === 1);

  // início: lembrete atrasado aparece
  await act(page, 'go', 'home');
  check('lembrete atrasado aparece no início', (await page.locator('.rem-item').count()) === 1);

  // recarregar: dados continuam
  await page.reload(); await page.waitForSelector('.big-action');
  await act(page, 'go', 'lista');
  check('orçamento continua depois de recarregar', (await txt(page, '.orc-card')).includes('R$ 863,08'));
  await act(page, 'filtro', 'perdido');
  check('filtro por etapa', (await page.locator('.orc-card').count()) === 0);
  await act(page, 'filtro', 'todos');

  // calculadora rápida: 08:00–17:00, pausa 60 => 8h x 50 = 400; cliente com apóstrofo pelo autocompletar
  await act(page, 'go', 'home'); await act(page, 'go', 'calc');
  await typeTime(page, 'c-inicio', '08', '00'); await typeTime(page, 'c-fim', '17', '00');
  await page.fill('#c-pausa', '60'); await page.fill('#c-preco', '50'); await page.dispatchEvent('#c-preco', 'input');
  check('calculadora rápida: 8h x 50 = 400,00', (await txt(page, '#c-tempo')) === '08:00' && (await txt(page, '#c-valor')) === 'R$ 400,00');
  await act(page, 'calcSalvar');
  await page.fill('#m-cliente-nome', "D'Á"); await page.dispatchEvent('#m-cliente-nome', 'input');
  await page.locator('.autoitem').first().click();
  check('autocompletar com apóstrofo funciona', (await page.inputValue('#m-cliente-id')).length > 3);
  await act(page, 'calcConfirmar');
  await page.waitForSelector('#d-status');
  check('cálculo salvo como finalizado no mesmo cliente', (await txt(page, '.topbar .pill')) === 'Finalizado' && (await txt(page, '.main')).includes('R$ 400,00'));

  // catálogo: aparece e preenche o valor
  await act(page, 'go', 'home'); await act(page, 'go', 'catalogo');
  check('catálogo guardou serviço e material', (await txt(page, '.content')).includes('Troca de "tomada"') && (await txt(page, '.content')).includes('Tomada 10A'));
  await act(page, 'go', 'home'); await act(page, 'novo');
  await act(page, 'servAbrir');
  await page.fill('#s-titulo', 'troca'); await page.dispatchEvent('#s-titulo', 'input');
  await page.locator('#s-sugestoes .autoitem').first().click();
  check('sugestão do catálogo preenche valor e descrição', (await page.inputValue('#s-valor')) === '150,5' && (await page.inputValue('#s-desc')).includes('cozinha'));
  await act(page, 'close');

  // orçamento grande: 45 materiais => mais de uma página
  await page.fill('#f-cliente-nome', 'Cliente Grande'); await page.dispatchEvent('#f-cliente-nome', 'input');
  await page.evaluate(() => { for (let i = 1; i <= 45; i++) FORM.materiais.push({ id: 'x' + i, titulo: 'Item de teste ' + i, unidade: 'und', quantidade: 1, valorUnit: 10, margemTipo: null, margemValor: 0, valorTotal: 10 }); renderFormMateriais(); });
  await act(page, 'formSalvar'); await page.waitForSelector('#d-status');
  const pdfG = await download(page, () => act(page, 'pdf', '$:orcamento'));
  check('PDF de 45 itens tem 2+ páginas', pages(pdfG) >= 2, pages(pdfG) + ' páginas');
  execSync(`pdftoppm -png -r 50 "${pdfG}" "${OUT}/pdf-grande"`);

  // backup
  await act(page, 'go', 'home'); await act(page, 'go', 'config');
  const bk = await download(page, () => act(page, 'backup'));
  const bkData = JSON.parse(fs.readFileSync(bk, 'utf8'));
  check('backup tem 3 orçamentos e a empresa', Object.keys(bkData.dados.orcamentos).length === 3 && bkData.dados.config.empresa.nomeEmpresa.includes('Oficina'));
  check('nenhum erro de JavaScript (computador)', errors.length === 0, errors.join(' | '));

  // ---------- navegador limpo: restaurar 2x e importar v1 ----------
  const ctx2 = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const p2 = await ctx2.newPage();
  const v1 = { empresa: { nome: 'Antiga', contato: '(48) 3333-4444', logoId: null }, logos: {}, catalogo: { servicos: [{ name: 'Pintura', desc: '', price: 200 }], materiais: [] },
    historico: [{ id: 'orc-1', numero: '0001', cliente: 'Maria', total: 233.33, salvoEm: '2026-10-28T12:00:00.000Z', geradoEm: '28/10/2026',
      dados: { cliente: { nome: 'Maria', telefone: '(48) 91111-2222', email: '', endereco: '' }, numero: '0001', modo: 'servico', servicos: [{ name: 'Pintura', desc: 'Sala', price: 200 }],
        hora: { descricao: '', horas: 0, valor: 0 }, materiais: [{ desc: 'Tinta', unit: 'L', qty: 3, price: 10.10 }], margem: { ativa: true, pct: 10 }, observacoes: 'Obs antiga' } }] };
  await p2.addInitScript(d => { if (!localStorage.getItem('calcOrcamento.v1')) localStorage.setItem('calcOrcamento.v1', d); }, JSON.stringify(v1));
  await p2.goto(APP); await p2.waitForSelector('.big-action');
  await act(p2, 'go', 'config');
  await act(p2, 'importarV1');
  await p2.waitForSelector('.orc-card');
  check('importa a calculadora antiga (200 + 3 x 11,11 = 233,33)', (await txt(p2, '.orc-card')).includes('R$ 233,33'));
  await act(p2, 'go', 'home'); await act(p2, 'go', 'config');
  await p2.setInputFiles('#cfg-restore', bk); await p2.waitForTimeout(800);
  await p2.setInputFiles('#cfg-restore', bk); await p2.waitForTimeout(800);
  const n2 = await p2.evaluate(() => Object.keys(STATE.orcamentos).length);
  check('restaurar backup 2x não duplica (1 + 3 = 4)', n2 === 4, String(n2));

  // ---------- celular ----------
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pm = await mob.newPage();
  await pm.goto(APP); await pm.waitForSelector('.big-action');
  await pm.evaluate(d => { /* usa o backup */ }, null);
  await act(pm, 'go', 'config'); await pm.setInputFiles('#cfg-restore', bk); await pm.waitForTimeout(800);
  await act(pm, 'go', 'home');
  await pm.screenshot({ path: path.join(OUT, '10-mobile-inicio.png') });
  let okMob = await noHScroll(pm);
  await act(pm, 'go', 'lista'); okMob = okMob && await noHScroll(pm);
  await pm.screenshot({ path: path.join(OUT, '11-mobile-lista.png') });
  await pm.locator('.orc-card').last().click(); await pm.waitForSelector('#d-status');
  okMob = okMob && await noHScroll(pm);
  await pm.screenshot({ path: path.join(OUT, '12-mobile-detalhe.png'), fullPage: true });
  await act(pm, 'go', 'form:' + await pm.evaluate(() => VIEW.param));
  okMob = okMob && await noHScroll(pm);
  await pm.screenshot({ path: path.join(OUT, '13-mobile-form.png') });
  await act(pm, 'servAbrir', 'hora');
  await pm.screenshot({ path: path.join(OUT, '14-mobile-servico.png') });
  await act(pm, 'close');
  await act(pm, 'verPrevia'); await pm.waitForTimeout(400);
  await pm.screenshot({ path: path.join(OUT, '15-mobile-previa.png') });
  okMob = okMob && await noHScroll(pm);
  check('celular 390px: sem rolagem lateral (início, lista, detalhe, formulário, prévia)', okMob);

  // ---------- tema escuro ----------
  const dark = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 });
  const pd = await dark.newPage();
  await pd.goto(APP); await pd.waitForSelector('.big-action');
  await act(pd, 'go', 'config'); await pd.setInputFiles('#cfg-restore', bk); await pd.waitForTimeout(800);
  await act(pd, 'go', 'home'); await pd.screenshot({ path: path.join(OUT, '20-dark-inicio.png') });
  await act(pd, 'go', 'relatorios'); await pd.screenshot({ path: path.join(OUT, '21-dark-relatorios.png') });
  check('tema escuro: fundo escuro', await pd.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(19, 23, 26)');

  // ---------- modo "nuvem" simulado (window.claude) ----------
  const cl = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pc = await cl.newPage();
  const cErr = []; pc.on('pageerror', e => cErr.push(e.message));
  await pc.addInitScript(() => {
    window.__saved = [];
    window.claude = { use: async n => {
      await new Promise(r => setTimeout(r, 50));
      if (n === 'db') return createLocalDb();
      if (n === 'downloads') return { save: async ({ filename, data }) => { window.__saved.push(filename + ':' + (data.size || data.length)); return { status: 'saved' }; } };
      return null;
    } };
  });
  await pc.goto(APP); await pc.waitForSelector('.big-action');
  check('modo nuvem detectado', (await txt(pc, '.mode-note')).includes('nuvem do Claude'));
  await act(pc, 'go', 'config'); await pc.setInputFiles('#cfg-restore', bk); await pc.waitForTimeout(800);
  await act(pc, 'go', 'lista'); await pc.locator('.orc-card').last().click(); await pc.waitForSelector('#d-status');
  await act(pc, 'pdf', '$:orcamento');
  await pc.waitForFunction(() => window.__saved.length > 0, null, { timeout: 30000 });
  check('modo nuvem: PDF entregue pela janela de download do Claude', (await pc.evaluate(() => window.__saved[0])).startsWith('Orcamento_'));
  check('modo nuvem: sem erros de JavaScript', cErr.length === 0, cErr.join(' | '));

  await browser.close();
  const falhas = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - falhas}/${results.length} testes passaram. Imagens em ${OUT}`);
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
