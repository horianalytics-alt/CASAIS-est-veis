// Sentinela r2 — sonda da lógica PURA do gráfico de projeção (sem banco, sem env).
// Alimenta montarProjecaoCaixinha com os mesmos movimentos que o banco gerou no
// cenário H1/H2 de sentinela-hostil-r2.sql e imprime o que o gráfico mostraria.
import { montarProjecaoCaixinha, mesEmSaoPaulo } from '../../../../app/src/components/carteira/projecao-caixinha-logica'

const cx = (id: string, balance: number, created: string) => ({
  id, name: id, rate_bps: 100, rate_defined_at: '2026-08-01', balance_cents: balance, created_at: created,
})
const resumo = (r: ReturnType<typeof montarProjecaoCaixinha>) =>
  r.tipo === 'ok' || r.tipo === 'sem_simulacao'
    ? `${r.tipo} ${r.pontos.map((p) => `${p.mes}:${p.valorCentavos}${p.pendenteCentavos ? `(+${p.pendenteCentavos} pend)` : ''}[${p.situacao[0]}]`).join(' ')}`
    : r.tipo

// H1 depois de confirmar m0 e m1 (rendimentos datados no fim da competência, 00017)
console.log('P1 H1 confirmado:', resumo(montarProjecaoCaixinha({
  caixinha: cx('w', 1010, '2026-08-01T03:00:00Z'),
  movimentos: [
    { caixinhaId: 'w', tipo: 'entrada', valorCentavos: 100000, ocorridoEm: '2026-08-05' },
    { caixinhaId: 'w', tipo: 'saida', valorCentavos: 100000, ocorridoEm: '2026-09-01' },
    { caixinhaId: 'w', tipo: 'rendimento', valorCentavos: 1000, ocorridoEm: '2026-08-31' },
    { caixinhaId: 'w', tipo: 'rendimento', valorCentavos: 10, ocorridoEm: '2026-09-30' },
  ],
  pendentes: [{ caixinhaId: 'w', competencia: '2026-10-01', valorCentavos: 10 }],
  mesAtual: '2026-11', mesesProjecao: 3,
})))

// H1 ANTES de confirmar: pendentes como o banco devolveu (2026-08=1000)
console.log('P2 H1 pendente:', resumo(montarProjecaoCaixinha({
  caixinha: cx('w', 0, '2026-08-01T03:00:00Z'),
  movimentos: [
    { caixinhaId: 'w', tipo: 'entrada', valorCentavos: 100000, ocorridoEm: '2026-08-05' },
    { caixinhaId: 'w', tipo: 'saida', valorCentavos: 100000, ocorridoEm: '2026-09-01' },
  ],
  pendentes: [{ caixinhaId: 'w', competencia: '2026-08-01', valorCentavos: 1000 }],
  mesAtual: '2026-11', mesesProjecao: 3,
})))

// Fuso: caixinha criada 00:30 de 1/dez em SP = 03:30Z; e 23:30 de 30/nov em SP = 02:30Z de 1/dez
console.log('P3 fuso:', mesEmSaoPaulo('2026-12-01T03:30:00Z'), mesEmSaoPaulo('2026-12-01T02:30:00Z'))

// Movimento repetido (paginação instável) -> deve virar 'divergente', nunca número
console.log('P4 duplicado:', resumo(montarProjecaoCaixinha({
  caixinha: cx('d', 100000, '2026-08-01T03:00:00Z'),
  movimentos: [
    { caixinhaId: 'd', tipo: 'entrada', valorCentavos: 100000, ocorridoEm: '2026-08-05' },
    { caixinhaId: 'd', tipo: 'entrada', valorCentavos: 100000, ocorridoEm: '2026-08-05' },
  ],
  pendentes: [], mesAtual: '2026-11', mesesProjecao: 3,
})))

// Taxa 100%/mês por 12 meses sobre R$ 99.999.999,99 (limites do Zod)
console.log('P5 estouro:', resumo(montarProjecaoCaixinha({
  caixinha: { ...cx('g', 9999999999, '2026-11-01T03:00:00Z'), rate_bps: 10000 },
  movimentos: [{ caixinhaId: 'g', tipo: 'entrada', valorCentavos: 9999999999, ocorridoEm: '2026-11-02' }],
  pendentes: [], mesAtual: '2026-11',
})).slice(0, 120))
