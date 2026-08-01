CREATE TABLE public.importacoes_pdf (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_arquivo TEXT NOT NULL,
  hash_arquivo TEXT NOT NULL,
  caminho_arquivo TEXT,
  periodo_inicio DATE,
  periodo_fim DATE,
  tipo_periodo TEXT,
  total_paginas INTEGER,
  status TEXT NOT NULL DEFAULT 'em_conferencia'
    CHECK (status IN ('enviado','processando','em_conferencia','confirmado','parcialmente_confirmado','com_erros','cancelado')),
  usuario_nome TEXT,
  usuario_id UUID REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  regional_origem_id UUID REFERENCES public.regionais(id) ON DELETE SET NULL,
  regionais_encontradas TEXT[] NOT NULL DEFAULT '{}',
  total_registros INTEGER NOT NULL DEFAULT 0,
  total_erros INTEGER NOT NULL DEFAULT 0,
  total_duplicados INTEGER NOT NULL DEFAULT 0,
  versao INTEGER NOT NULL DEFAULT 1,
  importacao_anterior_id UUID REFERENCES public.importacoes_pdf(id) ON DELETE SET NULL,
  arquivo_id UUID REFERENCES public.arquivos_programacao(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmado_em TIMESTAMPTZ
);
CREATE INDEX importacoes_pdf_hash_idx ON public.importacoes_pdf (hash_arquivo);
CREATE INDEX importacoes_pdf_status_idx ON public.importacoes_pdf (status);
GRANT ALL ON public.importacoes_pdf TO service_role;
ALTER TABLE public.importacoes_pdf ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.importacao_registros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  importacao_id UUID NOT NULL REFERENCES public.importacoes_pdf(id) ON DELETE CASCADE,
  regional_id UUID REFERENCES public.regionais(id) ON DELETE SET NULL,
  regional_codigo TEXT,
  regional_confirmada BOOLEAN NOT NULL DEFAULT false,
  regional_origem TEXT,
  pagina_pdf INTEGER,
  texto_original TEXT,
  valores_extraidos JSONB,
  equipe TEXT,
  funcionario TEXT,
  categoria TEXT,
  contrato TEXT,
  atividade TEXT,
  rodovia TEXT,
  km_inicial NUMERIC(10,3),
  km_final NUMERIC(10,3),
  descricao TEXT,
  data_inicial DATE,
  data_final DATE,
  medicao TEXT,
  observacao TEXT,
  chave_duplicidade TEXT,
  duplicado BOOLEAN NOT NULL DEFAULT false,
  status_validacao TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status_validacao IN ('pendente','valido','revisar','confirmado','rejeitado')),
  motivos TEXT[] NOT NULL DEFAULT '{}',
  campos_corrigidos TEXT[] NOT NULL DEFAULT '{}',
  foi_corrigido BOOLEAN NOT NULL DEFAULT false,
  programacao_id UUID REFERENCES public.programacoes(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX importacao_registros_importacao_idx ON public.importacao_registros (importacao_id);
CREATE INDEX importacao_registros_regional_idx ON public.importacao_registros (regional_id);
GRANT ALL ON public.importacao_registros TO service_role;
ALTER TABLE public.importacao_registros ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.programacoes
  ADD COLUMN importacao_id UUID REFERENCES public.importacoes_pdf(id) ON DELETE SET NULL,
  ADD COLUMN importacao_registro_id UUID;
CREATE INDEX programacoes_importacao_idx ON public.programacoes (importacao_id);

ALTER TABLE public.rotas
  ADD COLUMN importacao_id UUID REFERENCES public.importacoes_pdf(id) ON DELETE SET NULL;

CREATE TRIGGER importacoes_pdf_touch BEFORE UPDATE ON public.importacoes_pdf
  FOR EACH ROW EXECUTE FUNCTION public.touch_atualizado_em();
CREATE TRIGGER importacao_registros_touch BEFORE UPDATE ON public.importacao_registros
  FOR EACH ROW EXECUTE FUNCTION public.touch_atualizado_em();