/**
 * Fila de sincronização: tudo o que é feito sem internet fica gravado no
 * aparelho e sobe automaticamente quando a conexão volta.
 */
import { useCallback, useEffect, useState } from "react";

import { banco, type PendenciaLocal } from "./db";
import {
  atualizarStatus,
  corrigirRegistro,
  excluirRegistro,
  salvarCoordenadas,
  salvarLocalizacaoManual,
  salvarRota,
} from "@/lib/programacao.functions";
import { criarInspecao, criarOcorrencia } from "@/lib/campo.functions";

const EVENTO = "fila-sincronizacao-alterada";

function avisar() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO));
}

/** Gera uma chave estável para a operação (idempotência ponta a ponta). */
export function novaChaveIdempotencia(prefixo: string) {
  const aleatorio =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefixo}:${aleatorio}`;
}

export async function enfileirar(
  pendencia: Omit<PendenciaLocal, "id" | "criadoEm" | "tentativas" | "ultimoErro">,
) {
  const db = banco();
  if (!db) return;
  const chave = pendencia.chave ?? novaChaveIdempotencia(pendencia.tipo);
  // Mesma chave já na fila: não enfileira de novo.
  const existente = await db.pendencias.where("chave").equals(chave).first();
  if (existente) return;
  await db.pendencias.add({
    ...pendencia,
    chave,
    payload: { ...pendencia.payload, chaveIdempotencia: chave },
    criadoEm: Date.now(),
    tentativas: 0,
    ultimoErro: null,
  });
  avisar();
}

export async function contarPendencias(regional: string) {
  const db = banco();
  if (!db) return 0;
  return db.pendencias.where("regional_codigo").equals(regional).count();
}

async function executar(pendencia: PendenciaLocal) {
  const payload = pendencia.payload as never;
  switch (pendencia.tipo) {
    case "status":
      await atualizarStatus({ data: payload });
      return;
    case "correcao":
      await corrigirRegistro({ data: payload });
      return;
    case "localizacao_manual":
      await salvarLocalizacaoManual({ data: payload });
      return;
    case "exclusao":
      await excluirRegistro({ data: payload });
      return;
    case "coordenadas":
      await salvarCoordenadas({ data: payload });
      return;
    case "rota":
      await salvarRota({ data: payload });
      return;
    case "inspecao":
      await criarInspecao({ data: payload });
      return;
    case "ocorrencia":
      await criarOcorrencia({ data: payload });
      return;
  }
}


let processando = false;

/** Envia a fila em ordem. Para no primeiro erro de rede para não perder ordem. */
export async function processarFila(regional: string) {
  const db = banco();
  if (!db || processando) return { enviados: 0, restantes: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { enviados: 0, restantes: await contarPendencias(regional) };
  }
  processando = true;
  let enviados = 0;
  try {
    const fila = await db.pendencias
      .where("regional_codigo")
      .equals(regional)
      .sortBy("criadoEm");
    for (const pendencia of fila) {
      try {
        await executar(pendencia);
        if (pendencia.id != null) await db.pendencias.delete(pendencia.id);
        enviados += 1;
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        const semRede = typeof navigator !== "undefined" && !navigator.onLine;
        if (pendencia.id != null) {
          await db.pendencias.update(pendencia.id, {
            tentativas: pendencia.tentativas + 1,
            ultimoErro: mensagem,
          });
          // Erro de regra de negócio (não de rede) após 3 tentativas: descarta
          // para a fila não travar, mas o registro fica visível nas pendências.
          if (!semRede && pendencia.tentativas + 1 >= 3) {
            await db.pendencias.delete(pendencia.id);
          }
        }
        if (semRede) break;
      }
    }
  } finally {
    processando = false;
    avisar();
  }
  return { enviados, restantes: await contarPendencias(regional) };
}

/** Indicador online/offline + pendências, com sincronização automática. */
export function useSincronizacao(regional: string | null) {
  const [online, setOnline] = useState(true);
  const [pendentes, setPendentes] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);

  const atualizar = useCallback(async () => {
    if (!regional) return;
    setPendentes(await contarPendencias(regional));
  }, [regional]);

  const sincronizar = useCallback(async () => {
    if (!regional) return;
    setSincronizando(true);
    try {
      await processarFila(regional);
    } finally {
      setSincronizando(false);
      await atualizar();
    }
  }, [regional, atualizar]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOnline(navigator.onLine);
    void atualizar();

    const aoConectar = () => {
      setOnline(true);
      void sincronizar();
    };
    const aoDesconectar = () => setOnline(false);

    window.addEventListener("online", aoConectar);
    window.addEventListener("offline", aoDesconectar);
    window.addEventListener(EVENTO, atualizar);
    const timer = window.setInterval(() => {
      if (navigator.onLine) void sincronizar();
    }, 60_000);

    if (navigator.onLine) void sincronizar();

    return () => {
      window.removeEventListener("online", aoConectar);
      window.removeEventListener("offline", aoDesconectar);
      window.removeEventListener(EVENTO, atualizar);
      window.clearInterval(timer);
    };
  }, [atualizar, sincronizar]);

  return { online, pendentes, sincronizando, sincronizar };
}
