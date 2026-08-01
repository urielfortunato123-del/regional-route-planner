CREATE TABLE public.inspecoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regional_id uuid NOT NULL REFERENCES public.regionais(id) ON DELETE CASCADE,
  regional_codigo text NOT NULL,
  programacao_id uuid REFERENCES public.programacoes(id) ON DELETE SET NULL,
  funcionario_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  funcionario_nome text NOT NULL,
  equipe text,
  contrato text,
  atividade text,
  rodovia text,
  km_inicial numeric,
  km_final numeric,
  condicao text,
  servico_executado text,
  nao_conformidade text,
  observacao text,
  situacao text NOT NULL DEFAULT 'registrada',
  fotos jsonb NOT NULL DEFAULT '[]'::jsonb,
  latitude numeric,
  longitude numeric,
  registrada_em timestamptz NOT NULL DEFAULT now(),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inspecoes_regional_idx ON public.inspecoes (regional_id, registrada_em DESC);
CREATE INDEX inspecoes_programacao_idx ON public.inspecoes (programacao_id);

GRANT ALL ON public.inspecoes TO service_role;
ALTER TABLE public.inspecoes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ocorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regional_id uuid NOT NULL REFERENCES public.regionais(id) ON DELETE CASCADE,
  regional_codigo text NOT NULL,
  programacao_id uuid REFERENCES public.programacoes(id) ON DELETE SET NULL,
  funcionario_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  funcionario_nome text NOT NULL,
  equipe text,
  contrato text,
  tipo text NOT NULL,
  rodovia text,
  km numeric,
  km_final numeric,
  sentido text,
  faixa text,
  prioridade text NOT NULL DEFAULT 'media',
  risco text,
  descricao text NOT NULL,
  necessita_atendimento boolean NOT NULL DEFAULT false,
  prazo date,
  observacao text,
  situacao text NOT NULL DEFAULT 'aberta',
  fotos jsonb NOT NULL DEFAULT '[]'::jsonb,
  latitude numeric,
  longitude numeric,
  registrada_em timestamptz NOT NULL DEFAULT now(),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ocorrencias_regional_idx ON public.ocorrencias (regional_id, registrada_em DESC);
CREATE INDEX ocorrencias_programacao_idx ON public.ocorrencias (programacao_id);

GRANT ALL ON public.ocorrencias TO service_role;
ALTER TABLE public.ocorrencias ENABLE ROW LEVEL SECURITY;