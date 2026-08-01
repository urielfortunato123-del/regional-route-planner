-- ============ REGIONAIS ============
CREATE TABLE public.regionais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  numero INTEGER,
  nome TEXT NOT NULL,
  rotulo TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  limite_geojson JSONB,
  sede_latitude DOUBLE PRECISION,
  sede_longitude DOUBLE PRECISION,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.regionais TO service_role;
ALTER TABLE public.regionais ENABLE ROW LEVEL SECURITY;

-- ============ FUNCIONARIOS ============
CREATE TABLE public.funcionarios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  matricula TEXT,
  cargo TEXT,
  regional_id UUID NOT NULL REFERENCES public.regionais(id) ON DELETE RESTRICT,
  equipe TEXT,
  role TEXT NOT NULL DEFAULT 'funcionario' CHECK (role IN ('funcionario','gestor','admin')),
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX funcionarios_nome_regional_idx
  ON public.funcionarios (lower(nome), regional_id);
GRANT ALL ON public.funcionarios TO service_role;
ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;

-- ============ ARQUIVOS DE PROGRAMACAO ============
CREATE TABLE public.arquivos_programacao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  hash TEXT NOT NULL,
  periodo TEXT,
  tipo_periodo TEXT,
  versao INTEGER NOT NULL DEFAULT 1,
  total_paginas INTEGER,
  total_registros INTEGER NOT NULL DEFAULT 0,
  criado_por TEXT,
  criado_por_id UUID REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX arquivos_programacao_hash_idx ON public.arquivos_programacao (hash);
GRANT ALL ON public.arquivos_programacao TO service_role;
ALTER TABLE public.arquivos_programacao ENABLE ROW LEVEL SECURITY;

-- ============ PROGRAMACOES ============
CREATE TABLE public.programacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  arquivo_id UUID REFERENCES public.arquivos_programacao(id) ON DELETE CASCADE,
  regional_id UUID REFERENCES public.regionais(id) ON DELETE RESTRICT,
  regional_codigo TEXT,
  regional_confirmada BOOLEAN NOT NULL DEFAULT false,
  regional_origem TEXT,
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
  pagina_pdf INTEGER,
  linha_bruta TEXT,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','na_rota','em_deslocamento','no_local','em_fiscalizacao','concluido','nao_localizado','reagendado','cancelado')),
  assumido_por TEXT,
  assumido_em TIMESTAMPTZ,
  latitude_inicial DOUBLE PRECISION,
  longitude_inicial DOUBLE PRECISION,
  latitude_final DOUBLE PRECISION,
  longitude_final DOUBLE PRECISION,
  localizacao_confirmada BOOLEAN NOT NULL DEFAULT false,
  localizacao_precisao_m INTEGER,
  chave_duplicidade TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX programacoes_regional_idx ON public.programacoes (regional_id);
CREATE INDEX programacoes_data_idx ON public.programacoes (data_inicial);
CREATE INDEX programacoes_dup_idx ON public.programacoes (chave_duplicidade);
GRANT ALL ON public.programacoes TO service_role;
ALTER TABLE public.programacoes ENABLE ROW LEVEL SECURITY;

-- ============ EVENTOS / HISTORICO ============
CREATE TABLE public.programacao_eventos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  programacao_id UUID NOT NULL REFERENCES public.programacoes(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  usuario_nome TEXT,
  usuario_id UUID REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  observacao TEXT,
  fotos TEXT[] NOT NULL DEFAULT '{}',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX programacao_eventos_prog_idx ON public.programacao_eventos (programacao_id);
GRANT ALL ON public.programacao_eventos TO service_role;
ALTER TABLE public.programacao_eventos ENABLE ROW LEVEL SECURITY;

-- ============ ROTAS ============
CREATE TABLE public.rotas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id UUID REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  usuario_nome TEXT,
  regional_id UUID NOT NULL REFERENCES public.regionais(id) ON DELETE RESTRICT,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo TEXT NOT NULL DEFAULT 'sugerida' CHECK (tipo IN ('sugerida','manual')),
  ponto_inicial JSONB,
  ponto_final JSONB,
  distancia_total NUMERIC(12,2),
  tempo_estimado INTEGER,
  geometria JSONB,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','ativa','concluida','cancelada')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX rotas_regional_idx ON public.rotas (regional_id);
GRANT ALL ON public.rotas TO service_role;
ALTER TABLE public.rotas ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.rota_itens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rota_id UUID NOT NULL REFERENCES public.rotas(id) ON DELETE CASCADE,
  programacao_id UUID REFERENCES public.programacoes(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL DEFAULT 0,
  ponto_de_entrada TEXT NOT NULL DEFAULT 'inicio' CHECK (ponto_de_entrada IN ('inicio','fim','proximo')),
  rotulo TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'pendente',
  distancia_anterior NUMERIC(12,2),
  tempo_anterior INTEGER,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX rota_itens_rota_idx ON public.rota_itens (rota_id);
GRANT ALL ON public.rota_itens TO service_role;
ALTER TABLE public.rota_itens ENABLE ROW LEVEL SECURITY;

-- ============ TRIGGER updated_at ============
CREATE OR REPLACE FUNCTION public.touch_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER funcionarios_touch BEFORE UPDATE ON public.funcionarios
  FOR EACH ROW EXECUTE FUNCTION public.touch_atualizado_em();
CREATE TRIGGER programacoes_touch BEFORE UPDATE ON public.programacoes
  FOR EACH ROW EXECUTE FUNCTION public.touch_atualizado_em();
CREATE TRIGGER rotas_touch BEFORE UPDATE ON public.rotas
  FOR EACH ROW EXECUTE FUNCTION public.touch_atualizado_em();

-- ============ DADOS INICIAIS ============
INSERT INTO public.regionais (codigo, numero, nome, rotulo, aliases, sede_latitude, sede_longitude) VALUES
  ('CGR_02_ITAPETININGA', 2, 'Itapetininga', 'CGR.2 - Itapetininga',
   ARRAY['cgr.2','cgr 2','cgr2','cgr.02','cgr 02','cgr02','itapetininga','regional 2','regional 02','dr-02','dr 02','dr02','dr-2'],
   -23.5915, -48.0530),
  ('CGR_03_BAURU', 3, 'Bauru', 'CGR.3 - Bauru',
   ARRAY['cgr.3','cgr 3','cgr3','cgr.03','cgr 03','cgr03','bauru','regional 3','regional 03','dr-03','dr 03','dr03','dr-3'],
   -22.3145, -49.0605),
  ('CGR_13_RIO_CLARO', 13, 'Rio Claro', 'CGR.13 - Rio Claro',
   ARRAY['cgr.13','cgr 13','cgr13','rio claro','regional 13','dr-13','dr 13','dr13'],
   -22.4149, -47.5651);