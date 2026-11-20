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

/**
 * Gráfico de projeção por caixinha (Dash). Plano:
 * docs/planos/dash-grafico-projecao-caixinha.md §2 e §3. Termos fixos:
 * "saldo confirmado" (linha sólida), "simulação" (tracejada), "rendimento a
 * confirmar" (losango). A definição abaixo é a MESMA do plano e da entrega.
 */
export const PROJECAO_CAIXINHA = {
  rotuloGrafico: (nome: string, meses: number) =>
    `Saldo confirmado e simulação de ${meses} ${meses === 1 ? 'mês' : 'meses'} da caixinha ${nome}`,
  chaveConfirmado: 'Saldo confirmado',
  chaveSimulacao: 'Simulação',
  chavePendente: 'Rendimento a confirmar',
  hoje: 'hoje',
  situacaoConfirmado: 'Confirmado',
  situacaoHoje: 'Saldo de hoje',
  situacaoSimulacao: 'Simulação',
  notaSimulacao: (taxa: string) => `Simulação a ${taxa}`,
  notaPendente: (valor: string | null) =>
    valor === null ? 'Rendimento a confirmar' : `Rendimento de ${valor} a confirmar`,
  rotuloLongoSimulado: (mes: string) => `${mes} (simulação)`,
  colunaMes: 'Mês',
  colunaSaldo: 'Saldo',
  colunaSituacao: 'Situação',
  avisoPendentes: (meses: number, valor: string | null) =>
    `${meses} ${meses === 1 ? 'mês' : 'meses'} com rendimento estimado a confirmar` +
    (valor === null ? '. ' : ` (${valor}). `) +
    'Esse valor ainda não está no saldo e não entra na simulação.',
  semSimulacaoSaldoZero: 'Sem saldo nesta caixinha agora, então não há o que simular.',
  semSimulacaoGrande: 'O valor simulado passa do limite que o app consegue calcular.',
  vazioTitulo: 'Esta caixinha ainda está vazia',
  vazioDescricao: 'Aplique ou aloque um valor nela para ver o saldo e a simulação dos próximos meses.',
  erroTitulo: 'Não foi possível montar o gráfico desta caixinha',
  erroDescricao: 'Os dados não carregaram ou não fecharam com o saldo. Tente de novo em instantes.',
  tentarDeNovo: 'Tentar de novo',
  comoCalculamos: 'Como calculamos',
  definicaoConfirmado:
    'Saldo confirmado: o que estava na caixinha no fim de cada mês: aplicações e alocações, ' +
    'menos resgates, mais os rendimentos que vocês já confirmaram. Rendimento estimado só entra depois de confirmado.',
  saldoDeHoje: (valor: string) => `Saldo de hoje: ${valor}`,
  definicaoSimulacao: (taxa: string, definidaEm: string, meses: number) =>
    `Simulação (linha tracejada): o saldo confirmado de hoje rendendo a taxa atual da caixinha (${taxa}, ` +
    `informada em ${definidaEm}) com juros compostos, mês a mês, por ${meses} ${meses === 1 ? 'mês' : 'meses'}, ` +
    'sem novas aplicações nem resgates. ' +
    'É uma estimativa, não uma promessa de rendimento.',
  atualizadoEm: (quando: string) => `Atualizado em ${quando} (horário de Brasília)`,
} as const
