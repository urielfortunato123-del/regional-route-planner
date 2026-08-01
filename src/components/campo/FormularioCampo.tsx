/**
 * Formulário de campo: inspeção ou ocorrência sobre um trecho do DER-SP.
 * Funciona offline — sem internet o registro entra na fila de sincronização.
 */
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Botao, Campo, Etiqueta, estiloEntrada } from "@/components/AppShell";
import { criarInspecao, criarOcorrencia } from "@/lib/campo.functions";
import { guardarRegistroCampoLocal } from "@/lib/offline/db";
import { enfileirar } from "@/lib/offline/sync";

export type ContextoCampo = {
  programacaoId: string | null;
  rodovia: string | null;
  kmInicial: number | null;
  kmFinal: number | null;
  atividade: string | null;
  equipe: string | null;
  contrato: string | null;
  lat: number | null;
  lon: number | null;
  rotulo: string;
};

type Props = {
  tipo: "inspecao" | "ocorrencia";
  contexto: ContextoCampo;
  funcionarioId: string;
  regionalCodigo: string;
  aoFechar: () => void;
  aoSalvar?: () => void;
};

const TIPOS_OCORRENCIA = [
  "Buraco no pavimento",
  "Sinalização danificada",
  "Vegetação alta",
  "Erosão / talude",
  "Drenagem obstruída",
  "Acidente / obstrução",
  "Animal na pista",
  "Outros",
];

/** Reduz a foto para caber no registro (offline e no envio). */
async function comprimirFoto(arquivo: File): Promise<string> {
  const bitmap = await createImageBitmap(arquivo);
  const maior = Math.max(bitmap.width, bitmap.height);
  const escala = maior > 1280 ? 1280 / maior : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível preparar a foto.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.6);
}

export function FormularioCampo({
  tipo,
  contexto,
  funcionarioId,
  regionalCodigo,
  aoFechar,
  aoSalvar,
}: Props) {
  const [fotos, setFotos] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [posicao, setPosicao] = useState<{ lat: number; lon: number } | null>(
    contexto.lat != null && contexto.lon != null ? { lat: contexto.lat, lon: contexto.lon } : null,
  );

  // inspeção
  const [condicao, setCondicao] = useState("adequada");
  const [servicoExecutado, setServicoExecutado] = useState("");
  const [naoConformidade, setNaoConformidade] = useState("");
  const [situacao, setSituacao] = useState("registrada");

  // ocorrência
  const [tipoOcorrencia, setTipoOcorrencia] = useState(TIPOS_OCORRENCIA[0]!);
  const [descricao, setDescricao] = useState("");
  const [prioridade, setPrioridade] = useState<"baixa" | "media" | "alta" | "emergencial">("media");
  const [risco, setRisco] = useState("");
  const [sentido, setSentido] = useState("");
  const [faixa, setFaixa] = useState("");
  const [necessitaAtendimento, setNecessitaAtendimento] = useState(false);

  const [observacao, setObservacao] = useState("");
  const entradaFoto = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (posicao || typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setPosicao({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => undefined,
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }, [posicao]);

  async function adicionarFotos(lista: FileList | null) {
    if (!lista?.length) return;
    const novas: string[] = [];
    for (const arquivo of Array.from(lista).slice(0, 6 - fotos.length)) {
      try {
        novas.push(await comprimirFoto(arquivo));
      } catch {
        toast.error("Não foi possível usar uma das fotos.");
      }
    }
    setFotos((a) => [...a, ...novas].slice(0, 6));
  }

  async function salvar() {
    if (!posicao) {
      toast.error("Sem posição: ative o GPS ou toque no ponto do mapa antes de salvar.");
      return;
    }
    if (tipo === "ocorrencia" && descricao.trim().length < 3) {
      toast.error("Descreva a ocorrência.");
      return;
    }
    setSalvando(true);
    const comum = {
      funcionarioId,
      programacaoId: contexto.programacaoId,
      equipe: contexto.equipe,
      contrato: contexto.contrato,
      rodovia: contexto.rodovia,
      fotos,
      latitude: posicao.lat,
      longitude: posicao.lon,
      observacao: observacao || null,
    };

    const payload =
      tipo === "inspecao"
        ? {
            ...comum,
            atividade: contexto.atividade,
            kmInicial: contexto.kmInicial,
            kmFinal: contexto.kmFinal,
            condicao,
            servicoExecutado: servicoExecutado || null,
            naoConformidade: naoConformidade || null,
            situacao,
          }
        : {
            ...comum,
            tipo: tipoOcorrencia,
            km: contexto.kmInicial,
            kmFinal: contexto.kmFinal,
            descricao: descricao.trim(),
            prioridade,
            risco: risco || null,
            sentido: sentido || null,
            faixa: faixa || null,
            necessitaAtendimento,
          };

    try {
      const semRede = typeof navigator !== "undefined" && !navigator.onLine;
      if (semRede) {
        await enfileirar({
          regional_codigo: regionalCodigo,
          tipo,
          payload,
          descricao: `${tipo === "inspecao" ? "Inspeção" : "Ocorrência"} — ${contexto.rotulo}`,
        });
        await guardarRegistroCampoLocal(regionalCodigo, tipo, {
          ...payload,
          id: `local-${Date.now()}`,
          pendente: true,
          registrada_em: new Date().toISOString(),
        });
        toast.success("Registro salvo no aparelho — envio automático quando houver conexão.");
      } else if (tipo === "inspecao") {
        const r = await criarInspecao({ data: payload as never });
        await guardarRegistroCampoLocal(regionalCodigo, "inspecao", r.inspecao as never);
        toast.success("Inspeção registrada.");
      } else {
        const r = await criarOcorrencia({ data: payload as never });
        await guardarRegistroCampoLocal(regionalCodigo, "ocorrencia", r.ocorrencia as never);
        toast.success("Ocorrência registrada.");
      }
      aoSalvar?.();
      aoFechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o registro.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/50 sm:items-center">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-background p-4 sm:max-w-lg sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold">
              {tipo === "inspecao" ? "Nova inspeção" : "Nova ocorrência"}
            </h2>
            <p className="text-xs text-muted-foreground">{contexto.rotulo}</p>
          </div>
          <button aria-label="Fechar" onClick={aoFechar} className="rounded-md border border-border p-1">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <Etiqueta tom={contexto.programacaoId ? "ok" : "alerta"}>
              {contexto.programacaoId ? "ligada ao serviço da programação" : "registro avulso"}
            </Etiqueta>
            <Etiqueta tom={posicao ? "ok" : "erro"}>
              {posicao
                ? `${posicao.lat.toFixed(5)}, ${posicao.lon.toFixed(5)}`
                : "sem posição — ative o GPS"}
            </Etiqueta>
          </div>

          {tipo === "inspecao" ? (
            <>
              <Campo rotulo="Condição do trecho">
                <select
                  className={estiloEntrada}
                  value={condicao}
                  onChange={(e) => setCondicao(e.target.value)}
                >
                  <option value="adequada">Adequada</option>
                  <option value="parcial">Parcialmente adequada</option>
                  <option value="inadequada">Inadequada</option>
                </select>
              </Campo>
              <Campo rotulo="Serviço executado">
                <textarea
                  className={estiloEntrada}
                  rows={2}
                  value={servicoExecutado}
                  onChange={(e) => setServicoExecutado(e.target.value)}
                  placeholder="O que foi verificado/executado no trecho"
                />
              </Campo>
              <Campo rotulo="Não conformidade (se houver)">
                <textarea
                  className={estiloEntrada}
                  rows={2}
                  value={naoConformidade}
                  onChange={(e) => setNaoConformidade(e.target.value)}
                />
              </Campo>
              <Campo rotulo="Situação">
                <select
                  className={estiloEntrada}
                  value={situacao}
                  onChange={(e) => setSituacao(e.target.value)}
                >
                  <option value="registrada">Registrada</option>
                  <option value="em_andamento">Em andamento</option>
                  <option value="concluida">Concluída</option>
                </select>
              </Campo>
            </>
          ) : (
            <>
              <Campo rotulo="Tipo de ocorrência">
                <select
                  className={estiloEntrada}
                  value={tipoOcorrencia}
                  onChange={(e) => setTipoOcorrencia(e.target.value)}
                >
                  {TIPOS_OCORRENCIA.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Descrição">
                <textarea
                  className={estiloEntrada}
                  rows={3}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="O que foi encontrado no local"
                />
              </Campo>
              <div className="grid grid-cols-2 gap-2">
                <Campo rotulo="Prioridade">
                  <select
                    className={estiloEntrada}
                    value={prioridade}
                    onChange={(e) => setPrioridade(e.target.value as typeof prioridade)}
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                    <option value="emergencial">Emergencial</option>
                  </select>
                </Campo>
                <Campo rotulo="Risco">
                  <input
                    className={estiloEntrada}
                    value={risco}
                    onChange={(e) => setRisco(e.target.value)}
                    placeholder="Risco ao usuário, à via…"
                  />
                </Campo>
                <Campo rotulo="Sentido">
                  <select
                    className={estiloEntrada}
                    value={sentido}
                    onChange={(e) => setSentido(e.target.value)}
                  >
                    <option value="">Não informado</option>
                    <option value="crescente">Crescente</option>
                    <option value="decrescente">Decrescente</option>
                    <option value="ambos">Ambos</option>
                  </select>
                </Campo>
                <Campo rotulo="Faixa/local">
                  <input
                    className={estiloEntrada}
                    value={faixa}
                    onChange={(e) => setFaixa(e.target.value)}
                    placeholder="Faixa 1, acostamento…"
                  />
                </Campo>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-primary)]"
                  checked={necessitaAtendimento}
                  onChange={(e) => setNecessitaAtendimento(e.target.checked)}
                />
                Necessita atendimento imediato
              </label>
            </>
          )}

          <Campo rotulo="Observação">
            <textarea
              className={estiloEntrada}
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </Campo>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Fotos ({fotos.length}/6)</p>
              <Botao variante="contorno" onClick={() => entradaFoto.current?.click()}>
                <Camera className="size-4" /> Adicionar
              </Botao>
            </div>
            <input
              ref={entradaFoto}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              hidden
              onChange={(e) => {
                void adicionarFotos(e.target.files);
                e.target.value = "";
              }}
            />
            {fotos.length ? (
              <div className="flex flex-wrap gap-2">
                {fotos.map((f, i) => (
                  <div key={i} className="relative">
                    <img src={f} alt={`Foto ${i + 1} do registro`} className="size-20 rounded-md object-cover" />
                    <button
                      aria-label={`Remover foto ${i + 1}`}
                      className="absolute -right-1 -top-1 rounded-full bg-destructive p-1 text-destructive-foreground"
                      onClick={() => setFotos((a) => a.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <Botao className="w-full" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? <Loader2 className="size-4 animate-spin" /> : null}
            {salvando ? "Salvando…" : "Salvar registro"}
          </Botao>
        </div>
      </div>
    </div>
  );
}
