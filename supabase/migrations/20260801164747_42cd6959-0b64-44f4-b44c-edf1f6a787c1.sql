ALTER TABLE public.importacao_registros
  ADD COLUMN IF NOT EXISTS status_conferencia text NOT NULL DEFAULT 'OK',
  ADD COLUMN IF NOT EXISTS motivo_conferencia text,
  ADD COLUMN IF NOT EXISTS data_fora_periodo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS periodo_inicio_esperado date,
  ADD COLUMN IF NOT EXISTS periodo_fim_esperado date,
  ADD COLUMN IF NOT EXISTS conferido_em timestamptz,
  ADD COLUMN IF NOT EXISTS conferido_por text;

ALTER TABLE public.programacoes
  ADD COLUMN IF NOT EXISTS status_conferencia text NOT NULL DEFAULT 'OK',
  ADD COLUMN IF NOT EXISTS motivo_conferencia text,
  ADD COLUMN IF NOT EXISTS data_fora_periodo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS periodo_inicio_esperado date,
  ADD COLUMN IF NOT EXISTS periodo_fim_esperado date,
  ADD COLUMN IF NOT EXISTS conferido_por text;

CREATE INDEX IF NOT EXISTS idx_importacao_registros_status_conferencia
  ON public.importacao_registros (importacao_id, status_conferencia);
CREATE INDEX IF NOT EXISTS idx_programacoes_status_conferencia
  ON public.programacoes (regional_id, status_conferencia);