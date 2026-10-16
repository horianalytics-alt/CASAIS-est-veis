'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, Loader2, AlertCircle } from 'lucide-react'
import { atualizarLancamento } from '@/actions/editar-lancamento'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CampoErro } from '@/components/ui/campo-erro'
import { parseBRLInput, todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import { LANCAR } from '@/features/transacoes/copy'
import type { Database } from '@/types/database'

type Transacao = Database['public']['Tables']['transactions']['Row']
type TipoLancamento = 'despesa' | 'receita' | 'transferencia'

const OPCOES_DE_TIPO: ReadonlyArray<{ valor: TipoLancamento; rotulo: string; classeAtiva: string }> = [
  {
    valor: 'despesa',
    rotulo: 'Despesa',
    classeAtiva: 'border-despesa/40 bg-despesa/10 text-despesa shadow-2xs font-bold',
  },
  {
    valor: 'receita',
    rotulo: 'Receita',
    classeAtiva: 'border-receita/40 bg-receita/10 text-receita shadow-2xs font-bold',
  },
  {
    valor: 'transferencia',
    rotulo: 'Transferência',
    classeAtiva:
      'border-transferencia/40 bg-transferencia/10 text-transferencia shadow-2xs font-bold',
  },
]

export interface ItemSelectOpcao {
  id: string
  name: string
}

export interface MembroOpcao {
  id: string
  display_name: string
}

export interface DialogoEditarLancamentoProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  transacao: Transacao | null
  contas: ItemSelectOpcao[]
  categorias: ItemSelectOpcao[]
  membros: MembroOpcao[]
  onSalvo?: (salvo: LancamentoSalvo) => void
}

/** Colunas que a edição individual grava (espelho de montarPatchIndividual). */
export type LancamentoSalvo = Pick<
  Transacao,
  | 'id'
  | 'type'
  | 'description'
  | 'amount'
  | 'date'
  | 'account_id'
  | 'to_account_id'
  | 'category_id'
  | 'paid_by_member_id'
  | 'is_paid'
  | 'paid_date'
  | 'notes'
  | 'is_benefit'
  | 'is_futile'
  | 'futile_label'
>

export function DialogoEditarLancamento({
  aberto,
  onOpenChange,
  transacao,
  contas,
  categorias,
  membros,
  onSalvo,
}: DialogoEditarLancamentoProps) {
  const router = useRouter()
  const [pendente, setPendente] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)
  const [camposComErro, setCamposComErro] = React.useState<Record<string, string[]>>({})

  // Estados do formulário
  const [tipo, setTipo] = React.useState<TipoLancamento>('despesa')
  const [descricao, setDescricao] = React.useState('')
  const [valorTexto, setValorTexto] = React.useState('')
  const [data, setData] = React.useState(todayISO())
  const [contaId, setContaId] = React.useState('')
  const [contaDestinoId, setContaDestinoId] = React.useState('')
  const [categoriaId, setCategoriaId] = React.useState<string>('')
  const [membroId, setMembroId] = React.useState('')
  const [estaPago, setEstaPago] = React.useState(false)
  const [dataPagamento, setDataPagamento] = React.useState(todayISO())
  const [observacao, setObservacao] = React.useState('')
  // Benefício (VR/VA) e gasto fútil: só existem em despesa (mesma regra do
  // form de criar e de montarPatchIndividual no servidor).
  const [ehBeneficio, setEhBeneficio] = React.useState(false)
  const [ehFutil, setEhFutil] = React.useState(false)
  const [rotuloFutil, setRotuloFutil] = React.useState('')

  // Erro de campo some quando AQUELE campo muda; o aviso geral some junto
  // quando não sobra nenhum erro de campo (L-013 do caderno). Chamar no
  // máximo uma vez por evento: lê `camposComErro` do render atual.
  const limparErroDoCampo = (campo: string) => {
    if (!camposComErro[campo]) return
    const resto = { ...camposComErro }
    delete resto[campo]
    setCamposComErro(resto)
    if (Object.keys(resto).length === 0) setErro(null)
  }

  // Listas mais recentes, lidas pelo preenchimento sem virar dependência dele.
  // A página /inicio remonta `contas`/`membros` como arrays NOVOS a cada
  // router.refresh() (o OuvinteRealtime chama um quando o parceiro lança algo).
  // Se fossem dependência, um lançamento da outra pessoa com este diálogo aberto
  // repreencheria tudo com os valores originais e apagaria a edição em curso.
  const opcoesAtuais = React.useRef({ contas, membros })
  React.useEffect(() => {
    opcoesAtuais.current = { contas, membros }
  }, [contas, membros])

  // Preenche dados ao abrir com a transação (só na abertura ou troca de transação)
  React.useEffect(() => {
    if (transacao && aberto) {
      const { contas, membros } = opcoesAtuais.current
      const tipoAtual = (transacao.type as TipoLancamento) ?? 'despesa'
      setTipo(tipoAtual)
      setDescricao(transacao.description || '')
      setValorTexto(
        transacao.amount
          ? transacao.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
          : '',
      )
      setData(transacao.date || todayISO())
      const contaOrigem = transacao.account_id || contas[0]?.id || ''
      setContaId(contaOrigem)
      setContaDestinoId(
        transacao.to_account_id ||
          contas.find((c) => c.id !== contaOrigem)?.id ||
          '',
      )
      setCategoriaId(transacao.category_id || '')
      setMembroId(transacao.paid_by_member_id || membros[0]?.id || '')
      setEstaPago(Boolean(transacao.is_paid))
      setDataPagamento(transacao.paid_date || transacao.date || todayISO())
      setObservacao(transacao.notes || '')
      setEhBeneficio(Boolean(transacao.is_benefit))
      setEhFutil(Boolean(transacao.is_futile))
      setRotuloFutil(transacao.futile_label || '')
      setErro(null)
      setCamposComErro({})
    }
  }, [transacao, aberto])

  const handleMudarTipo = (novoTipo: TipoLancamento) => {
    setTipo(novoTipo)
    if (novoTipo === 'transferencia' && (!contaDestinoId || contaDestinoId === contaId)) {
      const outra = contas.find((c) => c.id !== contaId)?.id || ''
      setContaDestinoId(outra)
    }
  }

  const handleMudarContaOrigem = (novaConta: string) => {
    setContaId(novaConta)
    if (tipo === 'transferencia' && contaDestinoId === novaConta) {
      const outra = contas.find((c) => c.id !== novaConta)?.id || ''
      setContaDestinoId(outra)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!transacao) return

    setErro(null)
    setCamposComErro({})

    const descLimpa = descricao.trim()
    if (!descLimpa) {
      setErro('Informe a descrição do lançamento.')
      return
    }

    const valorNumero = parseBRLInput(valorTexto)
    if (Number.isNaN(valorNumero) || valorNumero <= 0) {
      setErro('Informe um valor válido e maior que zero.')
      return
    }

    if (Math.abs(valorNumero * 100 - Math.round(valorNumero * 100)) >= 1e-6) {
      setErro('Use no máximo 2 casas decimais no valor.')
      return
    }

    if (!contaId) {
      setErro('Selecione uma conta.')
      return
    }

    if (tipo === 'transferencia') {
      if (!contaDestinoId) {
        setErro('Selecione a conta de destino.')
        return
      }
      if (contaDestinoId === contaId) {
        setErro('Escolha uma conta de destino diferente da conta de origem.')
        return
      }
    }

    if (!membroId) {
      setErro('Selecione quem realizou o pagamento.')
      return
    }

    if (estaPago && !dataPagamento) {
      setErro('Informe a data em que foi pago.')
      return
    }

    setPendente(true)

    // Os 3 campos vão SEMPRE (recomendação do contrato do Estrutura): omitir
    // significaria "manter o que a linha tem". Fora de despesa vão zerados,
    // igual ao form de criar.
    const ehDespesa = tipo === 'despesa'
    const futilFinal = ehDespesa && ehFutil
    const valorFinal = Math.round(valorNumero * 100) / 100
    const observacaoFinal = observacao.trim() || null
    const rotuloFinal = futilFinal ? rotuloFutil.trim() || null : null

    try {
      const resposta = await atualizarLancamento({
        id: transacao.id,
        tipo,
        descricao: descLimpa,
        valor: valorFinal,
        data,
        contaId,
        contaDestinoId: tipo === 'transferencia' ? contaDestinoId : undefined,
        categoriaId: tipo === 'transferencia' ? undefined : (categoriaId || null),
        pagoPorId: membroId,
        estaPago,
        dataDoPagamento: estaPago ? dataPagamento : null,
        observacao: observacaoFinal,
        ehBeneficio: ehDespesa && ehBeneficio,
        ehFutil: futilFinal,
        rotuloDoFutil: rotuloFinal,
      })

      if (!resposta.ok) {
        const msgErro = resposta.camposComErro?.formulario?.[0] || resposta.erro
        setErro(msgErro)
        setCamposComErro(resposta.camposComErro ?? {})
        setPendente(false)
        return
      }

      setPendente(false)
      onOpenChange(false)
      // O que foi gravado, nas colunas da linha. A lista usa para atualizar o
      // item na hora: itens vindos de "carregar mais" não são substituídos pelo
      // router.refresh(), e reabrir o diálogo neles mostraria (e reenviaria)
      // os valores antigos.
      onSalvo?.({
        id: transacao.id,
        type: tipo,
        description: descLimpa,
        amount: valorFinal,
        date: data,
        account_id: contaId,
        to_account_id: tipo === 'transferencia' ? contaDestinoId : null,
        category_id: tipo === 'transferencia' ? null : categoriaId || null,
        paid_by_member_id: membroId,
        is_paid: estaPago,
        paid_date: estaPago ? dataPagamento : null,
        notes: observacaoFinal,
        is_benefit: ehDespesa && ehBeneficio,
        is_futile: futilFinal,
        futile_label: rotuloFinal,
      })
      router.refresh()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro inesperado ao salvar alterações.')
      setPendente(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Pencil className="size-4" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">Editar lançamento</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Altere os campos necessários e confirme as modificações.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {erro && (
          <Alert variant="destructive" className="py-2.5">
            <AlertCircle className="size-4" />
            <AlertDescription className="text-xs">{erro}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-1 text-xs">
          {/* 1. Tipo de Lançamento — mesmo padrão de form-lancamento.tsx: fieldset +
              legend + rádio nativo visualmente oculto. O leitor de tela anuncia
              "Tipo, grupo" e "Despesa, rádio, marcado 1 de 3"; setas trocam a opção. */}
          <fieldset
            className="flex flex-col gap-1.5"
            aria-describedby={camposComErro.tipo ? 'erro-tipo' : undefined}
          >
            <legend className="text-xs font-medium">Tipo</legend>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {OPCOES_DE_TIPO.map((opcao) => (
                <label
                  key={opcao.valor}
                  className={cn(
                    'py-2 px-3 rounded-lg border font-semibold text-center transition-all cursor-pointer has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:border-ring',
                    tipo === opcao.valor ? opcao.classeAtiva : 'border-border/70 hover:bg-muted/50 text-muted-foreground',
                  )}
                >
                  <input
                    type="radio"
                    name="edit-tipo"
                    value={opcao.valor}
                    checked={tipo === opcao.valor}
                    onChange={() => handleMudarTipo(opcao.valor)}
                    className="sr-only"
                  />
                  {opcao.rotulo}
                </label>
              ))}
            </div>
            {camposComErro.tipo && <CampoErro id="erro-tipo" mensagens={camposComErro.tipo} />}
          </fieldset>

          {/* 2. Descrição */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-descricao" className="text-xs font-medium">
              Descrição
            </Label>
            <Input
              id="edit-descricao"
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Mercado Semanal"
              maxLength={120}
              required
              aria-invalid={camposComErro.descricao ? true : undefined}
              aria-describedby={camposComErro.descricao ? 'erro-descricao' : undefined}
              className="h-9 text-xs"
            />
            {camposComErro.descricao && (
              <CampoErro id="erro-descricao" mensagens={camposComErro.descricao} />
            )}
          </div>

          {/* 3. Valor e Data */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-valor" className="text-xs font-medium">
                Valor (R$)
              </Label>
              <Input
                id="edit-valor"
                type="text"
                inputMode="decimal"
                value={valorTexto}
                onChange={(e) => setValorTexto(e.target.value)}
                placeholder="0,00"
                required
                aria-invalid={camposComErro.valor ? true : undefined}
                aria-describedby={camposComErro.valor ? 'erro-valor' : undefined}
                className="h-9 text-xs font-mono num-tabular"
              />
              {camposComErro.valor && <CampoErro id="erro-valor" mensagens={camposComErro.valor} />}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-data" className="text-xs font-medium">
                Data
              </Label>
              <Input
                id="edit-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                required
                aria-invalid={camposComErro.data ? true : undefined}
                aria-describedby={camposComErro.data ? 'erro-data' : undefined}
                className="h-9 text-xs"
              />
              {camposComErro.data && <CampoErro id="erro-data" mensagens={camposComErro.data} />}
            </div>
          </div>

          {/* 4. Conta de Origem e Categoria / Conta de Destino */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-conta" className="text-xs font-medium">
                {tipo === 'transferencia' ? 'Conta de origem' : 'Conta'}
              </Label>
              <Select value={contaId} onValueChange={handleMudarContaOrigem}>
                <SelectTrigger
                  id="edit-conta"
                  className="h-9 text-xs"
                  aria-invalid={camposComErro.contaId ? true : undefined}
                  aria-describedby={camposComErro.contaId ? 'erro-conta' : undefined}
                >
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {camposComErro.contaId && (
                <CampoErro id="erro-conta" mensagens={camposComErro.contaId} />
              )}
            </div>

            {/* As duas pontas do ternário têm a MESMA forma (div > Label + Select).
                Sem `key`, o React reaproveita a mesma instância do Select do Radix:
                o `value` troca de categoria para conta (ou o contrário) enquanto o
                <select> nativo escondido ainda tem as opções da outra lista. O
                Radix então grava o valor novo nesse <select>, que não acha a opção,
                vira "" e dispara `change` → `onValueChange("")` → o campo é zerado.
                Com `key` distinta cada ponta monta o próprio Select do zero. */}
            {tipo === 'transferencia' ? (
              <div key="campo-conta-destino" className="flex flex-col gap-1.5">
                <Label htmlFor="edit-conta-destino" className="text-xs font-medium">
                  Conta de destino
                </Label>
                {/* Contas têm id não vazio: "" aqui só pode ser o eco do <select>
                    nativo descrito acima, nunca escolha do usuário. */}
                <Select
                  value={contaDestinoId}
                  onValueChange={(val) => {
                    if (val) setContaDestinoId(val)
                  }}
                >
                  <SelectTrigger
                    id="edit-conta-destino"
                    className="h-9 text-xs"
                    aria-invalid={camposComErro.contaDestinoId ? true : undefined}
                    aria-describedby={
                      camposComErro.contaDestinoId ? 'erro-conta-destino' : undefined
                    }
                  >
                    <SelectValue placeholder="Selecione o destino" />
                  </SelectTrigger>
                  <SelectContent>
                    {contas.map((c) => (
                      <SelectItem key={c.id} value={c.id} disabled={c.id === contaId}>
                        {c.name} {c.id === contaId ? '(origem)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {camposComErro.contaDestinoId && (
                  <CampoErro id="erro-conta-destino" mensagens={camposComErro.contaDestinoId} />
                )}
              </div>
            ) : (
              <div key="campo-categoria" className="flex flex-col gap-1.5">
                <Label htmlFor="edit-categoria" className="text-xs font-medium">
                  Categoria
                </Label>
                <Select
                  value={categoriaId || '__nenhuma__'}
                  // Nenhum item desta lista tem value "" ("Sem categoria" é
                  // '__nenhuma__'): "" só chega pelo <select> nativo do Radix sem a
                  // opção correspondente. Defesa extra além da `key` acima.
                  onValueChange={(val) => {
                    if (!val) return
                    setCategoriaId(val === '__nenhuma__' ? '' : val)
                  }}
                >
                  <SelectTrigger
                    id="edit-categoria"
                    className="h-9 text-xs"
                    aria-invalid={camposComErro.categoriaId ? true : undefined}
                    aria-describedby={camposComErro.categoriaId ? 'erro-categoria' : undefined}
                  >
                    <SelectValue placeholder="Sem categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__nenhuma__">Sem categoria</SelectItem>
                    {categorias.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {camposComErro.categoriaId && (
                  <CampoErro id="erro-categoria" mensagens={camposComErro.categoriaId} />
                )}
              </div>
            )}
          </div>

          {/* 5. Quem pagou */}
          {membros.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-membro" className="text-xs font-medium">
                Quem realizou o pagamento
              </Label>
              <Select value={membroId} onValueChange={setMembroId}>
                <SelectTrigger
                  id="edit-membro"
                  className="h-9 text-xs"
                  aria-invalid={camposComErro.pagoPorId ? true : undefined}
                  aria-describedby={camposComErro.pagoPorId ? 'erro-membro' : undefined}
                >
                  <SelectValue placeholder="Selecione o membro" />
                </SelectTrigger>
                <SelectContent>
                  {membros.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {camposComErro.pagoPorId && (
                <CampoErro id="erro-membro" mensagens={camposComErro.pagoPorId} />
              )}
            </div>
          )}

          {/* 6. Status Pago e Data de Pagamento */}
          <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-pago"
                checked={estaPago}
                onCheckedChange={(checked) => setEstaPago(Boolean(checked))}
              />
              <Label htmlFor="edit-pago" className="text-xs font-medium cursor-pointer">
                Lançamento já foi pago / liquidado
              </Label>
            </div>

            {estaPago && (
              <div className="flex flex-col gap-1 pt-1.5 pl-6">
                <Label htmlFor="edit-data-pagamento" className="text-[11px] text-muted-foreground">
                  Data em que foi pago
                </Label>
                <Input
                  id="edit-data-pagamento"
                  type="date"
                  value={dataPagamento}
                  onChange={(e) => setDataPagamento(e.target.value)}
                  aria-invalid={camposComErro.dataDoPagamento ? true : undefined}
                  aria-describedby={
                    camposComErro.dataDoPagamento ? 'erro-data-pagamento' : undefined
                  }
                  className="h-8 text-xs max-w-[200px]"
                />
                {camposComErro.dataDoPagamento && (
                  <CampoErro
                    id="erro-data-pagamento"
                    mensagens={camposComErro.dataDoPagamento}
                  />
                )}
              </div>
            )}
          </div>

          {/* 6b. Mais detalhes (só despesa) — sempre aberto aqui, ao contrário do
              form de criar: quem edita precisa VER a marcação que a linha já tem. */}
          {tipo === 'despesa' && (
            <fieldset className="flex flex-col gap-1 rounded-lg border border-border/70 bg-muted/30 p-3">
              {/* float-left tira a legenda de cima da borda (sem o recorte que o
                  navegador abre na borda do fieldset), igual ao bloco "pago". */}
              <legend className="float-left w-full text-xs font-medium">
                {LANCAR.maisDetalhes}
              </legend>

              <div className="flex min-h-[44px] items-center gap-2">
                <Checkbox
                  id="edit-beneficio"
                  checked={ehBeneficio}
                  onCheckedChange={(marcado) => setEhBeneficio(marcado === true)}
                  disabled={pendente}
                />
                <Label
                  htmlFor="edit-beneficio"
                  className="flex min-h-[44px] flex-1 cursor-pointer items-center text-xs font-medium"
                >
                  {LANCAR.ehBeneficioLabel}
                </Label>
              </div>

              {/* Sem slot de erro nos 2 checkboxes: este form sempre manda
                  boolean, e o schema da action só acusa tipo inválido neles. */}
              <div className="flex min-h-[44px] items-center gap-2">
                <Checkbox
                  id="edit-futil"
                  checked={ehFutil}
                  onCheckedChange={(marcado) => {
                    setEhFutil(marcado === true)
                    // Desmarcar fútil esconde o rótulo; o erro dele sai junto.
                    limparErroDoCampo('rotuloDoFutil')
                  }}
                  disabled={pendente}
                />
                <Label
                  htmlFor="edit-futil"
                  className="flex min-h-[44px] flex-1 cursor-pointer items-center text-xs font-medium"
                >
                  {LANCAR.ehFutilLabel}
                </Label>
              </div>

              {ehFutil && (
                <div className="flex flex-col gap-1 pt-1.5 pl-6">
                  <Label
                    htmlFor="edit-rotulo-futil"
                    className="text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)] text-muted-foreground"
                  >
                    {LANCAR.rotuloDoFutilLabel}
                  </Label>
                  <Input
                    id="edit-rotulo-futil"
                    type="text"
                    value={rotuloFutil}
                    onChange={(e) => {
                      setRotuloFutil(e.target.value)
                      limparErroDoCampo('rotuloDoFutil')
                    }}
                    placeholder={LANCAR.rotuloDoFutilPlaceholder}
                    maxLength={60}
                    disabled={pendente}
                    aria-invalid={camposComErro.rotuloDoFutil ? true : undefined}
                    aria-describedby={camposComErro.rotuloDoFutil ? 'erro-rotulo-futil' : undefined}
                    className="h-9 text-xs"
                  />
                  {camposComErro.rotuloDoFutil && (
                    <CampoErro id="erro-rotulo-futil" mensagens={camposComErro.rotuloDoFutil} />
                  )}
                </div>
              )}
            </fieldset>
          )}

          {/* 7. Observação */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-obs" className="text-xs font-medium">
              Observação (opcional)
            </Label>
            <Input
              id="edit-obs"
              type="text"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Notas adicionais..."
              maxLength={500}
              aria-invalid={camposComErro.observacao ? true : undefined}
              aria-describedby={camposComErro.observacao ? 'erro-obs' : undefined}
              className="h-9 text-xs"
            />
            {camposComErro.observacao && (
              <CampoErro id="erro-obs" mensagens={camposComErro.observacao} />
            )}
          </div>

          <DialogFooter className="mt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="toque"
              onClick={() => onOpenChange(false)}
              disabled={pendente}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="default"
              size="toque"
              disabled={pendente}
              className="gap-2"
            >
              {pendente ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Check className="size-4" />
                  <span>Salvar alterações</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
