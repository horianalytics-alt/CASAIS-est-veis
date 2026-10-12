/**
 * Copy da tela de Carteira (/carteira), em português do Brasil.
 *
 * Termos canônicos: "conta", "cartão", "fatura", "Pagar fatura", "saldo atual", "saldo previsto".
 */

export const CARTEIRA = {
  titulo: 'Carteira',
  subtitulo: 'Contas, cartões e controle de faturas',
  saldoTotal: 'Saldo total em contas',
  apoioSaldoTotal: 'Soma dos saldos reais de todas as contas ativas',
  saldoPrevistoTotal: 'Previsão após pendências',
  contasAtivas: 'Contas',
  contasArquivadas: 'Contas arquivadas',
  mostrarArquivadas: 'Mostrar arquivadas',
  ocultarArquivadas: 'Ocultar arquivadas',
  semContas: 'Nenhuma conta cadastrada.',
  semContasDica: 'Crie uma conta para começar a organizar seu dinheiro.',
  criarConta: 'Criar conta',
  saldoAtual: 'Saldo atual',
  saldoPrevisto: 'Previsto',
  entradasPendentes: 'A receber',
  saidasPendentes: 'A pagar',
  fechamentoEVencimento: (fechamento: number, vencimento: number) =>
    `Fecha dia ${fechamento} · Vence dia ${vencimento}`,
  faturasTitulo: 'Faturas de cartão',
  faturasSubtitulo: 'Ciclos de fatura abertos e fechados',
  semFaturas: 'Nenhuma fatura registrada.',
  vencimento: 'Vencimento',
  venceEm: (data: string) => `Vence em ${data}`,
  comprasContador: (qtd: number) => `${qtd} ${qtd === 1 ? 'compra' : 'compras'}`,
  valorTotal: 'Total da fatura',
  valorEmAberto: 'Em aberto',
  pagarFatura: 'Pagar fatura',
  faturaPaga: 'Paga',
  faturaAberta: 'Aberta',
  faturaFechada: 'Fechada',
  arquivar: 'Arquivar conta',
  desarquivar: 'Reativar conta',
  erroCarregar: 'Não foi possível carregar a carteira. Tente novamente.',
} as const

export const PAGAR_FATURA = {
  titulo: 'Pagar fatura',
  subtitulo: 'Registra o pagamento da fatura no histórico da casa',
  cartao: 'Cartão',
  fatura: 'Fatura',
  valor: 'Valor em aberto',
  contaOrigem: 'Pagar com a conta',
  contaOrigemPlaceholder: 'Selecione a conta de saída',
  dataPagamento: 'Data do pagamento',
  botaoConfirmar: 'Confirmar pagamento',
  botaoCancelar: 'Cancelar',
  pagando: 'Confirmando pagamento…',
  semSaldoOuOrigem: 'Não há contas disponíveis para realizar o pagamento.',
  sucesso: 'Fatura paga com sucesso!',
} as const
