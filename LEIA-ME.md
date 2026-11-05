# OrçaTop (calculadora de orçamentos)

Versão atual: `OrçaTop.html` (2026-11-01), que junta a versão do pai com a nossa v1.

## Dois jeitos de usar
- **No Claude (nuvem):** https://claude.ai/artifact/217qwseBAQ6cou6JDtf8Cc. Os dados ficam na nuvem do Claude e aparecem iguais no celular e no computador. O link é privado: para outra pessoa usar, compartilhe pelo menu Share da página.
- **Como arquivo:** abra `OrçaTop.html` no navegador (Chrome, Edge ou Firefox). Os dados ficam só naquele navegador. Baixe um backup de vez em quando em **Configurações → Backup**.

As duas versões não se misturam sozinhas. Para levar os dados de uma para a outra, baixe o backup numa e use **Restaurar backup** na outra.

## O que tem
- Início com lembretes atrasados e de hoje, total em andamento e a receber
- Orçamentos com etapas (em negociação, aprovado, em execução, finalizado, perdido), busca e filtro
- Serviços com descrição, por valor ou por hora (início e fim com pausa, ou horas estimadas)
- Materiais com margem em % ou em R$ (o cliente vê só o valor final)
- Prévia ao vivo do documento (no computador fica ao lado; no celular, botão "Prévia")
- PDF do orçamento e do recibo, com logo, Pix, garantia, validade e assinaturas
- Recibos com recebido e a receber, lembretes, duplicar, excluir
- Clientes, catálogo, relatórios dos últimos 6 meses
- Botões de WhatsApp e ligar
- Backup e restauração; importa os orçamentos da calculadora v1
- **Agenda (2026-11-05):** semana com a lista do dia e panorama do mês; serviços de um ou vários dias ligados ao orçamento (perguntado ao aprovar); compromissos e cobranças soltos; cobrança oferecida ao finalizar com valor a receber; "Hoje na agenda" no início
- **Diária (2026-11-05):** mão de obra por dias × valor da diária

## Depois de mudar o `OrçaTop.html`
1. Rode os testes: `NODE_PATH=<pasta com playwright>/node_modules node testes/teste-orcatop.js` e `... node testes/teste-agenda.js` (neste computador o Playwright está em `/home/Moxxie/Documents/busca-top/busca-top/node_modules`)
2. Gere a cópia do Claude: `./gerar-versao-claude.sh` (cria `publicado/orcatop-claude.html`)
3. Publique de novo essa cópia no mesmo link

## Pastas
- `OrçaTop.html`: o app (arquivo principal)
- `publicado/orcatop-claude.html`: cópia para o Claude (gerada, não edite à mão)
- `gerar-versao-claude.sh`: gera a cópia acima
- `testes/teste-agenda.js`: 88 testes da agenda e da diária (relógio fixo em 05/11/2026, fuso de São Paulo)
- `docs/`: design e plano da agenda (2026-11-05) e os desenhos aprovados
- `testes/teste-orcatop.js`: 42 testes (contas, recibo, lembrete, PDF, backup, v1, nuvem simulada, celular, tema escuro)
- `referencia/OrçaTop-versao-do-pai.html`: versão do pai, sem alterações
- `referencia/calculadora-v1.html`: nossa v1 (2026-10-28), sem alterações
- `referencia/Calc prototipo.html`: protótipo antigo
- `testes/teste-navegador.js`: teste da v1 (aponta para `referencia/calculadora-v1.html`)
- `marca/gerar-logo.js`: gerador da logo
