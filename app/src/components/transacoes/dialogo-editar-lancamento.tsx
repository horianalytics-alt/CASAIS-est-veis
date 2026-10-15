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
  onSalvo?: () => void
}

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

  // Preenche dados ao abrir com a transação
  React.useEffect(() => {
    if (transacao && aberto) {
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
      setErro(null)
      setCamposComErro({})
    }
  }, [transacao, aberto, contas, membros])

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

    try {
      const resposta = await atualizarLancamento({
        id: transacao.id,
        tipo,
        descricao: descLimpa,
        valor: Math.round(valorNumero * 100) / 100,
        data,
        contaId,
        contaDestinoId: tipo === 'transferencia' ? contaDestinoId : undefined,
        categoriaId: tipo === 'transferencia' ? undefined : (categoriaId || null),
        pagoPorId: membroId,
        estaPago,
        dataDoPagamento: estaPago ? dataPagamento : null,
        observacao: observacao.trim() || null,
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
      onSalvo?.()
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

            {tipo === 'transferencia' ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-conta-destino" className="text-xs font-medium">
                  Conta de destino
                </Label>
                <Select value={contaDestinoId} onValueChange={setContaDestinoId}>
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-categoria" className="text-xs font-medium">
                  Categoria
                </Label>
                <Select
                  value={categoriaId || '__nenhuma__'}
                  onValueChange={(val) => setCategoriaId(val === '__nenhuma__' ? '' : val)}
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
