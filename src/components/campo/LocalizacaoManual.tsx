/**
 * Correção manual da localização de um serviço, feita pelo fiscal em campo.
 * Funciona sem internet: a correção entra na fila e sobe depois.
 */
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Crosshair, MapPin, Send } from "lucide-react";

import { Botao, Campo, Cartao, estiloEntrada } from "@/components/AppShell";
import { enfileirar, novaChaveIdempotencia } from "@/lib/offline/sync";
import {
  salvarLocalizacaoManual,
  solicitarConfirmacaoLocalizacao,
  type ServicoAgenda,
} from "@/lib/programacao.functions";
import type { PerfilLocal } from "@/lib/perfil-local";

export function LocalizacaoManual({
  perfil,
  servico,
  aoSalvar,
}: {
  perfil: PerfilLocal;
  servico: ServicoAgenda;
  aoSalvar?: () => void;
}) {
  const [rodovia, setRodovia] = useState(servico.rodovia ?? "");
  const [kmInicial, setKmInicial] = useState(servico.km_inicial?.toString() ?? "");
  const [kmFinal, setKmFinal] = useState(servico.km_final?.toString() ?? "");
  const [sentido, setSentido] = useState(servico.sentido ?? "");
  const [municipio, setMunicipio] = useState(servico.municipio ?? "");
  const [referencia, setReferencia] = useState(servico.referencia_local ?? "");
  const [coordenada, setCoordenada] = useState<{ lat: number; lon: number } | null>(
    servico.latitude_inicial != null && servico.longitude_inicial != null
      ? { lat: servico.latitude_inicial, lon: servico.longitude_inicial }
      : null,
  );
  const [buscandoGps, setBuscandoGps] = useState(false);

  const numero = (v: string) => {
    const n = Number(v.replace(",", "."));
    return v.trim() === "" || Number.isNaN(n) ? null : n;
  };

  const pegarGps = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Este aparelho não informa a localização.");
      return;
    }
    setBuscandoGps(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoordenada({ lat: p.coords.latitude, lon: p.coords.longitude });
        setBuscandoGps(false);
        toast.success("Ponto do GPS capturado.");
      },
      () => {
        setBuscandoGps(false);
        toast.error("Não foi possível ler o GPS. Informe rodovia e km.");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const dados = () => ({
    funcionarioId: perfil.id,
    programacaoId: servico.id,
    rodovia: rodovia.trim() || null,
    km_inicial: numero(kmInicial),
    km_final: numero(kmFinal) ?? numero(kmInicial),
    sentido: sentido.trim() || null,
    municipio: municipio.trim() || null,
    referencia_local: referencia.trim() || null,
    latitude: coordenada?.lat ?? null,
    longitude: coordenada?.lon ?? null,
  });

  const salvar = useMutation({
    mutationFn: async () => {
      const corpo = { ...dados(), chaveIdempotencia: novaChaveIdempotencia("localizacao_manual") };
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await enfileirar({
          regional_codigo: perfil.regional_codigo,
          tipo: "localizacao_manual",
          payload: corpo,
          chave: corpo.chaveIdempotencia,
          descricao: `Localização de ${servico.rodovia ?? "serviço"} km ${servico.km_inicial ?? "—"}`,
        });
        return { offline: true };
      }
      await salvarLocalizacaoManual({ data: corpo });
      return { offline: false };
    },
    onSuccess: (r) => {
      toast.success(
        r.offline
          ? "Sem internet: correção guardada e será enviada automaticamente."
          : "Localização corrigida. Este serviço entra na rota.",
      );
      aoSalvar?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pedirConfirmacao = useMutation({
    mutationFn: () =>
      solicitarConfirmacaoLocalizacao({
        data: {
          funcionarioId: perfil.id,
          programacaoId: servico.id,
          observacao: referencia.trim() || null,
        },
      }),
    onSuccess: () => toast.success("Pedido de confirmação enviado ao escritório."),
    onError: (e: Error) => toast.error(e.message),
  });

  const podeSalvar =
    !!coordenada || (rodovia.trim().length > 1 && numero(kmInicial) !== null);

  return (
    <Cartao className="space-y-3 border-warning/50">
      <div className="flex items-center gap-2">
        <MapPin className="size-4 text-warning-foreground" />
        <p className="text-sm font-semibold">Confirmar localização do serviço</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Rodovia">
          <input
            className={estiloEntrada}
            value={rodovia}
            onChange={(e) => setRodovia(e.target.value.toUpperCase())}
            placeholder="SP-127"
          />
        </Campo>
        <Campo rotulo="Sentido">
          <input
            className={estiloEntrada}
            value={sentido}
            onChange={(e) => setSentido(e.target.value)}
            placeholder="Norte / Sul / Pista única"
          />
        </Campo>
        <Campo rotulo="Km inicial">
          <input
            className={estiloEntrada}
            inputMode="decimal"
            value={kmInicial}
            onChange={(e) => setKmInicial(e.target.value)}
          />
        </Campo>
        <Campo rotulo="Km final">
          <input
            className={estiloEntrada}
            inputMode="decimal"
            value={kmFinal}
            onChange={(e) => setKmFinal(e.target.value)}
          />
        </Campo>
        <Campo rotulo="Município">
          <input
            className={estiloEntrada}
            value={municipio}
            onChange={(e) => setMunicipio(e.target.value)}
          />
        </Campo>
        <Campo rotulo="Ponto de referência">
          <input
            className={estiloEntrada}
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder="Entrada do sítio, após o trevo..."
          />
        </Campo>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Botao variante="contorno" onClick={pegarGps} disabled={buscandoGps}>
          <Crosshair className="size-4" />
          {buscandoGps ? "Lendo GPS..." : "Usar minha posição"}
        </Botao>
        {coordenada ? (
          <span className="text-xs text-muted-foreground">
            {coordenada.lat.toFixed(5)}, {coordenada.lon.toFixed(5)}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Botao disabled={!podeSalvar || salvar.isPending} onClick={() => salvar.mutate()}>
          {salvar.isPending ? "Salvando..." : "Salvar localização"}
        </Botao>
        <Botao
          variante="contorno"
          disabled={pedirConfirmacao.isPending}
          onClick={() => pedirConfirmacao.mutate()}
        >
          <Send className="size-4" /> Pedir confirmação ao escritório
        </Botao>
      </div>

      <p className="text-xs text-muted-foreground">
        A localização confirmada por você tem prioridade e não é substituída pelo cálculo
        automático.
      </p>
    </Cartao>
  );
}
