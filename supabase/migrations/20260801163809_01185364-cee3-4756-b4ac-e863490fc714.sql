ALTER TABLE public.programacoes
  ADD COLUMN IF NOT EXISTS status_geometria text NOT NULL DEFAULT 'AGUARDANDO_LOCALIZACAO',
  ADD COLUMN IF NOT EXISTS geometria_fonte text,
  ADD COLUMN IF NOT EXISTS geometria_precisao text,
  ADD COLUMN IF NOT EXISTS geometria jsonb,
  ADD COLUMN IF NOT EXISTS geometria_erro text,
  ADD COLUMN IF NOT EXISTS extraido_em timestamptz,
  ADD COLUMN IF NOT EXISTS conferido_em timestamptz,
  ADD COLUMN IF NOT EXISTS persistido_em timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS geometria_processada_em timestamptz,
  ADD COLUMN IF NOT EXISTS ultima_validacao_em timestamptz;

UPDATE public.programacoes
SET status_geometria = CASE
  WHEN latitude_inicial IS NOT NULL AND longitude_inicial IS NOT NULL AND localizacao_confirmada THEN 'LOCALIZADA_MANUAL'
  WHEN latitude_inicial IS NOT NULL AND longitude_inicial IS NOT NULL THEN 'LOCALIZADA_INTERPOLADA'
  ELSE 'AGUARDANDO_LOCALIZACAO'
END
WHERE status_geometria = 'AGUARDANDO_LOCALIZACAO';

CREATE INDEX IF NOT EXISTS programacoes_status_geometria_idx
  ON public.programacoes (regional_id, status_geometria);

ALTER TABLE public.rotas
  ADD COLUMN IF NOT EXISTS programacao_versao integer,
  ADD COLUMN IF NOT EXISTS versao_rota integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS gerada_em timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS origem_tipo text,
  ADD COLUMN IF NOT EXISTS origem_coordenadas jsonb,
  ADD COLUMN IF NOT EXISTS algoritmo_roteamento text,
  ADD COLUMN IF NOT EXISTS servicos_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS quantidade_servicos integer NOT NULL DEFAULT 0;

ALTER TABLE public.importacoes_pdf
  ADD COLUMN IF NOT EXISTS programacao_versao integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ultima_validacao_em timestamptz,
  ADD COLUMN IF NOT EXISTS ultima_validacao jsonb;

UPDATE public.importacoes_pdf SET programacao_versao = GREATEST(versao, 1) WHERE programacao_versao = 1;