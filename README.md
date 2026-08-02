# Programação e Roteirização por Regional (DER-SP)

Aplicativo web mobile-first e offline-first para **importar a programação semanal em PDF**,
conferir os serviços, localizá-los na malha rodoviária oficial do **DER-SP (WebRota)**,
gerar rotas de campo e auditar todo o pipeline — sempre **filtrado pela regional do funcionário**.

---

## 1. Visão geral

| Item | Descrição |
| --- | --- |
| Identificação | Sem login, senha, e-mail, OAuth ou PIN. Só **Nome + Regional**, salvos no aparelho. |
| Filtro regional | Aplicado **sempre no servidor**, a partir do id do funcionário. Nunca no navegador. |
| Mapa | 100% livre: OpenStreetMap + Leaflet + OSRM + camadas oficiais DER-SP (WebRota). |
| Offline | IndexedDB (Dexie) + service worker + fila de sincronização. |
| Backend | Lovable Cloud (Postgres + RLS + Storage), acessado por server functions. |

### Stack

TanStack Start v1 (React 19 + Vite) · TypeScript · Tailwind v4 · shadcn/ui ·
Lovable Cloud · Dexie · Leaflet · pdfjs-dist · tesseract.js · jsPDF + autotable · Vitest.

---

## 2. Telas (rotas)

| Rota | Arquivo | O que faz |
| --- | --- | --- |
| `/` | `src/routes/index.tsx` | Início: identificação, resumo do dia, atalhos. |
| `/programacao` | `programacao.index.tsx` | Lista de serviços da regional, filtros (dia, status, conferência, divergência), ações em lote. |
| `/programacao/importar` | `programacao.importar.tsx` | Leitura do PDF no navegador, tabela de diagnóstico (Pág · Linha · Texto · Regional · Status · Motivo) e envio para a área de conferência. |
| `/programacao/revisar` | `programacao.revisar.tsx` | Revisão/correção manual dos registros antes de virarem programação oficial. |
| `/importacoes` | `importacoes.index.tsx` | Histórico de PDFs importados: abrir, conferir, editar, exportar, remover. |
| `/importacoes/$id` | `importacoes.$id.tsx` | Conferência de uma importação: registros em staging, edição, aprovação, confirmação. |
| `/importacoes/auditoria/$id` | `importacoes.auditoria.$id.tsx` | Auditoria do pipeline: contagens por etapa, checklist das 12 etapas, validação do arquivo de referência, simulação de queda do DER, log e exportações CSV/PDF. |
| `/mapa` | `mapa.tsx` | Mapa interativo com camadas DER, busca rodovia/km, GPS, painel do job de geometria. |
| `/rota` | `rota.tsx` | Geração/sequenciamento da rota do dia, escolha de origem, bloqueio por etapa crítica, exportação em PDF. |
| `/configuracoes` | `configuracoes.tsx` | Perfil local, dados offline, limpeza de cache. |

Layout raiz: `src/routes/__root.tsx` (AppShell, navegação, toaster, z-index: mapa 1 · cabeçalho 1000 · navegação 1100).

---

## 3. Módulos e funções

### 3.1 Identidade e regional

- `src/lib/perfil-local.ts` — `lerPerfilLocal`, `gravarPerfilLocal`, `usePerfilLocal`.
- `src/lib/regionais.ts` — `REGIONAIS`, `regionalPorCodigo`, `rotuloRegional`, `normalizarTexto`,
  `detectarRegionalNaLinha` (regex estrita `C.G.R. 0n`), `detectarRegional`, `parseKm`,
  `normalizarRodovia`, `parseData`.
- `src/lib/programacao.server.ts` — `carregarPerfil` (resolve regional pelo id), `mapaRegionais`,
  `montarChaveDuplicidade`, `COLUNAS_PROGRAMACAO`.
- `src/components/Identificacao.tsx` — onboarding Nome + Regional.

### 3.2 Leitura do PDF

- `src/lib/pdf/parser.ts` — `lerProgramacaoPdf` (pdfjs no navegador, OCR tesseract como reserva, hash SHA-256).
- `src/lib/pdf/nucleo.ts` — interpretação testável: `agruparLinhas`, `cabecalhoEmTexto`,
  `detectarPeriodoDeclarado`, `processarPaginas`, `processarTexto`, `ROTULO_CONFERENCIA`.
- `src/lib/pdf/validacao-referencia.ts` — `EXPECTATIVAS`, `encontrarExpectativa`, `conciliarTotais`,
  `validarLeitura`, `validarPersistido`.
- Testes: `src/lib/pdf/__tests__/referencia.test.ts` com o fixture ME2 Itapê (inclui as 10 linhas CGR.3 Bauru da página 3).

### 3.3 Importações (staging → oficial)

- `src/lib/importacoes.server.ts` — `avaliarRegistro`, `chaveDoRegistro`, `mapaIdPorCodigoRegional`,
  `carregarImportacao`, `recalcularTotais`, `apagarArquivoPdf`, `purgarImportacao` (exclusão em cascata).
- `src/lib/importacoes.functions.ts` — `criarImportacao`, `verificarHashImportacao`, `obterImportacao`,
  `editarRegistroImportacao`, `acaoRegistroImportacao`, `confirmarImportacao`, `atualizarStatusImportacao`,
  `removerPdfImportacao`, `excluirImportacao`, `listarImportacoes`, `urlPdfImportacao`,
  `duplicarImportacao`, `diasDaProgramacao`, `acaoEmLoteConferencia`.
- `src/components/importacoes/AcoesImportacao.tsx` — botões Abrir · Conferir · Editar · Exportar · Remover.

### 3.4 Programação

`src/lib/programacao.functions.ts` — `listarRegionais`, `salvarPerfil`, `obterPerfil`, `verificarArquivo`,
`importarProgramacao`, `listarProgramacoes`, `listarParaRevisao`, `excluirRegistro`, `salvarCoordenadas`,
`corrigirRegistro`, `atualizarStatus`, `resumoDoDia`, `salvarRota`, `listarRotas`, `excluirRota`.

### 3.5 DER-SP / geolocalização

- `src/lib/der/geo.ts` — conversão SAD69 ↔ WGS84 (`paraDer`, `paraLatLon`, `distanciaMetros`).
- `src/lib/der/arcxml.ts` — montagem/leitura das requisições do WebRota.
- `src/lib/der/der.server.ts` — proxy no servidor com cache (`urlServico`, `pingDer`, consultas de rodovias, marcos, geometrias).
- `src/lib/der.functions.ts` — `derStatus`, `derBuscarRodovias`, `derMarcos`, `derGeometria`,
  `derRodoviasProximas`, `derMunicipio`, `derCamadas`, `derLimiteRegional`.
- `src/services/derMapService.ts` — camada do navegador: `normalizarKm`, `normalizarCodigoRodovia`,
  `localizarKm`, `localizarTrecho`, `identificarPonto`, `estimarKm`, `carregarCamadasDer`,
  `limparCacheDer`, `resumoCacheDer`, `servicoEmContingencia`, `observarContingencia`,
  `simularFalhaDer`, `falhaDerSimulada`, `linkGoogleMaps`, `linkWaze`, `linkOsm`, `textoCoordenadas`.
- `src/components/mapa/MapaLeaflet.tsx` — mapa com panes dedicados para as camadas oficiais.

### 3.6 Job de geometria

- `src/lib/geometria/status.ts` — `STATUS_GEOMETRIA`, `ROTULO_GEOMETRIA`, `estaLocalizada`,
  `aguardandoLocalizacao`, `temCoordenada`, `dataHoraLocal`.
- `src/lib/geometria/job.ts` — `processPendingGeometries`, `progressoGeometria`, `eventosGeometria`,
  `observarEventosGeometria`, `observarGeometria`, `limparEventosGeometria`.
- `src/lib/geometria.server.ts` / `geometria.functions.ts` — `buscarPendentes`, `gravarGeometrias`,
  `listarPendentesGeometria`, `salvarGeometrias`. Correções manuais nunca são sobrescritas pelo job.
- `src/components/geometria/PainelGeometria.tsx` — notificações em tempo real no Mapa e na Rota.

### 3.7 Rotas de campo

- `src/lib/rotas/inteligente.ts` — `acessosDoTrecho`, `pontoMaisProximo`, `gerarRotaInteligente`
  (vizinho mais próximo com distâncias reais do OSRM).
- `src/lib/rotas/validacao.ts` — `validarRota`, `textoDosProblemas`.
- `src/lib/rotas/pdf.ts` — `gerarPdfRota`, `nomeArquivoRota`.
- `src/lib/osrm.server.ts` / `osrm.functions.ts` — `calcularPercurso`.

### 3.8 Auditoria e pipeline

- `src/lib/pipeline/etapas.ts` — as 12 etapas, criticidade, `bloqueiosCriticos`, `pendenciasNaoCriticas`.
- `src/lib/pipeline/checklist.ts` — `executarChecklistPipeline`, `checklistPersistido`, `atualizarEtapasDivergentes`.
- `src/lib/pipeline/consistencia.ts` — `validatePipelineConsistency`, `testarPersistenciaOffline`, `elegivelParaRota`.
- `src/lib/pipeline/simulacao-der.ts` — `simularQuedaDoDer` (403 / timeout / indisponível, com fallback ao cache).
- `src/lib/pipeline.server.ts` / `pipeline.functions.ts` — persistência do checklist, simulações e log de auditoria.
- `src/lib/auditoria.server.ts` / `auditoria.functions.ts` — `auditar`, `registrarValidacao`.
- `src/lib/auditoria/exportar.ts` — `exportarDiagnosticoCsv/Pdf`, `exportarChecklistCsv/Pdf` (CSV UTF-8 com BOM, PDF A4 paisagem).
- `src/components/auditoria/ChecklistPipeline.tsx`, `SimulacaoDer.tsx`.

### 3.9 Campo (inspeções e ocorrências)

`src/lib/campo.server.ts` / `campo.functions.ts` — `criarInspecao`, `listarInspecoes`, `atualizarInspecao`,
`criarOcorrencia`, `listarOcorrencias`, `atualizarOcorrencia`.
UI: `src/components/campo/FormularioCampo.tsx` (foto, GPS, observação).

### 3.10 Offline

- `src/lib/offline/db.ts` — Dexie: `guardarProgramacoes`, `lerProgramacoes`, `guardarMalha`, `lerMalha`,
  `guardarRotas`, `lerRotas`, `guardarRotaLocal`, `registrarFiscalizacao`, `lerFiscalizacao`,
  `guardarImportacoes`, `guardarImportacaoDetalhe`, `lerImportacoes`, `lerImportacao`, `guardarPdf`, `lerPdfs`,
  `guardarRegistroCampoLocal`, `guardarRegistrosCampo`, `lerRegistrosCampo`, `resumoLocal`,
  `limparImportacaoLocal`, `limparPdfLocal`, `limparRegional`, `limparOutrasRegionais`.
- `src/lib/offline/sync.ts` — fila: `enfileirar`, `contarPendencias`, `processarFila`, `useSincronizacao`.
- `public/sw.js` — service worker (app shell + tiles de mapa).
- `src/lib/importar-com-retry.ts` — reimporta módulos lazy limpando cache quando o hash do asset muda.

---

## 4. Banco de dados

| Tabela | Conteúdo |
| --- | --- |
| `regionais` | Regionais CGR (código, rótulo, número, sede). |
| `funcionarios` | Nome, matrícula, equipe, regional. Base do filtro no servidor. |
| `arquivos_programacao` | PDFs enviados (hash, metadados). |
| `importacoes_pdf` | Histórico de importações e totais. |
| `importacao_registros` | Área de conferência (staging) por linha do PDF. |
| `programacoes` | Programação oficial: rodovia, km, datas, status, geometria, conferência. |
| `programacao_eventos` | Trilha de mudanças por serviço. |
| `rotas` / `rota_itens` | Rotas geradas, versão da rota e da programação. |
| `inspecoes` / `ocorrencias` | Registros de campo. |
| `pipeline_validacoes` | Checklist das 12 etapas, com histórico. |
| `simulacoes_der` | Resultados das simulações de queda do DER-SP. |
| `auditoria_log` | Log de ações por funcionário/regional. |

Todas com RLS habilitada e `GRANT` explícito; o acesso de escrita passa por server functions
que resolvem a regional pelo id do funcionário.

---

## 5. Regras de negócio principais

1. **Sem autenticação** — nada de login, perfis de acesso ou PIN.
2. **Isolamento regional** — toda consulta e gravação filtra por `regional_id` no servidor.
3. **Nada se perde na importação** — todo registro com regional válida é promovido; o que precisa de
   revisão entra como `pendente`, nunca é descartado em silêncio.
4. **Data fora do período** — registros fora do intervalo declarado no PDF recebem
   `DATA_FORA_DO_PERIODO_CONFERIR` e podem ser tratados em lote.
5. **Bloqueio de rota** — etapa crítica `DIVERGENTE`/`ERRO` impede gerar ou recalcular a rota;
   pendência apenas de localização permite **rota parcial**.
6. **Prioridade manual** — coordenadas confirmadas manualmente não são sobrescritas pelo job.
7. **Contingência DER** — se o WebRota falhar, o app usa o cache local e sinaliza o modo contingência.

---

## 6. Desenvolvimento

```sh
npm i
npm run dev      # http://localhost:8080
npm run test     # Vitest (inclui o teste do PDF de referência)
npm run lint
npm run build
```

Estrutura: rotas em `src/routes` (file-based, `routeTree.gen.ts` é gerado),
lógica de servidor em `*.server.ts`, RPC em `*.functions.ts`, UI em `src/components`.
