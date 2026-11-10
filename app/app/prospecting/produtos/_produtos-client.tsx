"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { randomId } from "@/lib/random-id";
import {
  corpoDoProduto,
  FORMULARIO_VAZIO,
  formularioDoProduto,
  mensagemDeErroDoProduto,
  type FormularioDoProduto,
} from "@/lib/prospecting/produto/formulario";
import { ROTULO_DO_ACHADO } from "@/lib/prospecting/produto/rotulos";
import {
  CODIGOS_DE_ACHADO,
  LIMITES_DO_PRODUTO,
  type ProdutoDaProspeccao,
} from "@/lib/prospecting/produto/schema";

const ENDPOINT = "/api/v1/prospecting/products";

/** `null` = fechado; `"novo"` = criando; objeto = editando. */
type Alvo = null | "novo" | ProdutoDaProspeccao;

export function ProdutosClient({ podeEscrever }: { podeEscrever: boolean }) {
  const t = useT();
  const [produtos, setProdutos] = useState<ProdutoDaProspeccao[] | null>(null);
  const [erroDaLista, setErroDaLista] = useState<string | null>(null);
  const [comArquivados, setComArquivados] = useState(false);
  const [alvo, setAlvo] = useState<Alvo>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErroDaLista(null);
    try {
      const r = await apiClient.get<{ data: ProdutoDaProspeccao[] }>(
        `${ENDPOINT}${comArquivados ? "?arquivados=1" : ""}`,
      );
      setProdutos(r.data);
    } catch {
      setProdutos(null);
      setErroDaLista(t("Não foi possível carregar os produtos."));
    }
  }, [comArquivados, t]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function arquivar(p: ProdutoDaProspeccao) {
    setAviso(null);
    try {
      await apiClient.delete(`${ENDPOINT}/${p.id}`);
      setAviso(t("Produto arquivado. Campanhas já ativadas continuam como estavam."));
      await carregar();
    } catch (e) {
      setAviso(mensagemDeErroDoProduto(e instanceof ApiError ? e.status : 0, undefined, t));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href="/app/prospecting" className="text-sm text-text-muted hover:text-accent">
            {t("← Voltar para Prospecção")}
          </Link>
          <h1 className="text-xl font-semibold text-text">{t("Produtos da prospecção")}</h1>
          <p className="max-w-xl text-sm text-text-muted">
            {t(
              "Cadastre o que você vende e, para cada problema que a auditoria encontra no site da empresa, a frase que mostra como você resolve.",
            )}
          </p>
        </div>
        {podeEscrever && <Button onClick={() => setAlvo("novo")}>{t("Novo produto")}</Button>}
      </header>

      <label className="flex items-center gap-2 text-sm text-text-muted">
        <input
          type="checkbox"
          checked={comArquivados}
          onChange={(e) => setComArquivados(e.target.checked)}
        />
        {t("Mostrar arquivados")}
      </label>

      {aviso && (
        <p role="status" className="rounded-sm border border-border bg-surface-elevated p-3 text-sm">
          {aviso}
        </p>
      )}

      {erroDaLista ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 rounded-sm bg-error-bg p-4 text-sm text-error-fg"
        >
          {erroDaLista}
          <Button variant="outline" onClick={() => void carregar()}>
            {t("Tentar de novo")}
          </Button>
        </div>
      ) : produtos === null ? (
        <Skeleton className="h-24 w-full" />
      ) : produtos.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border p-8 text-center text-sm text-text-muted">
          {podeEscrever
            ? t("Nenhum produto ainda. Cadastre o primeiro para a prospecção saber o que oferecer.")
            : t("Nenhum produto cadastrado ainda. Peça a um gerente ou administrador para cadastrar.")}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {produtos.map((p) => {
            const n = Object.keys(p.solucoes).length;
            return (
              <li
                key={p.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-sm border border-border bg-surface p-4"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-medium text-text">{p.nome}</h2>
                    <Badge variant="neutral">{p.categoria}</Badge>
                    {p.archived_at && <Badge variant="warning">{t("Arquivado")}</Badge>}
                  </div>
                  <p className="text-sm text-text-muted">{p.resumo}</p>
                  <p className="text-xs text-text-muted">
                    {n === 1
                      ? t("1 problema com solução")
                      : t("{n} problemas com solução").replace("{n}", String(n))}
                  </p>
                </div>
                {podeEscrever && !p.archived_at && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setAlvo(p)}>
                      {t("Editar")}
                    </Button>
                    <Button variant="ghost" onClick={() => void arquivar(p)}>
                      {t("Arquivar")}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {alvo !== null && (
        <FormularioDoProdutoDialog
          alvo={alvo}
          onFechar={() => setAlvo(null)}
          onSalvo={async () => {
            setAlvo(null);
            setAviso(t("Produto salvo."));
            await carregar();
          }}
        />
      )}
    </div>
  );
}

function FormularioDoProdutoDialog({
  alvo,
  onFechar,
  onSalvo,
}: {
  alvo: "novo" | ProdutoDaProspeccao;
  onFechar: () => void;
  onSalvo: () => Promise<void>;
}) {
  const t = useT();
  const editando = alvo === "novo" ? null : alvo;
  const [f, setF] = useState<FormularioDoProduto>(
    editando ? formularioDoProduto(editando) : FORMULARIO_VAZIO,
  );
  const [chave] = useState(() => randomId());
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const set = (campo: keyof FormularioDoProduto) => (e: { target: { value: string } }) =>
    setF((a) => ({ ...a, [campo]: e.target.value }));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const corpo = corpoDoProduto(f);
      if (editando) await apiClient.patch(`${ENDPOINT}/${editando.id}`, corpo);
      else await apiClient.post(ENDPOINT, corpo, { idempotencyKey: chave });
      await onSalvo();
    } catch (err) {
      setErro(
        err instanceof ApiError
          ? mensagemDeErroDoProduto(err.status, err.details, t)
          : mensagemDeErroDoProduto(0, undefined, t),
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editando ? t("Editar produto") : t("Novo produto")}</DialogTitle>
          <DialogDescription>
            {t("É isto que a mensagem de prospecção vai dizer sobre o que você vende.")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="flex flex-col gap-4">
          <Campo id="produto-nome" rotulo={t("Nome do produto")}>
            <Input
              id="produto-nome"
              required
              maxLength={LIMITES_DO_PRODUTO.nome}
              value={f.nome}
              onChange={set("nome")}
            />
          </Campo>
          <Campo id="produto-categoria" rotulo={t("Categoria")} ajuda={t("Ex.: Criação de sites")}>
            <Input
              id="produto-categoria"
              required
              maxLength={LIMITES_DO_PRODUTO.categoria}
              value={f.categoria}
              onChange={set("categoria")}
            />
          </Campo>
          <Campo id="produto-resumo" rotulo={t("Resumo")} ajuda={t("O que é, em uma ou duas frases.")}>
            <Textarea
              id="produto-resumo"
              required
              rows={3}
              maxLength={LIMITES_DO_PRODUTO.resumo}
              value={f.resumo}
              onChange={set("resumo")}
            />
          </Campo>
          <Campo
            id="produto-assina"
            rotulo={t("Quem assina a campanha")}
            ajuda={t("Nome ou equipe que aparece na mensagem. Opcional.")}
          >
            <Input
              id="produto-assina"
              maxLength={LIMITES_DO_PRODUTO.assina}
              value={f.assina}
              onChange={set("assina")}
            />
          </Campo>
          <Campo
            id="produto-link"
            rotulo={t("Link da demonstração")}
            ajuda={t("Precisa começar com https://. Opcional.")}
          >
            <Input
              id="produto-link"
              inputMode="url"
              maxLength={LIMITES_DO_PRODUTO.linkDemo}
              value={f.linkDemo}
              onChange={set("linkDemo")}
            />
          </Campo>
          <Campo
            id="produto-prova"
            rotulo={t("O que você oferece")}
            ajuda={t("Só o que é verdade, como teste grátis ou preço. Opcional.")}
          >
            <Input
              id="produto-prova"
              maxLength={LIMITES_DO_PRODUTO.prova}
              value={f.prova}
              onChange={set("prova")}
            />
          </Campo>
          <Campo
            id="produto-proibicoes"
            rotulo={t("Termos proibidos")}
            ajuda={t("Palavras que a mensagem nunca pode usar. Uma por linha, até {max}.").replace(
              "{max}",
              String(LIMITES_DO_PRODUTO.maxProibicoes),
            )}
          >
            <Textarea id="produto-proibicoes" rows={3} value={f.proibicoes} onChange={set("proibicoes")} />
          </Campo>

          <fieldset className="flex flex-col gap-3 rounded-sm border border-border p-3">
            <legend className="px-1 text-sm font-medium text-text">
              {t("Textos das mensagens (opcional)")}
            </legend>
            <p className="text-xs text-text-muted">
              {t(
                "Escreva você mesmo o que a campanha diz. Vazio = o texto padrão, que cita um achado do site. Marcadores: {empresa}, {assina}, {produto}, {resumo}, {link_demo}, {prova}, {achado}, {solucao}. Sem {achado} nem {solucao}, a empresa não precisa ter achado. O aviso para parar de receber é acrescentado pelo sistema.",
              )}
            </p>
            <Campo id="produto-mensagem-1" rotulo={t("Mensagem 1")}>
              <Textarea
                id="produto-mensagem-1"
                rows={6}
                maxLength={LIMITES_DO_PRODUTO.mensagem}
                value={f.mensagem1}
                onChange={set("mensagem1")}
              />
            </Campo>
            <Campo
              id="produto-mensagem-2"
              rotulo={t("Mensagem 2")}
              ajuda={t("Opcional. Sem ela, o agente conduz a conversa pelo prompt dele.")}
            >
              <Textarea
                id="produto-mensagem-2"
                rows={5}
                maxLength={LIMITES_DO_PRODUTO.mensagem}
                value={f.mensagem2}
                onChange={set("mensagem2")}
              />
            </Campo>
          </fieldset>

          <fieldset className="flex flex-col gap-3 rounded-sm border border-border p-3">
            <legend className="px-1 text-sm font-medium text-text">
              {t("Problema encontrado → como você resolve")}
            </legend>
            <p className="text-xs text-text-muted">
              {t("Preencha só os problemas que o seu produto resolve. Linhas em branco são ignoradas.")}
            </p>
            {CODIGOS_DE_ACHADO.map((codigo) => (
              <div key={codigo} className="flex flex-col gap-1">
                <Label htmlFor={`produto-solucao-${codigo}`}>{t(ROTULO_DO_ACHADO[codigo])}</Label>
                <Input
                  id={`produto-solucao-${codigo}`}
                  maxLength={LIMITES_DO_PRODUTO.solucao}
                  value={f.solucoes[codigo] ?? ""}
                  onChange={(e) =>
                    setF((a) => ({ ...a, solucoes: { ...a.solucoes, [codigo]: e.target.value } }))
                  }
                />
              </div>
            ))}
          </fieldset>

          {erro && (
            <p role="alert" className="rounded-sm bg-error-bg p-3 text-sm text-error-fg">
              {erro}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onFechar}>
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? t("Salvando…") : t("Salvar produto")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Campo({
  id,
  rotulo,
  ajuda,
  children,
}: {
  id: string;
  rotulo: string;
  ajuda?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
      {ajuda && <p className="text-xs text-text-muted">{ajuda}</p>}
    </div>
  );
}
