// Testes da agenda do OrçaTop (2026-11-05): datas, compromissos, backup, diária,
// tela da semana e do mês, serviço na agenda, cobranças e início.
// Rodar: NODE_PATH=<pasta com playwright>/node_modules node testes/teste-agenda.js
// O relógio é fixado em 05/11/2026 (quinta) no fuso de São Paulo, para os dias serem sempre os mesmos.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const APP = 'file://' + path.resolve(__dirname, '..', 'OrçaTop.html').split('/').map(encodeURIComponent).join('/').replace(/%3A/g, ':');
const OUT = path.join(process.env.TEST_OUT || __dirname, 'out-agenda');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = '') { results.push({ name, ok }); console.log((ok ? 'OK    ' : 'FALHA ') + name + (detail ? '  -> ' + detail : '')); }
const txt = (page, sel) => page.textContent(sel).then(s => (s || '').replace(/\s+/g, ' ').trim());
async function act(page, act, arg) {
  if (act === 'go') { const [n, p] = String(arg).split(':'); await page.evaluate(([n, p]) => go(n, p), [n, p]); return; }
  const sel = arg === undefined ? `[data-act="${act}"]:not([data-arg])`
    : String(arg).startsWith('$') ? `[data-act="${act}"][data-arg$="${String(arg).slice(1)}"]`
    : `[data-act="${act}"][data-arg="${arg}"]`;
  await page.locator(sel).first().click();
}
async function noHScroll(page) { return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1); }
async function download(page, click) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), click()]);
  const p = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(p);
  return p;
}
const tick = page => page.waitForTimeout(150);

let browser;
const ERRORS = [];
// contexto novo (navegador limpo), fuso de São Paulo, relógio fixo
async function abrir({ quando = '2026-11-05T10:00:00-03:00', viewport = { width: 1280, height: 900 }, colorScheme = 'light', mobile = false } = {}) {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport, colorScheme, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR',
    ...(mobile ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', e => ERRORS.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) ERRORS.push(m.text()); });
  await page.clock.setFixedTime(new Date(quando));
  await page.goto(APP);
  await page.waitForSelector('.big-action');
  return page;
}
// cria um orçamento direto no banco e devolve o id
async function criarOrc(page, extra = {}) {
  return page.evaluate(async extra => {
    const base = { numero: gerarNumeroOrcamento(), criadoEm: nowISO(), clienteId: '', clienteNome: 'Maria Souza', clienteTelefone: '',
      status: 'aprovado', descricaoAtividades: '', servicos: [{ id: uid(), titulo: 'Pintura sala', descricao: '', quantidade: 1, porHora: false, valorUnit: 500, valorTotal: 500 }],
      materiais: [], recibos: [], lembrete: null, garantiaDias: 90, validadeDias: 7, finalizadoEm: null, agenda: null };
    const r = await db.collection('orcamentos').add(Object.assign(base, extra));
    await new Promise(res => setTimeout(res, 50));
    return r.id;
  }, extra);
}

/* ---------------- Tarefa 1: datas, compromissos e backup ---------------- */
async function tarefa1() {
  const page = await abrir();
  const r = await page.evaluate(() => ({
    soma: somarDias('2026-12-30', 3), entre: diasEntre('2026-11-03', '2026-11-07'), um: diasEntre('2026-11-05', '2026-11-05'),
    sem: inicioSemana('2026-11-05'), semAno: inicioSemana('2027-01-01'), longo: fmtDiaLongo('2026-11-05'), curto: fmtDiaCurto('2026-11-05'),
    menos: somarDias('2026-03-01', -1), hoje: diaHoje(), de: diaDe(new Date(2026, 10, 5, 23, 59)),
  }));
  check('somarDias vira o ano (30/12 + 3 = 02/01)', r.soma === '2027-01-02', r.soma);
  check('somarDias volta o mês (01/03 - 1 = 28/02)', r.menos === '2026-02-28', r.menos);
  check('diasEntre conta os dois lados (03 a 07 = 5; mesmo dia = 1)', r.entre === 5 && r.um === 1, r.entre + ' ' + r.um);
  check('inicioSemana é o domingo (05/11 → 01/11; 01/01/2027 → 27/12)', r.sem === '2026-11-01' && r.semAno === '2026-12-27', r.sem + ' ' + r.semAno);
  check('fmtDiaLongo e fmtDiaCurto', r.longo === 'Quinta, 5 de novembro' && r.curto === '05/11', r.longo + ' | ' + r.curto);
  check('diaHoje e diaDe usam a data local', r.hoje === '2026-11-05' && r.de === '2026-11-05', r.hoje + ' ' + r.de);

  // perto da meia-noite (Review Focus 1)
  const tarde = await abrir({ quando: '2026-11-05T23:30:00-03:00' });
  check('às 23:30 ainda é o mesmo dia', await tarde.evaluate(() => diaHoje()) === '2026-11-05');
  await tarde.context().close();

  // compromisso salvo e recarregado
  await page.evaluate(() => db.collection('compromissos').add({ tipo: 'cobranca', titulo: 'Cobrar João', data: '2026-11-06', hora: '', orcamentoId: null, concluido: false, criadoEm: nowISO() }));
  await tick(page);
  check('compromisso entra em STATE.compromissos', await page.evaluate(() => Object.keys(STATE.compromissos).length) === 1);
  await page.reload(); await page.waitForSelector('.big-action');
  check('compromisso continua depois de recarregar', await page.evaluate(() => Object.values(STATE.compromissos)[0].titulo) === 'Cobrar João');

  // backup e restauração
  await act(page, 'go', 'config');
  const bk = await download(page, () => act(page, 'backup'));
  const dados = JSON.parse(fs.readFileSync(bk, 'utf8')).dados;
  check('backup leva os compromissos', dados.compromissos && Object.keys(dados.compromissos).length === 1);
  const limpo = await abrir();
  await act(limpo, 'go', 'config');
  await limpo.setInputFiles('#cfg-restore', bk); await limpo.waitForTimeout(600);
  await limpo.setInputFiles('#cfg-restore', bk); await limpo.waitForTimeout(600);
  check('restaurar 2x não duplica os compromissos', await limpo.evaluate(() => Object.keys(STATE.compromissos).length) === 1);
  // backup antigo, sem a chave compromissos (Review Focus 4)
  const antigo = path.join(OUT, 'backup-antigo.json');
  fs.writeFileSync(antigo, JSON.stringify({ app: 'OrcaTop', versao: 2, exportadoEm: '2026-11-01T12:00:00.000Z', dados: { clientes: {}, catalogoServicos: {}, catalogoMateriais: {},
    orcamentos: { abc: { numero: '202611-9', criadoEm: '2026-11-01T12:00:00.000Z', clienteNome: 'Antigo', status: 'negociacao', servicos: [], materiais: [], recibos: [], lembrete: null } }, config: { empresa: {} } } }));
  const n0 = ERRORS.length;
  await limpo.setInputFiles('#cfg-restore', antigo); await limpo.waitForTimeout(600);
  check('backup antigo (sem compromissos) restaura sem erro', ERRORS.length === n0 && await limpo.evaluate(() => !!STATE.orcamentos.abc), ERRORS.slice(n0).join(' | '));
  await limpo.context().close();
  await page.context().close();
}

/* ---------------- Tarefa 2: diária ---------------- */
async function tarefa2() {
  const page = await abrir();
  await act(page, 'novo');
  await page.fill('#f-cliente-nome', 'Cliente Diária'); await page.dispatchEvent('#f-cliente-nome', 'input');
  await act(page, 'servAbrir', 'diaria');
  check('botão "Por diária" abre o modal com a diária ligada', await page.isChecked('#s-pordiaria') && !(await page.isChecked('#s-porhora')));
  await page.fill('#s-dias', '3'); await page.fill('#s-valor-diaria', '250'); await page.dispatchEvent('#s-valor-diaria', 'input');
  check('3 diárias × 250 = R$ 750,00', (await txt(page, '#s-total')) === 'R$ 750,00', await txt(page, '#s-total'));
  await act(page, 'servConfirmar');
  await tick(page);
  check('lista do formulário mostra "3 diárias × R$ 250,00"', (await txt(page, '#f-servicos-list')).includes('3 diárias × R$ 250,00'), await txt(page, '#f-servicos-list'));
  check('prévia mostra "3 diárias × R$ 250,00" e o total', (await txt(page, '#side-frame')).includes('3 diárias × R$ 250,00') && (await txt(page, '#side-frame .tl.grand')).includes('R$ 750,00'));
  // editar para 1 diária
  await act(page, 'servAbrir', '0');
  check('editar reabre com a diária', await page.isChecked('#s-pordiaria') && (await page.inputValue('#s-dias')) === '3');
  await page.fill('#s-dias', '1'); await page.dispatchEvent('#s-dias', 'input');
  await act(page, 'servConfirmar'); await tick(page);
  check('singular: "1 diária × R$ 250,00"', (await txt(page, '#f-servicos-list')).includes('1 diária × R$ 250,00'));
  // faltando dados
  await act(page, 'servAbrir', 'diaria');
  await page.fill('#s-dias', ''); await page.fill('#s-valor-diaria', '');
  await act(page, 'servConfirmar');
  check('sem dias e valor, não adiciona', await page.isVisible('#s-dias') && (await page.evaluate(() => FORM.servicos.length)) === 1);
  // vírgula: 2 × 250,50 = 501,00
  await page.fill('#s-dias', '2'); await page.fill('#s-valor-diaria', '250,50'); await page.dispatchEvent('#s-valor-diaria', 'input');
  check('valor com vírgula: 2 × 250,50 = R$ 501,00', (await txt(page, '#s-total')) === 'R$ 501,00', await txt(page, '#s-total'));
  await act(page, 'servConfirmar'); await tick(page);
  await act(page, 'formSalvar');
  await page.waitForSelector('#d-status');
  const id = await page.evaluate(() => VIEW.param);
  check('diasDeDiaria soma as linhas (1 + 2 = 3)', await page.evaluate(id => diasDeDiaria(STATE.orcamentos[id]), id) === 3);
  check('detalhe mostra a diária', (await txt(page, '.main')).includes('2 diárias × R$ 250,50'));
  const pdf = await download(page, () => act(page, 'pdf', '$:orcamento'));
  check('PDF com diária: 1 página', parseInt(require('child_process').execSync(`pdfinfo "${pdf}"`).toString().match(/Pages:\s+(\d+)/)[1], 10) === 1);
  require('child_process').execSync(`pdftoppm -png -r 60 "${pdf}" "${OUT}/pdf-diaria"`);
  check('total 250 + 501 = R$ 751,00', await page.evaluate(id => orcTotal(STATE.orcamentos[id]).total, id) === 751);
  await page.context().close();
}

/* ---------------- Tarefa 3: tela da agenda (semana e mês) ---------------- */
async function tarefa3() {
  const page = await abrir();
  const orc = await criarOrc(page, { agenda: { inicio: '2026-11-03', fim: '2026-11-07', hora: '08:00' } });
  const r = await page.evaluate(() => ({
    d02: itensDoDia('2026-11-02').length, d03: itensDoDia('2026-11-03').length, d07: itensDoDia('2026-11-07').length, d08: itensDoDia('2026-11-08').length,
    d05: itensDoDia('2026-11-05')[0],
  }));
  check('serviço de 03 a 07 aparece só nesses dias', r.d02 === 0 && r.d03 === 1 && r.d07 === 1 && r.d08 === 0, JSON.stringify(r));
  check('no dia 05 é o dia 3 de 5', r.d05 && r.d05.tipo === 'servico' && r.d05.diaN === 3 && r.d05.diasTotal === 5 && r.d05.orcId);
  // ordem: 14:00 compromisso, 08:00 serviço, cobrança sem hora
  await page.evaluate(() => db.collection('compromissos').add({ tipo: 'compromisso', titulo: 'Visita para orçar', data: '2026-11-05', hora: '14:00', orcamentoId: null, concluido: false, criadoEm: nowISO() }));
  await page.evaluate(() => db.collection('compromissos').add({ tipo: 'cobranca', titulo: 'Cobrar João', data: '2026-11-05', hora: '', orcamentoId: null, concluido: false, criadoEm: nowISO() }));
  await tick(page);
  const ordem = await page.evaluate(() => itensDoDia('2026-11-05').map(i => i.hora || '—').join(' '));
  check('ordem do dia: 08:00, 14:00, —', ordem === '08:00 14:00 —', ordem);

  // tela da semana
  await act(page, 'go', 'home');
  await act(page, 'go', 'agenda');
  await page.waitForSelector('.week-strip');
  check('topo mostra "1 a 7 de nov"', (await txt(page, '.topbar')).includes('1 a 7 de nov'), await txt(page, '.topbar'));
  const dias = await page.$$eval('.week-strip .wk-day', els => els.map(e => e.dataset.arg + (e.classList.contains('on') ? '*' : '') + (e.classList.contains('has') ? '.' : '')));
  check('faixa: 7 dias, 05 escolhido, bolinha de 03 a 07', dias.join(',') === '2026-11-01,2026-11-02,2026-11-03.,2026-11-04.,2026-11-05*.,2026-11-06.,2026-11-07.', dias.join(','));
  const lista = await txt(page, '.day-items');
  check('lista do dia: título com "(hoje)", serviço com "dia 3 de 5", cliente e nº', (await txt(page, '.day-title')).includes('Quinta, 5 de novembro (hoje)') && lista.includes('Pintura sala') && lista.includes('dia 3 de 5') && lista.includes('Maria Souza'), lista);
  await page.screenshot({ path: path.join(OUT, '30-agenda-semana-desktop.png') });
  await act(page, 'agendaSemana', '1');
  check('seta › leva para "8 a 14 de nov"', (await txt(page, '.topbar')).includes('8 a 14 de nov'));
  check('dia vazio mostra "Nada marcado neste dia."', (await txt(page, '.day-items')).includes('Nada marcado neste dia.'));
  await act(page, 'agendaDia', '2026-11-09');
  check('tocar num dia escolhe esse dia', (await txt(page, '.day-title')).includes('Segunda, 9 de novembro'));
  // tocar no serviço abre o orçamento
  await act(page, 'go', 'agenda:2026-11-05');
  await page.locator('.day-item[data-act="abrir"]').first().click();
  await page.waitForSelector('#d-status');
  check('tocar no serviço abre o orçamento', await page.evaluate(() => VIEW.param) === orc);

  // virada de ano (Review Focus 2)
  await criarOrc(page, { agenda: { inicio: '2026-12-30', fim: '2027-01-02', hora: '' } });
  await act(page, 'go', 'agenda:2026-12-30');
  check('semana 27 de dez a 2 de jan', (await txt(page, '.topbar')).includes('27 de dez a 2 de jan'), await txt(page, '.topbar'));
  const vira = await page.evaluate(() => ['2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03'].map(d => itensDoDia(d).length).join(''));
  check('serviço de 30/12 a 02/01 aparece nos 4 dias', vira === '011110', vira);

  // perdido não aparece
  await page.evaluate(id => db.collection('orcamentos').doc(id).update({ status: 'perdido' }), orc); await tick(page);
  check('orçamento perdido sai da agenda', await page.evaluate(() => itensDoDia('2026-11-05').filter(i => i.tipo === 'servico').length) === 0);
  await page.evaluate(id => db.collection('orcamentos').doc(id).update({ status: 'aprovado' }), orc); await tick(page);

  // mês
  await act(page, 'go', 'agenda:2026-11-05');
  await act(page, 'agendaMesAbrir');
  await page.waitForSelector('.month-grid');
  const cel = await page.$$eval('.month-grid .mday', els => els.map(e => ({ n: e.textContent.trim(), busy: e.classList.contains('busy'), wk: e.classList.contains('wk') })));
  check('mês: 30 dias de novembro', cel.length === 30, String(cel.length));
  check('mês: dias 03 a 07 ocupados, só número nas células', cel.filter(c => c.busy).map(c => c.n).join(',') === '3,4,5,6,7' && cel.every(c => /^\d+$/.test(c.n)), cel.filter(c => c.busy).map(c => c.n).join(','));
  check('mês: semana aberta contornada (1 a 7)', cel.filter(c => c.wk).map(c => c.n).join(',') === '1,2,3,4,5,6,7');
  await act(page, 'agendaMesNav', '1');
  check('mês seguinte: dezembro com 31 dias', (await txt(page, '.month-head')).toLowerCase().includes('dezembro') && (await page.locator('.month-grid .mday').count()) === 31);
  await act(page, 'agendaMesNav', '-1');
  await page.locator('.month-grid .mday', { hasText: /^11$/ }).click();
  await page.waitForSelector('.week-strip');
  check('tocar no dia 11 volta para a semana com o 11 escolhido', (await txt(page, '.day-title')).includes('Quarta, 11 de novembro'));
  check('início tem atalho para a agenda', await (async () => { await act(page, 'go', 'home'); return (await page.locator('.navcard[data-arg="agenda"]').count()) === 1; })());
  await page.context().close();

  // celular e tema escuro
  for (const [nome, opts] of [['claro', {}], ['escuro', { colorScheme: 'dark' }]]) {
    const pm = await abrir(Object.assign({ viewport: { width: 390, height: 844 }, mobile: true }, opts));
    await criarOrc(pm, { agenda: { inicio: '2026-11-03', fim: '2026-11-07', hora: '08:00' } });
    await pm.evaluate(() => db.collection('compromissos').add({ tipo: 'cobranca', titulo: 'Cobrar João', data: '2026-11-05', hora: '', orcamentoId: null, concluido: false, criadoEm: nowISO() }));
    await act(pm, 'go', 'agenda'); await pm.waitForSelector('.week-strip'); await tick(pm);
    let ok = await noHScroll(pm);
    await pm.screenshot({ path: path.join(OUT, `3${nome === 'claro' ? '0' : '2'}-agenda-semana-${nome}.png`) });
    await act(pm, 'agendaMesAbrir'); await pm.waitForSelector('.month-grid');
    ok = ok && await noHScroll(pm);
    await pm.screenshot({ path: path.join(OUT, `3${nome === 'claro' ? '1' : '3'}-agenda-mes-${nome}.png`) });
    check(`celular 390px (${nome}): sem rolagem lateral na semana e no mês`, ok);
    await pm.context().close();
  }
}

/* ---------------- Tarefa 4: marcar, mudar e tirar o serviço da agenda ---------------- */
const sim = page => page.click('#confirm-overlay [data-yes]');
const nao = page => page.click('#confirm-overlay [data-no]');
async function tarefa4() {
  const page = await abrir();
  check('moverAgenda mantém a duração', await page.evaluate(() => JSON.stringify(moverAgenda({ inicio: '2026-11-05', fim: '2026-11-06', hora: '08:00' }, '2026-11-09'))) === '{"inicio":"2026-11-09","fim":"2026-11-10","hora":"08:00"}');
  const id = await criarOrc(page, { status: 'negociacao', servicos: [{ id: 'd1', titulo: 'Pintura', descricao: '', quantidade: 1, porDiaria: true, diariaDetalhe: { dias: 2, valorDiaria: 250 }, valorUnit: 500, valorTotal: 500 }] });
  await act(page, 'go', 'detalhe:' + id); await page.waitForSelector('#d-status');
  await page.selectOption('#d-status', 'aprovado');
  await page.waitForSelector('#confirm-overlay');
  check('ao aprovar, pergunta "Marcar na agenda?"', (await txt(page, '#confirm-overlay')).includes('Marcar na agenda?'));
  await sim(page);
  await page.waitForSelector('#a-inicio');
  check('sugere 2 dias (2 diárias): 05/11 a 06/11', (await page.inputValue('#a-inicio')) === '2026-11-05' && (await page.inputValue('#a-fim')) === '2026-11-06', (await page.inputValue('#a-inicio')) + ' ' + (await page.inputValue('#a-fim')));
  await page.fill('#a-hora-h', '08'); await page.fill('#a-hora-m', '00');
  await act(page, 'agendaSalvar', id); await tick(page);
  check('card Agenda mostra "05/11 a 06/11 · 08:00"', (await txt(page, '#card-agenda')).includes('05/11 a 06/11 · 08:00'), await txt(page, '#card-agenda'));
  check('serviço aparece nos 2 dias da agenda', await page.evaluate(() => itensDoDia('2026-11-05').length + itensDoDia('2026-11-06').length) === 2);

  // mudar o início: o fim anda junto
  await act(page, 'agendaAbrir', id); await page.waitForSelector('#a-inicio');
  await page.fill('#a-inicio', '2026-11-09'); await page.dispatchEvent('#a-inicio', 'change');
  check('mudar o início para 09/11 leva o fim para 10/11', (await page.inputValue('#a-fim')) === '2026-11-10', await page.inputValue('#a-fim'));
  await act(page, 'agendaSalvar', id); await tick(page);
  await page.reload(); await page.waitForSelector('.big-action');
  check('depois de recarregar continua 09/11 a 10/11', await page.evaluate(id => JSON.stringify(STATE.orcamentos[id].agenda), id) === '{"inicio":"2026-11-09","fim":"2026-11-10","hora":"08:00"}');
  // mudar só o fim
  await act(page, 'go', 'detalhe:' + id); await page.waitForSelector('#d-status');
  await act(page, 'agendaAbrir', id); await page.waitForSelector('#a-fim');
  await page.fill('#a-fim', '2026-11-12'); await act(page, 'agendaSalvar', id); await tick(page);
  check('mudar só o fim: 4 dias (09 a 12)', await page.evaluate(id => diasEntre(STATE.orcamentos[id].agenda.inicio, STATE.orcamentos[id].agenda.fim), id) === 4);
  // fim antes do início (Review Focus 3)
  await act(page, 'agendaAbrir', id); await page.waitForSelector('#a-fim');
  await page.fill('#a-fim', '2026-11-01'); await act(page, 'agendaSalvar', id); await tick(page);
  check('fim antes do início: recusa e não salva', (await txt(page, '.toast')).includes('O último dia não pode ser antes do primeiro.') && await page.evaluate(id => STATE.orcamentos[id].agenda.fim, id) === '2026-11-12');
  await act(page, 'close');

  // editar o orçamento no formulário não apaga a agenda
  await act(page, 'go', 'form:' + id); await page.waitForSelector('#f-status');
  await act(page, 'formSalvar'); await page.waitForSelector('#d-status'); await tick(page);
  check('salvar o formulário mantém a agenda', await page.evaluate(id => !!(STATE.orcamentos[id].agenda && STATE.orcamentos[id].agenda.inicio === '2026-11-09'), id));
  check('orçamento com agenda não pergunta de novo', (await page.locator('#confirm-overlay').count()) === 0);
  // duplicar não copia a agenda
  await page.locator('[data-act="duplicar"]').first().click();
  await page.waitForFunction(id => VIEW.param && VIEW.param !== id, id);
  const copia = await page.evaluate(() => VIEW.param);
  await page.waitForFunction(c => !!STATE.orcamentos[c], copia);
  check('duplicar não copia a agenda', await page.evaluate(c => STATE.orcamentos[c].agenda == null, copia));
  // remover
  await act(page, 'go', 'detalhe:' + id); await page.waitForSelector('#d-status');
  await act(page, 'agendaRemover', id); await sim(page); await tick(page);
  check('tirar da agenda', await page.evaluate(id => STATE.orcamentos[id].agenda == null, id));

  // formulário: aprovar e salvar pergunta depois de salvar; pular deixa sem agenda
  await act(page, 'go', 'home'); await act(page, 'novo');
  await page.fill('#f-cliente-nome', 'Ana Lima'); await page.dispatchEvent('#f-cliente-nome', 'input');
  await page.selectOption('#f-status', 'aprovado');
  check('no formulário, escolher Aprovado ainda não pergunta', (await page.locator('#confirm-overlay').count()) === 0);
  await act(page, 'formSalvar');
  await page.waitForSelector('#confirm-overlay');
  check('depois de salvar, já no detalhe, pergunta', await page.evaluate(() => VIEW.name) === 'detalhe' && (await txt(page, '#confirm-overlay')).includes('Marcar na agenda?'));
  await nao(page); await tick(page);
  const novo = await page.evaluate(() => VIEW.param);
  check('pular: fica aprovado e sem agenda', await page.evaluate(n => STATE.orcamentos[n].status === 'aprovado' && !STATE.orcamentos[n].agenda, novo));
  // cancelar o formulário não pergunta
  await act(page, 'go', 'form:' + id); await page.waitForSelector('#f-status');
  await page.selectOption('#f-status', 'aprovado');
  await act(page, 'go', 'detalhe:' + id); await tick(page);
  check('sair do formulário sem salvar não pergunta', (await page.locator('#confirm-overlay').count()) === 0);
  await page.context().close();
}

/* ---------------- Tarefa 5: compromissos, cobranças e início ---------------- */
async function tarefa5() {
  const page = await abrir();
  // novo compromisso pela agenda, no dia escolhido
  await act(page, 'go', 'agenda:2026-11-06'); await page.waitForSelector('.week-strip');
  await page.locator('[data-act="compAbrir"]:not([data-arg])').click();
  await page.waitForSelector('#c-titulo');
  check('novo compromisso vem com o dia escolhido (06/11)', (await page.inputValue('#c-data')) === '2026-11-06');
  await page.fill('#c-titulo', 'Visita para orçar'); await page.fill('#c-hora-h', '14'); await page.fill('#c-hora-m', '00');
  await act(page, 'compSalvar'); await tick(page);
  check('aparece na lista do dia 06 às 14:00', (await txt(page, '.day-items')).includes('14:00 Visita para orçar'), await txt(page, '.day-items'));
  // sem título
  await page.locator('[data-act="compAbrir"]:not([data-arg])').click(); await page.waitForSelector('#c-titulo');
  await act(page, 'compSalvar');
  check('sem título não salva', (await txt(page, '.toast')).includes('Escreva o que é.') && await page.evaluate(() => Object.keys(STATE.compromissos).length) === 1);
  await act(page, 'close');

  // cobrança solta atrasada, com texto perigoso
  await act(page, 'go', 'agenda:2026-11-04'); await page.waitForSelector('.week-strip');
  await page.locator('[data-act="compAbrir"]:not([data-arg])').click(); await page.waitForSelector('#c-titulo');
  await act(page, 'compTipo', 'cobranca');
  await page.fill('#c-titulo', "Cobrar O'Brien <b>x</b>");
  await act(page, 'compSalvar'); await tick(page);
  await act(page, 'go', 'home');
  const rem = await txt(page, '.rem-list');
  check('cobrança atrasada aparece no início com "Atrasado"', rem.includes("Cobrar O'Brien <b>x</b>") && rem.includes('Atrasado'), rem);
  check('texto do usuário sai escapado (sem <b> de verdade)', (await page.locator('.rem-list b').count()) === 0);
  // adiar para amanhã
  await page.locator('.rem-item[data-act="compAbrir"]').first().click(); await page.waitForSelector('#c-titulo');
  await act(page, 'compAdiar', await page.evaluate(() => Object.values(STATE.compromissos).find(c => c.tipo === 'cobranca').id)); await tick(page);
  check('adiar: sai do início e vai para amanhã (06/11)', (await page.locator('.rem-list').count()) === 0 && await page.evaluate(() => itensDoDia('2026-11-06').some(i => i.tipo === 'cobranca')));

  // finalizar com valor a receber oferece cobrança
  const id = await criarOrc(page, { status: 'execucao', recibos: [{ forma: 'Pix', valor: 200, data: nowISOfake() }] });
  await act(page, 'go', 'detalhe:' + id); await page.waitForSelector('#d-status');
  await page.selectOption('#d-status', 'finalizado');
  await page.waitForSelector('#confirm-overlay');
  check('finalizar com R$ 300 a receber pergunta "Lembrar de cobrar?"', (await txt(page, '#confirm-overlay')).includes('Lembrar de cobrar?') && (await txt(page, '#confirm-overlay')).includes('R$ 300,00'));
  await sim(page); await tick(page);
  const l = await page.evaluate(id => STATE.orcamentos[id].lembrete, id);
  check('lembrete de cobrança para amanhã às 09:00', l && l.tipo === 'cobranca' && await page.evaluate(d => diaDe(new Date(d)) + ' ' + horaDeISO(d), l.data) === '2026-11-06 09:00' && await page.evaluate(l => lembreteEstado(l), l) === 'sched');
  const amanha = await page.evaluate(() => itensDoDia('2026-11-06').find(i => i.tipo === 'cobranca' && i.orcId));
  check('amanhã na agenda: "Cobrar Maria Souza" com a receber', amanha && amanha.titulo === 'Cobrar Maria Souza' && amanha.sub.includes('A receber R$ 300,00'), JSON.stringify(amanha));
  // recibo que zera: cobrança fica feita
  await page.evaluate(id => db.collection('orcamentos').doc(id).update({ recibos: [{ forma: 'Pix', valor: 500, data: new Date().toISOString() }] }), id); await tick(page);
  check('pagou tudo: cobrança fica como feita', await page.evaluate(() => itensDoDia('2026-11-06').find(i => i.orcId).feito) === true);
  // finalizar sem nada a receber não pergunta
  const id2 = await criarOrc(page, { status: 'execucao', recibos: [{ forma: 'Pix', valor: 500, data: new Date().toISOString() }] });
  await act(page, 'go', 'detalhe:' + id2); await page.waitForSelector('#d-status');
  await page.selectOption('#d-status', 'finalizado'); await page.waitForTimeout(400);
  check('finalizar já pago não pergunta', (await page.locator('#confirm-overlay').count()) === 0);
  // lembrete existente: pergunta se substitui
  const id3 = await criarOrc(page, { status: 'execucao', lembrete: { data: new Date(2026, 10, 20, 10).toISOString(), descricao: 'Ligar', concluido: false } });
  await act(page, 'go', 'detalhe:' + id3); await page.waitForSelector('#d-status');
  await page.selectOption('#d-status', 'finalizado'); await page.waitForSelector('#confirm-overlay');
  await sim(page); await page.waitForFunction(() => document.querySelector('#confirm-overlay') && document.querySelector('#confirm-overlay').textContent.includes('Substituir'));
  check('já tem lembrete: pergunta "Substituir o lembrete atual?"', true);
  await nao(page); await tick(page);
  check('não substituir mantém o lembrete antigo', await page.evaluate(id => STATE.orcamentos[id].lembrete.descricao, id3) === 'Ligar');

  // início: serviço e compromisso de hoje
  await criarOrc(page, { agenda: { inicio: '2026-11-05', fim: '2026-11-05', hora: '08:00' }, servicos: [{ id: 'x', titulo: 'Troca de piso', quantidade: 1, valorUnit: 100, valorTotal: 100 }] });
  await page.evaluate(() => db.collection('compromissos').add({ tipo: 'compromisso', titulo: 'Comprar tinta', data: '2026-11-05', hora: '15:00', orcamentoId: null, concluido: false, criadoEm: nowISO() }));
  await tick(page); await act(page, 'go', 'home');
  const hoje = await txt(page, '.hoje-agenda');
  check('início: "Hoje na agenda" mostra o serviço e o compromisso', hoje.includes('Troca de piso') && hoje.includes('Comprar tinta'), hoje);
  // concluir compromisso
  await page.locator('.hoje-agenda [data-act="compAbrir"]').first().click(); await page.waitForSelector('#c-titulo');
  await page.locator('[data-act="compConcluir"]').click(); await tick(page);
  check('marcar como feito tira do início', !(await txt(page, '.hoje-agenda')).includes('Comprar tinta'));

  // orçamento excluído com cobrança ligada (Review Focus 5)
  const id4 = await criarOrc(page, {});
  await page.evaluate(o => db.collection('compromissos').add({ tipo: 'cobranca', titulo: 'Cobrar resto', data: '2026-11-05', hora: '', orcamentoId: o, concluido: false, criadoEm: nowISO() }), id4);
  await page.evaluate(o => db.collection('orcamentos').doc(o).delete(), id4); await tick(page);
  const n0 = ERRORS.length;
  await act(page, 'go', 'home'); await act(page, 'go', 'agenda');
  check('orçamento excluído: a cobrança continua, sem erro', (await txt(page, '.day-items')).includes('Cobrar resto') && ERRORS.length === n0);
  await page.locator('.day-item', { hasText: 'Cobrar resto' }).click(); await page.waitForSelector('#c-titulo');
  check('abrir a cobrança órfã funciona', (await page.inputValue('#c-titulo')) === 'Cobrar resto');
  await act(page, 'close');
  // excluir compromisso
  await page.locator('.day-item', { hasText: 'Cobrar resto' }).click(); await page.waitForSelector('#c-titulo');
  await page.locator('[data-act="compExcluir"]').click(); await sim(page); await tick(page);
  check('excluir compromisso', !(await txt(page, '.day-items')).includes('Cobrar resto'));
  await page.context().close();

  // celular
  const pm = await abrir({ viewport: { width: 390, height: 844 }, mobile: true });
  await criarOrc(pm, { agenda: { inicio: '2026-11-05', fim: '2026-11-08', hora: '08:00' } });
  await pm.evaluate(() => db.collection('compromissos').add({ tipo: 'cobranca', titulo: 'Cobrar João', data: '2026-11-04', hora: '', orcamentoId: null, concluido: false, criadoEm: nowISO() }));
  await pm.evaluate(() => db.collection('compromissos').add({ tipo: 'compromisso', titulo: 'Visita para orçar', data: '2026-11-05', hora: '14:00', orcamentoId: null, concluido: false, criadoEm: nowISO() }));
  await act(pm, 'go', 'agenda'); await act(pm, 'go', 'home'); await tick(pm);
  let ok = await noHScroll(pm);
  await pm.screenshot({ path: path.join(OUT, '34-inicio-agenda.png'), fullPage: true });
  await act(pm, 'go', 'agenda'); await pm.locator('[data-act="compAbrir"]:not([data-arg])').click(); await pm.waitForSelector('#c-titulo');
  ok = ok && await noHScroll(pm);
  await pm.screenshot({ path: path.join(OUT, '35-compromisso.png') });
  check('celular 390px: início e formulário de compromisso sem rolagem lateral', ok);
  await pm.context().close();
}
function nowISOfake() { return '2026-11-05T12:00:00.000Z'; }

/* ---------------- Correções da revisão final ---------------- */
async function revisao() {
  const page = await abrir();
  // 1. editar um lembrete de cobrança mantém o tipo
  const id = await criarOrc(page, { status: 'finalizado', lembrete: { data: new Date(2026, 10, 6, 9).toISOString(), descricao: 'Cobrar Maria Souza', concluido: false, tipo: 'cobranca' } });
  await act(page, 'go', 'detalhe:' + id); await page.waitForSelector('#d-status');
  await act(page, 'lembreteAbrir', id); await page.waitForSelector('#l-data');
  await page.fill('#l-data', '2026-11-06T14:00'); await act(page, 'lembreteSalvar', id); await tick(page);
  check('revisão: editar lembrete de cobrança mantém tipo cobranca', await page.evaluate(id => STATE.orcamentos[id].lembrete.tipo, id) === 'cobranca');
  // 5. cobrança paga não aparece como atrasada no detalhe
  const id2 = await criarOrc(page, { status: 'finalizado', recibos: [{ forma: 'Pix', valor: 500, data: new Date().toISOString() }],
    lembrete: { data: new Date(2026, 10, 4, 9).toISOString(), descricao: 'Cobrar', concluido: false, tipo: 'cobranca' } });
  await act(page, 'go', 'detalhe:' + id2); await page.waitForSelector('#d-status');
  const lv = await txt(page, '.reminder');
  check('revisão: cobrança paga aparece como concluída no detalhe', !lv.includes('Atrasado') && (await page.locator('[data-act="lembreteAdiar"]').count()) === 0, lv);
  // 2. diária com vírgula não multiplica por 10
  await act(page, 'go', 'home'); await act(page, 'novo');
  await act(page, 'servAbrir', 'diaria');
  await page.fill('#s-dias', '1,5'); await page.dispatchEvent('#s-dias', 'input');
  await page.fill('#s-valor-diaria', '250'); await page.dispatchEvent('#s-valor-diaria', 'input');
  check('revisão: "1,5" dias não vira 15', (await page.inputValue('#s-dias')) !== '15' && (await txt(page, '#s-total')) !== 'R$ 3.750,00', (await page.inputValue('#s-dias')) + ' ' + (await txt(page, '#s-total')));
  await act(page, 'close');
  // 3. "Adiar para amanhã" não aparece num compromisso futuro
  const fut = await page.evaluate(async () => (await db.collection('compromissos').add({ tipo: 'compromisso', titulo: 'Futuro', data: '2026-11-12', hora: '', orcamentoId: null, concluido: false, criadoEm: nowISO() })).id);
  await tick(page);
  await page.evaluate(c => ACT.compAbrir(c), fut); await page.waitForSelector('#c-titulo');
  check('revisão: compromisso futuro não tem "Adiar para amanhã"', (await page.locator('[data-act="compAdiar"]').count()) === 0);
  await act(page, 'close');
  // 4. editar compromisso ligado a orçamento perdido mantém a ligação
  const perd = await criarOrc(page, { status: 'perdido' });
  const lig = await page.evaluate(async o => (await db.collection('compromissos').add({ tipo: 'cobranca', titulo: 'Ligado', data: '2026-11-05', hora: '', orcamentoId: o, concluido: false, criadoEm: nowISO() })).id, perd);
  await tick(page);
  await page.evaluate(c => ACT.compAbrir(c), lig); await page.waitForSelector('#c-titulo');
  await page.fill('#c-titulo', 'Ligado 2'); await page.locator('[data-act="compSalvar"]').click(); await tick(page);
  check('revisão: editar não desfaz a ligação com orçamento perdido', await page.evaluate(c => STATE.compromissos[c].orcamentoId, lig) === perd);
  await page.context().close();
}

/* ---------------- Ajustes antes de publicar (2026-11-05) ---------------- */
async function ajustes() {
  const page = await abrir();
  // grade do início sem buraco: Agenda ocupa a linha inteira
  const g = await page.evaluate(() => { const grid = document.querySelector('.navgrid').getBoundingClientRect(); const a = document.querySelector('.navcard[data-arg="agenda"]').getBoundingClientRect(); return { gw: grid.width, aw: a.width, n: document.querySelectorAll('.navgrid .navcard').length }; });
  check('início: cartão Agenda ocupa a linha inteira (4 cartões embaixo, sem buraco)', Math.abs(g.gw - g.aw) < 2 && g.n === 5, JSON.stringify(g));
  await page.context().close();
  // captura do início no celular, tema escuro
  const pd = await abrir({ viewport: { width: 390, height: 844 }, mobile: true, colorScheme: 'dark' });
  await pd.screenshot({ path: path.join(OUT, '40-inicio-grade.png'), fullPage: true });
  await pd.context().close();
}

(async () => {
  browser = await chromium.launch();
  const so = process.argv[2]; // ex.: "1" para rodar só a tarefa 1
  const tarefas = { 1: tarefa1, 2: tarefa2, 3: tarefa3, 4: tarefa4, 5: tarefa5, r: revisao, a: ajustes };
  for (const [n, fn] of Object.entries(tarefas)) {
    if (so && so !== n) continue;
    try { await fn(); } catch (e) { check(`tarefa ${n} terminou sem travar`, false, e.message.split('\n')[0]); }
  }
  check('nenhum erro de JavaScript', ERRORS.length === 0, ERRORS.join(' | '));
  await browser.close();
  const falhas = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - falhas}/${results.length} testes passaram. Imagens em ${OUT}`);
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
