/**
 * Identificação local do funcionário (sem login, sem senha).
 * Guardada no dispositivo; os dados sensíveis continuam no servidor.
 */
import { useCallback, useEffect, useState } from "react";

export type PerfilLocal = {
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

const CHAVE = "programacao.perfil.v1";

export function lerPerfilLocal(): PerfilLocal | null {
  if (typeof window === "undefined") return null;
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    return bruto ? (JSON.parse(bruto) as PerfilLocal) : null;
  } catch {
    return null;
  }
}

export function gravarPerfilLocal(perfil: PerfilLocal | null) {
  if (typeof window === "undefined") return;
  if (perfil) window.localStorage.setItem(CHAVE, JSON.stringify(perfil));
  else window.localStorage.removeItem(CHAVE);
  window.dispatchEvent(new Event("perfil-local-alterado"));
}

export function usePerfilLocal() {
  const [perfil, setPerfil] = useState<PerfilLocal | null>(null);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    const sincronizar = () => setPerfil(lerPerfilLocal());
    sincronizar();
    setCarregado(true);
    window.addEventListener("perfil-local-alterado", sincronizar);
    window.addEventListener("storage", sincronizar);
    return () => {
      window.removeEventListener("perfil-local-alterado", sincronizar);
      window.removeEventListener("storage", sincronizar);
    };
  }, []);

  const salvar = useCallback((novo: PerfilLocal | null) => {
    gravarPerfilLocal(novo);
    setPerfil(novo);
  }, []);

  return { perfil, carregado, salvar };
}
