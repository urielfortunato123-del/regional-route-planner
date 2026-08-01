/**
 * Banco local (IndexedDB via Dexie) — funcionamento offline.
 *
 * Regra central: TUDO o que é guardado carrega o código da regional. Ao trocar
 * de regional o aplicativo apaga os dados da regional anterior, de modo que
 * nunca existam informações de duas regionais no mesmo aparelho.
 */
import Dexie, { type Table } from "dexie";

export type ProgramacaoLocal = {
  id: string;
  regional_codigo: string;
  dados: Record<string, unknown>;
  atualizadoEm: number;
};

export type MalhaLocal = {
  chave: string; // ex.: "marcos:SP 304"
  regional_codigo: string;
  valor: unknown;
  atualizadoEm: number;
};

export type RotaLocal = {
  id: string;
  regional_codigo: string;
  dados: Record<string, unknown>;
  atualizadoEm: number;
};

export type FiscalizacaoLocal = {
  id: string;
  regional_codigo: string;
  programacao_id: string;
  status: string;
  observacao: string | null;
  latitude: number | null;
  longitude: number | null;
  criadoEm: number;
  sincronizado: number; // 0 ou 1 (IndexedDB não indexa boolean)
};

export type ImportacaoLocal = {
  id: string;
  regional_codigo: string;
  dados: Record<string, unknown>;
  registros?: Array<Record<string, unknown>>;
  atualizadoEm: number;
};

export type ArquivoLocal = {
  id: string;
  regional_codigo: string;
  nome: string;
  blob: Blob;
  criadoEm: number;
};

export type RegistroCampoLocal = {
  id: string;
  regional_codigo: string;
  tipo: "inspecao" | "ocorrencia";
  dados: Record<string, unknown>;
  pendente: number; // 0 ou 1 (IndexedDB não indexa boolean)
  criadoEm: number;
};

export type PendenciaLocal = {
  id?: number;
  regional_codigo: string;
  tipo: "status" | "correcao" | "exclusao" | "rota" | "coordenadas" | "inspecao" | "ocorrencia";
  payload: Record<string, unknown>;
  descricao: string;
  criadoEm: number;
  tentativas: number;
  ultimoErro: string | null;
};

class BancoLocal extends Dexie {
  programacoes!: Table<ProgramacaoLocal, string>;
  malha!: Table<MalhaLocal, string>;
  rotas!: Table<RotaLocal, string>;
  fiscalizacao!: Table<FiscalizacaoLocal, string>;
  pendencias!: Table<PendenciaLocal, number>;
  importacoes!: Table<ImportacaoLocal, string>;
  arquivos!: Table<ArquivoLocal, string>;
  campo!: Table<RegistroCampoLocal, string>;

  constructor() {
    super("programacao-regional");
    this.version(1).stores({
      programacoes: "id, regional_codigo, atualizadoEm",
      malha: "chave, regional_codigo, atualizadoEm",
      rotas: "id, regional_codigo, atualizadoEm",
      fiscalizacao: "id, regional_codigo, programacao_id, sincronizado",
      pendencias: "++id, regional_codigo, tipo, criadoEm",
    });
    this.version(2).stores({
      importacoes: "id, regional_codigo, atualizadoEm",
      arquivos: "id, regional_codigo, criadoEm",
    });
    this.version(3).stores({
      campo: "id, regional_codigo, tipo, pendente, criadoEm",
    });
  }
}

let instancia: BancoLocal | null = null;

/** Só existe no navegador; no servidor devolve null. */
export function banco(): BancoLocal | null {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return null;
  if (!instancia) instancia = new BancoLocal();
  return instancia;
}

// ------------------------------------------------------------ programação

export async function guardarProgramacoes(
  regional: string,
  registros: Array<Record<string, unknown>>,
) {
  const db = banco();
  if (!db) return;
  const agora = Date.now();
  await db.transaction("rw", db.programacoes, async () => {
    await db.programacoes.where("regional_codigo").equals(regional).delete();
    await db.programacoes.bulkPut(
      registros
        .filter((r) => typeof r["id"] === "string")
        .map((r) => ({
          id: String(r["id"]),
          regional_codigo: regional,
          dados: r,
          atualizadoEm: agora,
        })),
    );
  });
}

export async function lerProgramacoes(regional: string) {
  const db = banco();
  if (!db) return [];
  const linhas = await db.programacoes.where("regional_codigo").equals(regional).toArray();
  return linhas.map((l) => l.dados);
}

// ------------------------------------------------------------ malha (DER)

export async function guardarMalha(regional: string, chave: string, valor: unknown) {
  const db = banco();
  if (!db) return;
  await db.malha.put({ chave, regional_codigo: regional, valor, atualizadoEm: Date.now() });
}

export async function lerMalha<T>(chave: string): Promise<{ valor: T; em: number } | null> {
  const db = banco();
  if (!db) return null;
  const linha = await db.malha.get(chave);
  return linha ? { valor: linha.valor as T, em: linha.atualizadoEm } : null;
}

// ------------------------------------------------------------ rotas

export async function guardarRotas(regional: string, rotas: Array<Record<string, unknown>>) {
  const db = banco();
  if (!db) return;
  const agora = Date.now();
  await db.transaction("rw", db.rotas, async () => {
    await db.rotas.where("regional_codigo").equals(regional).delete();
    await db.rotas.bulkPut(
      rotas
        .filter((r) => typeof r["id"] === "string")
        .map((r) => ({
          id: String(r["id"]),
          regional_codigo: regional,
          dados: r,
          atualizadoEm: agora,
        })),
    );
  });
}

export async function lerRotas(regional: string) {
  const db = banco();
  if (!db) return [];
  return (await db.rotas.where("regional_codigo").equals(regional).toArray()).map((r) => r.dados);
}

export async function guardarRotaLocal(regional: string, rota: Record<string, unknown>) {
  const db = banco();
  if (!db) return;
  await db.rotas.put({
    id: String(rota["id"] ?? `local-${Date.now()}`),
    regional_codigo: regional,
    dados: rota,
    atualizadoEm: Date.now(),
  });
}

// ------------------------------------------------------------ fiscalização

export async function registrarFiscalizacao(item: Omit<FiscalizacaoLocal, "id">) {
  const db = banco();
  if (!db) return;
  await db.fiscalizacao.put({ ...item, id: `${item.programacao_id}-${item.criadoEm}` });
}

export async function lerFiscalizacao(regional: string) {
  const db = banco();
  if (!db) return [];
  return db.fiscalizacao.where("regional_codigo").equals(regional).toArray();
}

// ------------------------------------------------------------ importações

export async function guardarImportacoes(
  regional: string,
  importacoes: Array<Record<string, unknown>>,
) {
  const db = banco();
  if (!db) return;
  const agora = Date.now();
  await db.importacoes.bulkPut(
    importacoes
      .filter((i) => typeof i["id"] === "string")
      .map((i) => ({
        id: String(i["id"]),
        regional_codigo: regional,
        dados: i,
        atualizadoEm: agora,
      })),
  );
}

export async function guardarImportacaoDetalhe(
  regional: string,
  importacao: Record<string, unknown>,
  registros: Array<Record<string, unknown>>,
) {
  const db = banco();
  if (!db) return;
  await db.importacoes.put({
    id: String(importacao["id"]),
    regional_codigo: regional,
    dados: importacao,
    registros,
    atualizadoEm: Date.now(),
  });
}

export async function lerImportacoes(regional: string) {
  const db = banco();
  if (!db) return [];
  const linhas = await db.importacoes.where("regional_codigo").equals(regional).toArray();
  return linhas.sort((a, b) => b.atualizadoEm - a.atualizadoEm);
}

export async function lerImportacao(id: string) {
  const db = banco();
  if (!db) return null;
  return (await db.importacoes.get(id)) ?? null;
}

// ------------------------------------------------------------ PDFs gerados

export async function guardarPdf(regional: string, nome: string, blob: Blob) {
  const db = banco();
  if (!db) return;
  await db.arquivos.put({
    id: `${nome}-${Date.now()}`,
    regional_codigo: regional,
    nome,
    blob,
    criadoEm: Date.now(),
  });
}

export async function lerPdfs(regional: string) {
  const db = banco();
  if (!db) return [];
  return (await db.arquivos.where("regional_codigo").equals(regional).toArray()).sort(
    (a, b) => b.criadoEm - a.criadoEm,
  );
}

// ------------------------------------------------------------ inspeções e ocorrências

export async function guardarRegistroCampoLocal(
  regional: string,
  tipo: "inspecao" | "ocorrencia",
  registro: Record<string, unknown>,
) {
  const db = banco();
  if (!db) return;
  await db.campo.put({
    id: String(registro["id"] ?? `local-${Date.now()}`),
    regional_codigo: regional,
    tipo,
    dados: registro,
    pendente: registro["pendente"] ? 1 : 0,
    criadoEm: Date.now(),
  });
}

export async function guardarRegistrosCampo(
  regional: string,
  tipo: "inspecao" | "ocorrencia",
  registros: Array<Record<string, unknown>>,
) {
  const db = banco();
  if (!db) return;
  await db.campo.bulkPut(
    registros
      .filter((r) => typeof r["id"] === "string")
      .map((r) => ({
        id: String(r["id"]),
        regional_codigo: regional,
        tipo,
        dados: r,
        pendente: 0,
        criadoEm: Date.now(),
      })),
  );
}

export async function lerRegistrosCampo(regional: string, tipo?: "inspecao" | "ocorrencia") {
  const db = banco();
  if (!db) return [];
  const linhas = await db.campo.where("regional_codigo").equals(regional).toArray();
  return linhas
    .filter((l) => !tipo || l.tipo === tipo)
    .sort((a, b) => b.criadoEm - a.criadoEm);
}

// ------------------------------------------------------------ troca de regional

export type ResumoLocal = {
  programacoes: number;
  malha: number;
  rotas: number;
  fiscalizacao: number;
  pendencias: number;
  atualizadoEm: number | null;
};

export async function resumoLocal(regional: string): Promise<ResumoLocal> {
  const db = banco();
  if (!db)
    return { programacoes: 0, malha: 0, rotas: 0, fiscalizacao: 0, pendencias: 0, atualizadoEm: null };
  const [programacoes, malha, rotas, fiscalizacao, pendencias] = await Promise.all([
    db.programacoes.where("regional_codigo").equals(regional).count(),
    db.malha.where("regional_codigo").equals(regional).count(),
    db.rotas.where("regional_codigo").equals(regional).count(),
    db.fiscalizacao.where("regional_codigo").equals(regional).count(),
    db.pendencias.where("regional_codigo").equals(regional).count(),
  ]);
  const ultima = await db.programacoes
    .where("regional_codigo")
    .equals(regional)
    .reverse()
    .sortBy("atualizadoEm");
  return {
    programacoes,
    malha,
    rotas,
    fiscalizacao,
    pendencias,
    atualizadoEm: ultima[0]?.atualizadoEm ?? null,
  };
}

/** Apaga tudo o que pertence a uma regional (usado na troca de regional). */
export async function limparRegional(regional: string) {
  const db = banco();
  if (!db) return;
  await db.transaction(
    "rw",
    [
      db.programacoes,
      db.malha,
      db.rotas,
      db.fiscalizacao,
      db.pendencias,
      db.importacoes,
      db.arquivos,
      db.campo,
    ],
    async () => {
      await db.campo.where("regional_codigo").equals(regional).delete();
      await db.importacoes.where("regional_codigo").equals(regional).delete();
      await db.arquivos.where("regional_codigo").equals(regional).delete();
      await db.programacoes.where("regional_codigo").equals(regional).delete();
      await db.malha.where("regional_codigo").equals(regional).delete();
      await db.rotas.where("regional_codigo").equals(regional).delete();
      await db.fiscalizacao.where("regional_codigo").equals(regional).delete();
      await db.pendencias.where("regional_codigo").equals(regional).delete();
    },
  );
}

/** Apaga qualquer dado que não seja da regional informada. */
export async function limparOutrasRegionais(regionalAtual: string) {
  const db = banco();
  if (!db) return;
  const tabelas = [
    db.programacoes,
    db.malha,
    db.rotas,
    db.fiscalizacao,
    db.importacoes,
    db.arquivos,
    db.campo,
  ] as const;
  for (const tabela of tabelas) {
    const chaves = await tabela.toArray();
    const alvo = chaves.filter(
      (l) => (l as { regional_codigo: string }).regional_codigo !== regionalAtual,
    );
    if (alvo.length) {
      await Promise.all(
        alvo.map((l) => tabela.delete((l as unknown as { id?: string; chave?: string }).id ?? (l as unknown as { chave: string }).chave)),
      );
    }
  }
}
