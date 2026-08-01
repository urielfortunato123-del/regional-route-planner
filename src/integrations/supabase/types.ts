export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      arquivos_programacao: {
        Row: {
          criado_em: string
          criado_por: string | null
          criado_por_id: string | null
          hash: string
          id: string
          nome: string
          periodo: string | null
          tipo_periodo: string | null
          total_paginas: number | null
          total_registros: number
          versao: number
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          criado_por_id?: string | null
          hash: string
          id?: string
          nome: string
          periodo?: string | null
          tipo_periodo?: string | null
          total_paginas?: number | null
          total_registros?: number
          versao?: number
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          criado_por_id?: string | null
          hash?: string
          id?: string
          nome?: string
          periodo?: string | null
          tipo_periodo?: string | null
          total_paginas?: number | null
          total_registros?: number
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "arquivos_programacao_criado_por_id_fkey"
            columns: ["criado_por_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      funcionarios: {
        Row: {
          ativo: boolean
          atualizado_em: string
          cargo: string | null
          criado_em: string
          equipe: string | null
          id: string
          matricula: string | null
          nome: string
          regional_id: string
          role: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          cargo?: string | null
          criado_em?: string
          equipe?: string | null
          id?: string
          matricula?: string | null
          nome: string
          regional_id: string
          role?: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          cargo?: string | null
          criado_em?: string
          equipe?: string | null
          id?: string
          matricula?: string | null
          nome?: string
          regional_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "funcionarios_regional_id_fkey"
            columns: ["regional_id"]
            isOneToOne: false
            referencedRelation: "regionais"
            referencedColumns: ["id"]
          },
        ]
      }
      importacao_registros: {
        Row: {
          atividade: string | null
          atualizado_em: string
          campos_corrigidos: string[]
          categoria: string | null
          chave_duplicidade: string | null
          conferido_em: string | null
          conferido_por: string | null
          contrato: string | null
          criado_em: string
          data_final: string | null
          data_fora_periodo: boolean
          data_inicial: string | null
          descricao: string | null
          duplicado: boolean
          equipe: string | null
          foi_corrigido: boolean
          funcionario: string | null
          id: string
          importacao_id: string
          km_final: number | null
          km_inicial: number | null
          medicao: string | null
          motivo_conferencia: string | null
          motivos: string[]
          observacao: string | null
          pagina_pdf: number | null
          periodo_fim_esperado: string | null
          periodo_inicio_esperado: string | null
          programacao_id: string | null
          regional_codigo: string | null
          regional_confirmada: boolean
          regional_id: string | null
          regional_origem: string | null
          rodovia: string | null
          status_conferencia: string
          status_validacao: string
          texto_original: string | null
          valores_extraidos: Json | null
        }
        Insert: {
          atividade?: string | null
          atualizado_em?: string
          campos_corrigidos?: string[]
          categoria?: string | null
          chave_duplicidade?: string | null
          conferido_em?: string | null
          conferido_por?: string | null
          contrato?: string | null
          criado_em?: string
          data_final?: string | null
          data_fora_periodo?: boolean
          data_inicial?: string | null
          descricao?: string | null
          duplicado?: boolean
          equipe?: string | null
          foi_corrigido?: boolean
          funcionario?: string | null
          id?: string
          importacao_id: string
          km_final?: number | null
          km_inicial?: number | null
          medicao?: string | null
          motivo_conferencia?: string | null
          motivos?: string[]
          observacao?: string | null
          pagina_pdf?: number | null
          periodo_fim_esperado?: string | null
          periodo_inicio_esperado?: string | null
          programacao_id?: string | null
          regional_codigo?: string | null
          regional_confirmada?: boolean
          regional_id?: string | null
          regional_origem?: string | null
          rodovia?: string | null
          status_conferencia?: string
          status_validacao?: string
          texto_original?: string | null
          valores_extraidos?: Json | null
        }
        Update: {
          atividade?: string | null
          atualizado_em?: string
          campos_corrigidos?: string[]
          categoria?: string | null
          chave_duplicidade?: string | null
          conferido_em?: string | null
          conferido_por?: string | null
          contrato?: string | null
          criado_em?: string
          data_final?: string | null
          data_fora_periodo?: boolean
          data_inicial?: string | null
          descricao?: string | null
          duplicado?: boolean
          equipe?: string | null
          foi_corrigido?: boolean
          funcionario?: string | null
          id?: string
          importacao_id?: string
          km_final?: number | null
          km_inicial?: number | null
          medicao?: string | null
          motivo_conferencia?: string | null
          motivos?: string[]
          observacao?: string | null
          pagina_pdf?: number | null
          periodo_fim_esperado?: string | null
          periodo_inicio_esperado?: string | null
          programacao_id?: string | null
          regional_codigo?: string | null
          regional_confirmada?: boolean
          regional_id?: string | null
          regional_origem?: string | null
          rodovia?: string | null
          status_conferencia?: string
          status_validacao?: string
          texto_original?: string | null
          valores_extraidos?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "importacao_registros_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "importacoes_pdf"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacao_registros_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacao_registros_regional_id_fkey"
            columns: ["regional_id"]
            isOneToOne: false
            referencedRelation: "regionais"
            referencedColumns: ["id"]
          },
        ]
      }
      importacoes_pdf: {
        Row: {
          arquivo_id: string | null
          atualizado_em: string
          caminho_arquivo: string | null
          confirmado_em: string | null
          criado_em: string
          hash_arquivo: string
          id: string
          importacao_anterior_id: string | null
          nome_arquivo: string
          periodo_fim: string | null
          periodo_inicio: string | null
          programacao_versao: number
          regionais_encontradas: string[]
          regional_origem_id: string | null
          status: string
          tipo_periodo: string | null
          total_duplicados: number
          total_erros: number
          total_paginas: number | null
          total_registros: number
          ultima_validacao: Json | null
          ultima_validacao_em: string | null
          usuario_id: string | null
          usuario_nome: string | null
          versao: number
        }
        Insert: {
          arquivo_id?: string | null
          atualizado_em?: string
          caminho_arquivo?: string | null
          confirmado_em?: string | null
          criado_em?: string
          hash_arquivo: string
          id?: string
          importacao_anterior_id?: string | null
          nome_arquivo: string
          periodo_fim?: string | null
          periodo_inicio?: string | null
          programacao_versao?: number
          regionais_encontradas?: string[]
          regional_origem_id?: string | null
          status?: string
          tipo_periodo?: string | null
          total_duplicados?: number
          total_erros?: number
          total_paginas?: number | null
          total_registros?: number
          ultima_validacao?: Json | null
          ultima_validacao_em?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
          versao?: number
        }
        Update: {
          arquivo_id?: string | null
          atualizado_em?: string
          caminho_arquivo?: string | null
          confirmado_em?: string | null
          criado_em?: string
          hash_arquivo?: string
          id?: string
          importacao_anterior_id?: string | null
          nome_arquivo?: string
          periodo_fim?: string | null
          periodo_inicio?: string | null
          programacao_versao?: number
          regionais_encontradas?: string[]
          regional_origem_id?: string | null
          status?: string
          tipo_periodo?: string | null
          total_duplicados?: number
          total_erros?: number
          total_paginas?: number | null
          total_registros?: number
          ultima_validacao?: Json | null
          ultima_validacao_em?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "importacoes_pdf_arquivo_id_fkey"
            columns: ["arquivo_id"]
            isOneToOne: false
            referencedRelation: "arquivos_programacao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacoes_pdf_importacao_anterior_id_fkey"
            columns: ["importacao_anterior_id"]
            isOneToOne: false
            referencedRelation: "importacoes_pdf"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacoes_pdf_regional_origem_id_fkey"
            columns: ["regional_origem_id"]
            isOneToOne: false
            referencedRelation: "regionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacoes_pdf_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      inspecoes: {
        Row: {
          atividade: string | null
          atualizado_em: string
          condicao: string | null
          contrato: string | null
          criado_em: string
          equipe: string | null
          fotos: Json
          funcionario_id: string | null
          funcionario_nome: string
          id: string
          km_final: number | null
          km_inicial: number | null
          latitude: number | null
          longitude: number | null
          nao_conformidade: string | null
          observacao: string | null
          programacao_id: string | null
          regional_codigo: string
          regional_id: string
          registrada_em: string
          rodovia: string | null
          servico_executado: string | null
          situacao: string
        }
        Insert: {
          atividade?: string | null
          atualizado_em?: string
          condicao?: string | null
          contrato?: string | null
          criado_em?: string
          equipe?: string | null
          fotos?: Json
          funcionario_id?: string | null
          funcionario_nome: string
          id?: string
          km_final?: number | null
          km_inicial?: number | null
          latitude?: number | null
          longitude?: number | null
          nao_conformidade?: string | null
          observacao?: string | null
          programacao_id?: string | null
          regional_codigo: string
          regional_id: string
          registrada_em?: string
          rodovia?: string | null
          servico_executado?: string | null
          situacao?: string
        }
        Update: {
          atividade?: string | null
          atualizado_em?: string
          condicao?: string | null
          contrato?: string | null
          criado_em?: string
          equipe?: string | null
          fotos?: Json
          funcionario_id?: string | null
          funcionario_nome?: string
          id?: string
          km_final?: number | null
          km_inicial?: number | null
          latitude?: number | null
          longitude?: number | null
          nao_conformidade?: string | null
          observacao?: string | null
          programacao_id?: string | null
          regional_codigo?: string
          regional_id?: string
          registrada_em?: string
          rodovia?: string | null
          servico_executado?: string | null
          situacao?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspecoes_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspecoes_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspecoes_regional_id_fkey"
            columns: ["regional_id"]
            isOneToOne: false
            referencedRelation: "regionais"
            referencedColumns: ["id"]
          },
        ]
      }
      ocorrencias: {
        Row: {
          atualizado_em: string
          contrato: string | null
          criado_em: string
          descricao: string
          equipe: string | null
          faixa: string | null
          fotos: Json
          funcionario_id: string | null
          funcionario_nome: string
          id: string
          km: number | null
          km_final: number | null
          latitude: number | null
          longitude: number | null
          necessita_atendimento: boolean
          observacao: string | null
          prazo: string | null
          prioridade: string
          programacao_id: string | null
          regional_codigo: string
          regional_id: string
          registrada_em: string
          risco: string | null
          rodovia: string | null
          sentido: string | null
          situacao: string
          tipo: string
        }
        Insert: {
          atualizado_em?: string
          contrato?: string | null
          criado_em?: string
          descricao: string
          equipe?: string | null
          faixa?: string | null
          fotos?: Json
          funcionario_id?: string | null
          funcionario_nome: string
          id?: string
          km?: number | null
          km_final?: number | null
          latitude?: number | null
          longitude?: number | null
          necessita_atendimento?: boolean
          observacao?: string | null
          prazo?: string | null
          prioridade?: string
          programacao_id?: string | null
          regional_codigo: string
          regional_id: string
          registrada_em?: string
          risco?: string | null
          rodovia?: string | null
          sentido?: string | null
          situacao?: string
          tipo: string
        }
        Update: {
          atualizado_em?: string
          contrato?: string | null
          criado_em?: string
          descricao?: string
          equipe?: string | null
          faixa?: string | null
          fotos?: Json
          funcionario_id?: string | null
          funcionario_nome?: string
          id?: string
          km?: number | null
          km_final?: number | null
          latitude?: number | null
          longitude?: number | null
          necessita_atendimento?: boolean
          observacao?: string | null
          prazo?: string | null
          prioridade?: string
          programacao_id?: string | null
          regional_codigo?: string
          regional_id?: string
          registrada_em?: string
          risco?: string | null
          rodovia?: string | null
          sentido?: string | null
          situacao?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "ocorrencias_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencias_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencias_regional_id_fkey"
            columns: ["regional_id"]
            isOneToOne: false
            referencedRelation: "regionais"
            referencedColumns: ["id"]
          },
        ]
      }
      programacao_eventos: {
        Row: {
          criado_em: string
          fotos: string[]
          id: string
          latitude: number | null
          longitude: number | null
          observacao: string | null
          programacao_id: string
          status: string
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          criado_em?: string
          fotos?: string[]
          id?: string
          latitude?: number | null
          longitude?: number | null
          observacao?: string | null
          programacao_id: string
          status: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          criado_em?: string
          fotos?: string[]
          id?: string
          latitude?: number | null
          longitude?: number | null
          observacao?: string | null
          programacao_id?: string
          status?: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programacao_eventos_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_eventos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      programacoes: {
        Row: {
          arquivo_id: string | null
          assumido_em: string | null
          assumido_por: string | null
          atividade: string | null
          atualizado_em: string
          categoria: string | null
          chave_duplicidade: string | null
          conferido_em: string | null
          conferido_por: string | null
          contrato: string | null
          criado_em: string
          data_final: string | null
          data_fora_periodo: boolean
          data_inicial: string | null
          descricao: string | null
          equipe: string | null
          extraido_em: string | null
          funcionario: string | null
          geometria: Json | null
          geometria_erro: string | null
          geometria_fonte: string | null
          geometria_precisao: string | null
          geometria_processada_em: string | null
          id: string
          importacao_id: string | null
          importacao_registro_id: string | null
          km_final: number | null
          km_inicial: number | null
          latitude_final: number | null
          latitude_inicial: number | null
          linha_bruta: string | null
          localizacao_confirmada: boolean
          localizacao_precisao_m: number | null
          longitude_final: number | null
          longitude_inicial: number | null
          medicao: string | null
          motivo_conferencia: string | null
          observacao: string | null
          pagina_pdf: number | null
          periodo_fim_esperado: string | null
          periodo_inicio_esperado: string | null
          persistido_em: string
          regional_codigo: string | null
          regional_confirmada: boolean
          regional_id: string | null
          regional_origem: string | null
          rodovia: string | null
          status: string
          status_conferencia: string
          status_geometria: string
          ultima_validacao_em: string | null
        }
        Insert: {
          arquivo_id?: string | null
          assumido_em?: string | null
          assumido_por?: string | null
          atividade?: string | null
          atualizado_em?: string
          categoria?: string | null
          chave_duplicidade?: string | null
          conferido_em?: string | null
          conferido_por?: string | null
          contrato?: string | null
          criado_em?: string
          data_final?: string | null
          data_fora_periodo?: boolean
          data_inicial?: string | null
          descricao?: string | null
          equipe?: string | null
          extraido_em?: string | null
          funcionario?: string | null
          geometria?: Json | null
          geometria_erro?: string | null
          geometria_fonte?: string | null
          geometria_precisao?: string | null
          geometria_processada_em?: string | null
          id?: string
          importacao_id?: string | null
          importacao_registro_id?: string | null
          km_final?: number | null
          km_inicial?: number | null
          latitude_final?: number | null
          latitude_inicial?: number | null
          linha_bruta?: string | null
          localizacao_confirmada?: boolean
          localizacao_precisao_m?: number | null
          longitude_final?: number | null
          longitude_inicial?: number | null
          medicao?: string | null
          motivo_conferencia?: string | null
          observacao?: string | null
          pagina_pdf?: number | null
          periodo_fim_esperado?: string | null
          periodo_inicio_esperado?: string | null
          persistido_em?: string
          regional_codigo?: string | null
          regional_confirmada?: boolean
          regional_id?: string | null
          regional_origem?: string | null
          rodovia?: string | null
          status?: string
          status_conferencia?: string
          status_geometria?: string
          ultima_validacao_em?: string | null
        }
        Update: {
          arquivo_id?: string | null
          assumido_em?: string | null
          assumido_por?: string | null
          atividade?: string | null
          atualizado_em?: string
          categoria?: string | null
          chave_duplicidade?: string | null
          conferido_em?: string | null
          conferido_por?: string | null
          contrato?: string | null
          criado_em?: string
          data_final?: string | null
          data_fora_periodo?: boolean
          data_inicial?: string | null
          descricao?: string | null
          equipe?: string | null
          extraido_em?: string | null
          funcionario?: string | null
          geometria?: Json | null
          geometria_erro?: string | null
          geometria_fonte?: string | null
          geometria_precisao?: string | null
          geometria_processada_em?: string | null
          id?: string
          importacao_id?: string | null
          importacao_registro_id?: string | null
          km_final?: number | null
          km_inicial?: number | null
          latitude_final?: number | null
          latitude_inicial?: number | null
          linha_bruta?: string | null
          localizacao_confirmada?: boolean
          localizacao_precisao_m?: number | null
          longitude_final?: number | null
          longitude_inicial?: number | null
          medicao?: string | null
          motivo_conferencia?: string | null
          observacao?: string | null
          pagina_pdf?: number | null
          periodo_fim_esperado?: string | null
          periodo_inicio_esperado?: string | null
          persistido_em?: string
          regional_codigo?: string | null
          regional_confirmada?: boolean
          regional_id?: string | null
          regional_origem?: string | null
          rodovia?: string | null
          status?: string
          status_conferencia?: string
          status_geometria?: string
          ultima_validacao_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programacoes_arquivo_id_fkey"
            columns: ["arquivo_id"]
            isOneToOne: false
            referencedRelation: "arquivos_programacao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacoes_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "importacoes_pdf"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacoes_regional_id_fkey"
            columns: ["regional_id"]
            isOneToOne: false
            referencedRelation: "regionais"
            referencedColumns: ["id"]
          },
        ]
      }
      regionais: {
        Row: {
          aliases: string[]
          ativo: boolean
          codigo: string
          criado_em: string
          id: string
          limite_geojson: Json | null
          nome: string
          numero: number | null
          rotulo: string
          sede_latitude: number | null
          sede_longitude: number | null
        }
        Insert: {
          aliases?: string[]
          ativo?: boolean
          codigo: string
          criado_em?: string
          id?: string
          limite_geojson?: Json | null
          nome: string
          numero?: number | null
          rotulo: string
          sede_latitude?: number | null
          sede_longitude?: number | null
        }
        Update: {
          aliases?: string[]
          ativo?: boolean
          codigo?: string
          criado_em?: string
          id?: string
          limite_geojson?: Json | null
          nome?: string
          numero?: number | null
          rotulo?: string
          sede_latitude?: number | null
          sede_longitude?: number | null
        }
        Relationships: []
      }
      rota_itens: {
        Row: {
          criado_em: string
          distancia_anterior: number | null
          id: string
          latitude: number | null
          longitude: number | null
          ordem: number
          ponto_de_entrada: string
          programacao_id: string | null
          rota_id: string
          rotulo: string | null
          status: string
          tempo_anterior: number | null
        }
        Insert: {
          criado_em?: string
          distancia_anterior?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          ordem?: number
          ponto_de_entrada?: string
          programacao_id?: string | null
          rota_id: string
          rotulo?: string | null
          status?: string
          tempo_anterior?: number | null
        }
        Update: {
          criado_em?: string
          distancia_anterior?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          ordem?: number
          ponto_de_entrada?: string
          programacao_id?: string | null
          rota_id?: string
          rotulo?: string | null
          status?: string
          tempo_anterior?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rota_itens_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rota_itens_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "rotas"
            referencedColumns: ["id"]
          },
        ]
      }
      rotas: {
        Row: {
          algoritmo_roteamento: string | null
          atualizado_em: string
          criado_em: string
          data: string
          distancia_total: number | null
          geometria: Json | null
          gerada_em: string
          id: string
          importacao_id: string | null
          origem_coordenadas: Json | null
          origem_tipo: string | null
          ponto_final: Json | null
          ponto_inicial: Json | null
          programacao_versao: number | null
          quantidade_servicos: number
          regional_id: string
          servicos_ids: string[]
          status: string
          tempo_estimado: number | null
          tipo: string
          usuario_id: string | null
          usuario_nome: string | null
          versao_rota: number
        }
        Insert: {
          algoritmo_roteamento?: string | null
          atualizado_em?: string
          criado_em?: string
          data?: string
          distancia_total?: number | null
          geometria?: Json | null
          gerada_em?: string
          id?: string
          importacao_id?: string | null
          origem_coordenadas?: Json | null
          origem_tipo?: string | null
          ponto_final?: Json | null
          ponto_inicial?: Json | null
          programacao_versao?: number | null
          quantidade_servicos?: number
          regional_id: string
          servicos_ids?: string[]
          status?: string
          tempo_estimado?: number | null
          tipo?: string
          usuario_id?: string | null
          usuario_nome?: string | null
          versao_rota?: number
        }
        Update: {
          algoritmo_roteamento?: string | null
          atualizado_em?: string
          criado_em?: string
          data?: string
          distancia_total?: number | null
          geometria?: Json | null
          gerada_em?: string
          id?: string
          importacao_id?: string | null
          origem_coordenadas?: Json | null
          origem_tipo?: string | null
          ponto_final?: Json | null
          ponto_inicial?: Json | null
          programacao_versao?: number | null
          quantidade_servicos?: number
          regional_id?: string
          servicos_ids?: string[]
          status?: string
          tempo_estimado?: number | null
          tipo?: string
          usuario_id?: string | null
          usuario_nome?: string | null
          versao_rota?: number
        }
        Relationships: [
          {
            foreignKeyName: "rotas_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "importacoes_pdf"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotas_regional_id_fkey"
            columns: ["regional_id"]
            isOneToOne: false
            referencedRelation: "regionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
