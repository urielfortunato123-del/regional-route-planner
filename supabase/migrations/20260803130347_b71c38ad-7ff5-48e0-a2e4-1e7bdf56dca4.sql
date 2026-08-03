ALTER TABLE public.programacoes
  ADD COLUMN IF NOT EXISTS sentido text,
  ADD COLUMN IF NOT EXISTS municipio text,
  ADD COLUMN IF NOT EXISTS referencia_local text,
  ADD COLUMN IF NOT EXISTS localizacao_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS localizacao_manual_em timestamptz,
  ADD COLUMN IF NOT EXISTS localizacao_manual_por text,
  ADD COLUMN IF NOT EXISTS solicitacao_confirmacao_em timestamptz,
  ADD COLUMN IF NOT EXISTS solicitacao_confirmacao_por text;

ALTER TABLE public.programacao_eventos
  ADD COLUMN IF NOT EXISTS chave_idempotencia text;

CREATE UNIQUE INDEX IF NOT EXISTS programacao_eventos_chave_idem_idx
  ON public.programacao_eventos (chave_idempotencia)
  WHERE chave_idempotencia IS NOT NULL;