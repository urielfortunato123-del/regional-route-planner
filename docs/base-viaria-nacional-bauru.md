# Base Viária Nacional — Piloto Bauru

## Objetivo

Transformar o ViaCerta de uma aplicação dependente exclusivamente da malha do DER-SP em um motor viário multi-fonte, preservando rastreabilidade, confiança e operação offline.

O piloto começa pela área operacional da DR-03 / Bauru. A lista de municípios não deve ser mantida manualmente: o sistema usa o limite oficial da regional do DER-SP e, na etapa seguinte, cruza cada trecho com a Malha Municipal Digital do IBGE.

## Princípios

1. Geometria e quilometragem são atributos independentes.
2. O ViaCerta nunca deve inventar um KM oficial.
3. Uma fonte oficial prevalece sobre uma fonte complementar quando ambas representam a mesma via.
4. Toda via deve registrar fonte, data da fonte, confiança, UF, município e jurisdição.
5. O mapa-base visual não define sozinho a verdade operacional do motor de fiscalização.
6. Vicinais e estradas municipais podem ser exibidas mesmo sem KM oficial, desde que a fonte fique explícita.
7. O banco nacional fica no servidor; o aparelho baixa apenas pacotes regionais/offline necessários.

## Ordem das fontes

| Prioridade | Fonte | Uso |
|---:|---|---|
| 100 | DER-SP / WebRota | Rodovias estaduais, SPAs, acessos, geometria e marcos de SP |
| 95 | DNIT / SNV | Rodovias federais e trechos oficiais |
| 90 | IBGE / Malha Municipal Digital | UF, município, limites e geocódigo IBGE |
| 85 | Concessionárias | Base operacional oficial de trechos concedidos, quando disponível |
| 80 | Prefeituras | Vicinais e estradas municipais oficiais |
| 40 | OpenStreetMap | Complemento de vias locais sem base oficial acessível |

## Fases do piloto

### Fase 1 — Fundação de dados

- criar modelo nacional de vias e fontes;
- obter municípios da DR-03 diretamente da base DER;
- separar confiança de geometria e confiança de KM;
- registrar prioridade das fontes;
- impedir que OSM ou via municipal gere KM oficial automaticamente.

### Fase 2 — Território IBGE

- baixar a Malha Municipal Digital 2025 do IBGE em SIRGAS 2000;
- recortar os municípios do piloto Bauru;
- salvar código IBGE e geometria municipal;
- cruzar e segmentar vias por município;
- permitir consultas como "rodovias dentro de Bauru".

### Fase 3 — Rodovias federais DNIT/SNV

- importar a versão vigente do SNV;
- filtrar trechos que intersectem a região piloto;
- normalizar BR, UF, código SNV, administração e quilometragem;
- preservar a referência original do DNIT para auditoria.

### Fase 4 — Vicinais e estradas municipais

- procurar primeiro bases oficiais de prefeituras e órgãos locais;
- completar lacunas com OSM;
- classificar `vicinal`, `estrada_municipal`, `via_servico` e `outra`;
- mostrar "KM indisponível" quando não existir referência confiável.

### Fase 5 — Motor de localização unificado

Fluxo alvo:

`GPS -> território -> município -> vias candidatas -> prioridade da fonte -> distância -> direção -> continuidade -> rodovia/acesso/vicinal -> KM quando confiável`

O resultado deve separar:

- **via atual confirmada**;
- **via provável**;
- **vias próximas**;
- **KM oficial/interpolado/indisponível**.

### Fase 6 — Offline regional

- gerar pacote `BAURU_DR03` com as geometrias e metadados necessários;
- versionar o pacote;
- permitir atualização incremental;
- manter o APK enxuto;
- não baixar o Brasil inteiro para o aparelho.

## Critérios de aceite do piloto

O piloto só deve ser considerado pronto quando o ViaCerta conseguir, dentro da região de Bauru:

- identificar município atual;
- listar rodovias estaduais, federais, acessos e vicinais próximas;
- pesquisar uma via pelo código ou nome;
- mostrar a fonte de cada resultado;
- navegar para a via ou para um KM quando houver referência confiável;
- funcionar sem internet depois do pacote regional estar baixado;
- nunca exibir um KM inventado para vias sem referência confiável;
- manter DER-SP como referência principal das SP/SPA já existentes.

## Fontes oficiais usadas como referência

- DER-SP — WebRota / mapas rodoviários.
- DNIT — Sistema Nacional de Viação (SNV), versão vigente.
- IBGE — Malha Municipal Digital 2025, SIRGAS 2000.

## Estado atual

A fundação do modelo multi-fonte foi criada na branch `feature/base-viaria-bauru-piloto`.

Arquivos iniciais:

- `src/lib/viaria/types.ts`
- `src/lib/viaria/bauru.server.ts`
- `src/lib/viaria.functions.ts`

Próxima implementação: adaptadores de IBGE e DNIT + recorte do pacote regional de Bauru.
