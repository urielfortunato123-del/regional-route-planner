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
          contrato: string | null
          criado_em: string
          data_final: string | null
          data_inicial: string | null
          descricao: string | null
          equipe: string | null
          funcionario: string | null
          id: string
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
          observacao: string | null
          pagina_pdf: number | null
          regional_codigo: string | null
          regional_confirmada: boolean
          regional_id: string | null
          regional_origem: string | null
          rodovia: string | null
          status: string
        }
        Insert: {
          arquivo_id?: string | null
          assumido_em?: string | null
          assumido_por?: string | null
          atividade?: string | null
          atualizado_em?: string
          categoria?: string | null
          chave_duplicidade?: string | null
          contrato?: string | null
          criado_em?: string
          data_final?: string | null
          data_inicial?: string | null
          descricao?: string | null
          equipe?: string | null
          funcionario?: string | null
          id?: string
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
          observacao?: string | null
          pagina_pdf?: number | null
          regional_codigo?: string | null
          regional_confirmada?: boolean
          regional_id?: string | null
          regional_origem?: string | null
          rodovia?: string | null
          status?: string
        }
        Update: {
          arquivo_id?: string | null
          assumido_em?: string | null
          assumido_por?: string | null
          atividade?: string | null
          atualizado_em?: string
          categoria?: string | null
          chave_duplicidade?: string | null
          contrato?: string | null
          criado_em?: string
          data_final?: string | null
          data_inicial?: string | null
          descricao?: string | null
          equipe?: string | null
          funcionario?: string | null
          id?: string
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
          observacao?: string | null
          pagina_pdf?: number | null
          regional_codigo?: string | null
          regional_confirmada?: boolean
          regional_id?: string | null
          regional_origem?: string | null
          rodovia?: string | null
          status?: string
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
          atualizado_em: string
          criado_em: string
          data: string
          distancia_total: number | null
          geometria: Json | null
          id: string
          ponto_final: Json | null
          ponto_inicial: Json | null
          regional_id: string
          status: string
          tempo_estimado: number | null
          tipo: string
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          data?: string
          distancia_total?: number | null
          geometria?: Json | null
          id?: string
          ponto_final?: Json | null
          ponto_inicial?: Json | null
          regional_id: string
          status?: string
          tempo_estimado?: number | null
          tipo?: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          data?: string
          distancia_total?: number | null
          geometria?: Json | null
          id?: string
          ponto_final?: Json | null
          ponto_inicial?: Json | null
          regional_id?: string
          status?: string
          tempo_estimado?: number | null
          tipo?: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: [
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
