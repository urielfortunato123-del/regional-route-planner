/**
 * Estado do servidor — preparado para o "cold start" do plano gratuito.
 *
 * O serviço hospedado pode hibernar depois de 15 minutos sem acesso. A primeira
 * abertura, então, demora até cerca de 60 segundos. Aqui a gente:
 *   - consulta /api/health com tempo limite de 90 s;
 *   - tenta de novo automaticamente em 3, 5, 10 e 15 segundos;
 *   - mostra "o servidor está iniciando" em vez de erro;
 *   - avisa o aplicativo quando o servidor responde (para sincronizar).
 *
 * Não existe ping artificial: nada aqui roda sozinho para impedir o serviço
 * de hibernar. As tentativas só acontecem enquanto alguém está usando o app.
 */
import { useEffect, useState } from "react";

export type EstadoServidor = "verificando" | "iniciando" | "online" | "offline";

const TEMPO_LIMITE_MS = 90_000;
export const INTERVALOS_MS = [3_000, 5_000, 10_000, 15_000];
const EVENTO = "estado-servidor-alterado";
export const EVENTO_SERVIDOR_ONLINE = "servidor-respondeu";

type Instantaneo = {
  estado: EstadoServidor;
  tentativas: number;
  desde: number;
};

let atual: Instantaneo = { estado: "verificando", tentativas: 0, desde: Date.now() };
let emAndamento = false;
let agendado: number | null = null;

function publicar(proximo: Partial<Instantaneo>) {
  atual = { ...atual, ...proximo };
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO));
}

function semRede() {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

async function consultarSaude(): Promise<boolean> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    const resposta = await fetch("/api/health", {
      cache: "no-store",
      signal: controle.signal,
    });
    // 503 = banco fora do ar, mas o servidor já está de pé: não é "iniciando".
    return resposta.status < 500 || resposta.status === 503;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function cancelarAgendamento() {
  if (agendado != null && typeof window !== "undefined") {
    window.clearTimeout(agendado);
    agendado = null;
  }
}

/** Verifica o servidor; reagenda sozinho enquanto não responder. */
export async function verificarServidor(reiniciarContagem = false): Promise<EstadoServidor> {
  if (typeof window === "undefined") return "verificando";
  cancelarAgendamento();
  if (reiniciarContagem) publicar({ tentativas: 0, desde: Date.now() });
  if (emAndamento) return atual.estado;

  if (semRede()) {
    publicar({ estado: "offline" });
    return "offline";
  }

  emAndamento = true;
  if (atual.estado !== "online") {
    publicar({ estado: atual.tentativas === 0 ? "verificando" : "iniciando" });
  }

  const ok = await consultarSaude();
  emAndamento = false;

  if (ok) {
    publicar({ estado: "online", tentativas: 0 });
    window.dispatchEvent(new Event(EVENTO_SERVIDOR_ONLINE));
    return "online";
  }

  const tentativas = atual.tentativas + 1;
  const estado: EstadoServidor = semRede()
    ? "offline"
    : tentativas <= INTERVALOS_MS.length
      ? "iniciando"
      : "offline";
  publicar({ estado, tentativas });

  const espera = INTERVALOS_MS[tentativas - 1];
  if (espera != null) {
    agendado = window.setTimeout(() => void verificarServidor(), espera);
  }
  return estado;
}

export function estadoServidorAtual() {
  return atual;
}

/** Estado do servidor pronto para a interface, com botão "Tentar novamente". */
export function useEstadoServidor() {
  const [instantaneo, setInstantaneo] = useState<Instantaneo>(atual);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const atualizar = () => setInstantaneo({ ...atual });
    window.addEventListener(EVENTO, atualizar);

    const aoConectar = () => void verificarServidor(true);
    const aoDesconectar = () => publicar({ estado: "offline" });
    window.addEventListener("online", aoConectar);
    window.addEventListener("offline", aoDesconectar);

    if (atual.estado !== "online") void verificarServidor();
    atualizar();

    return () => {
      window.removeEventListener(EVENTO, atualizar);
      window.removeEventListener("online", aoConectar);
      window.removeEventListener("offline", aoDesconectar);
    };
  }, []);

  return {
    estado: instantaneo.estado,
    tentativas: instantaneo.tentativas,
    iniciando: instantaneo.estado === "iniciando" || instantaneo.estado === "verificando",
    tentarNovamente: () => void verificarServidor(true),
  };
}

/** Mensagem única para a primeira abertura demorada. */
export const MENSAGEM_INICIANDO =
  "O servidor está iniciando. Isso pode levar até 60 segundos na primeira abertura.";
