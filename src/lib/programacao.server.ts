/**
 * Camada de acesso a dados — executa somente no servidor.
 * O filtro de regional é aplicado AQUI, nunca no navegador:
 * o cliente envia apenas o id do funcionário, e o servidor resolve
 * a regional e o perfil a partir do banco.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Perfil = {
  id: string;
  nome: string;
  matricula: string | null;
  cargo: string | null;
  equipe: string | null;
  role: "funcionario" | "gestor" | "admin";
  regional_id: string;
  regional_codigo: string;
  regional_rotulo: string;
};

export async function carregarPerfil(funcionarioId: string): Promise<Perfil> {
  const { data, error } = await supabaseAdmin
    .from("funcionarios")
    .select("id, nome, matricula, cargo, equipe, role, regional_id, regionais(codigo, rotulo)")
    .eq("id", funcionarioId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Funcionário não encontrado. Refaça a identificação.");

  const regional = data.regionais as unknown as { codigo: string; rotulo: string } | null;
  return {
    id: data.id,
    nome: data.nome,
    matricula: data.matricula,
    cargo: data.cargo,
    equipe: data.equipe,
    role: (data.role as Perfil["role"]) ?? "funcionario",
    regional_id: data.regional_id,
    regional_codigo: regional?.codigo ?? "",
    regional_rotulo: regional?.rotulo ?? "",
  };
}

export const COLUNAS_PROGRAMACAO =
  "id, regional_id, regional_codigo, regional_confirmada, equipe, funcionario, categoria, contrato, atividade, rodovia, km_inicial, km_final, descricao, data_inicial, data_final, medicao, observacao, pagina_pdf, status, assumido_por, assumido_em, latitude_inicial, longitude_inicial, latitude_final, longitude_final, localizacao_confirmada, arquivo_id, importacao_id";

/** Chave usada para detectar registros repetidos entre importações. */
export function montarChaveDuplicidade(r: {
  regional_codigo?: string | null;
  rodovia?: string | null;
  km_inicial?: number | null;
  km_final?: number | null;
  data_inicial?: string | null;
  contrato?: string | null;
  equipe?: string | null;
}) {
  return [
    r.regional_codigo ?? "",
    r.rodovia ?? "",
    r.km_inicial ?? "",
    r.km_final ?? "",
    r.data_inicial ?? "",
    r.contrato ?? "",
    r.equipe ?? "",
  ]
    .join("|")
    .toLowerCase();
}

export async function mapaRegionais() {
  const { data, error } = await supabaseAdmin.from("regionais").select("id, codigo, rotulo, nome, numero, sede_latitude, sede_longitude").eq("ativo", true).order("numero");
  if (error) throw new Error(error.message);
  return data ?? [];
}
