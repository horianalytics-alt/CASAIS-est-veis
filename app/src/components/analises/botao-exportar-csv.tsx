'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ANALISES } from '@/features/analises/copy'

export interface TransacaoExportavel {
  data: string
  descricao: string
  valor: number
  tipo: string
  conta: string
  categoria?: string
  estaPago: boolean
}

interface BotaoExportarCsvProps {
  anoMes: string
  transacoes: TransacaoExportavel[]
}

export function BotaoExportarCsv({ anoMes, transacoes }: BotaoExportarCsvProps) {
  const [baixando, setBaixando] = useState(false)

  function exportar() {
    setBaixando(true)
    try {
      const cabecalho = ['Data', 'Descrição', 'Valor (R$)', 'Tipo', 'Conta', 'Categoria', 'Status']
      const linhas = transacoes.map((t) => [
        t.data,
        `"${t.descricao.replace(/"/g, '""')}"`,
        t.valor.toFixed(2).replace('.', ','),
        t.tipo,
        `"${t.conta.replace(/"/g, '""')}"`,
        `"${(t.categoria ?? '').replace(/"/g, '""')}"`,
        t.estaPago ? 'Pago' : 'Pendente',
      ])

      const conteudoCsv = [
        cabecalho.join(';'),
        ...linhas.map((l) => l.join(';')),
      ].join('\r\n')

      // \uFEFF força o Excel a reconhecer UTF-8
      const blob = new Blob(['\uFEFF' + conteudoCsv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute('download', `financas-a-dois-${anoMes}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } finally {
      setBaixando(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="toque"
      onClick={exportar}
      disabled={baixando || transacoes.length === 0}
      className="gap-[var(--esp-2)]"
    >
      <Download className="size-4" aria-hidden="true" />
      {baixando ? ANALISES.exportandoCsv : ANALISES.exportarCsv}
    </Button>
  )
}
