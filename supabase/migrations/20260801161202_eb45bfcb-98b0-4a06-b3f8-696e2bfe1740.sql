INSERT INTO public.importacoes_pdf (
  nome_arquivo, hash_arquivo, periodo_inicio, periodo_fim, tipo_periodo, total_paginas,
  status, usuario_nome, usuario_id, regionais_encontradas, total_registros, total_erros,
  total_duplicados, versao, arquivo_id, criado_em, confirmado_em
)
SELECT
  a.nome,
  a.hash,
  NULLIF(split_part(a.periodo, ' a ', 1), '')::date,
  NULLIF(split_part(a.periodo, ' a ', 2), '')::date,
  COALESCE(a.tipo_periodo, 'semanal'),
  a.total_paginas,
  'confirmado',
  a.criado_por,
  a.criado_por_id,
  COALESCE((SELECT array_agg(DISTINCT p.regional_codigo) FROM public.programacoes p WHERE p.arquivo_id = a.id AND p.regional_codigo IS NOT NULL), '{}'),
  (SELECT count(*) FROM public.programacoes p WHERE p.arquivo_id = a.id),
  0,
  0,
  COALESCE(a.versao, 1),
  a.id,
  a.criado_em,
  a.criado_em
FROM public.arquivos_programacao a
WHERE NOT EXISTS (SELECT 1 FROM public.importacoes_pdf i WHERE i.arquivo_id = a.id);

UPDATE public.programacoes p
SET importacao_id = i.id
FROM public.importacoes_pdf i
WHERE i.arquivo_id = p.arquivo_id AND p.importacao_id IS NULL;