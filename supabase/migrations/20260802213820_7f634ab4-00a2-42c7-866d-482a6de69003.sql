CREATE TABLE public.pipeline_validacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id uuid REFERENCES public.importacoes_pdf(id) ON DELETE CASCADE,
  regional_id uuid NOT NULL REFERENCES public.regionais(id) ON DELETE CASCADE,
  regional_codigo text NOT NULL DEFAULT '',
  programacao_versao integer NOT NULL DEFAULT 1,
  etapa text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDENTE',
  critica boolean NOT NULL DEFAULT false,
  esperado integer NOT NULL DEFAULT 0,
  encontrado integer NOT NULL DEFAULT 0,
  divergencia integer NOT NULL DEFAULT 0,
  registros_afetados jsonb NOT NULL DEFAULT '[]'::jsonb,
  motivo text,
  historico jsonb NOT NULL DEFAULT '[]'::jsonb,
  validado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX pipeline_validacoes_chave_idx
  ON public.pipeline_validacoes (importacao_id, regional_id, etapa);
CREATE INDEX pipeline_validacoes_regional_idx
  ON public.pipeline_validacoes (regional_id, status);

GRANT ALL ON public.pipeline_validacoes TO service_role;
ALTER TABLE public.pipeline_validacoes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.simulacoes_der (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id uuid REFERENCES public.importacoes_pdf(id) ON DELETE CASCADE,
  regional_id uuid NOT NULL REFERENCES public.regionais(id) ON DELETE CASCADE,
  regional_codigo text NOT NULL DEFAULT '',
  programacao_versao integer NOT NULL DEFAULT 1,
  tipo_simulacao text NOT NULL DEFAULT 'der_indisponivel',
  tipo_falha text NOT NULL DEFAULT 'http_403',
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  total_antes integer NOT NULL DEFAULT 0,
  total_depois integer NOT NULL DEFAULT 0,
  total_servicos integer NOT NULL DEFAULT 0,
  ja_localizados integer NOT NULL DEFAULT 0,
  localizados_fallback integer NOT NULL DEFAULT 0,
  aguardando_localizacao integer NOT NULL DEFAULT 0,
  com_erro integer NOT NULL DEFAULT 0,
  removidos integer NOT NULL DEFAULT 0,
  duplicados integer NOT NULL DEFAULT 0,
  resultado text NOT NULL DEFAULT 'aprovado',
  observacoes text,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_por text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX simulacoes_der_chave_idx
  ON public.simulacoes_der (importacao_id, regional_id, criado_em DESC);

GRANT ALL ON public.simulacoes_der TO service_role;
ALTER TABLE public.simulacoes_der ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.auditoria_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id uuid REFERENCES public.importacoes_pdf(id) ON DELETE CASCADE,
  regional_id uuid REFERENCES public.regionais(id) ON DELETE CASCADE,
  regional_codigo text,
  funcionario_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  funcionario_nome text,
  acao text NOT NULL,
  detalhe text,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auditoria_log_chave_idx
  ON public.auditoria_log (importacao_id, regional_id, criado_em DESC);

GRANT ALL ON public.auditoria_log TO service_role;
ALTER TABLE public.auditoria_log ENABLE ROW LEVEL SECURITY;