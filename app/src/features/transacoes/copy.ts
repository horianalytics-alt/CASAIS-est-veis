/**
 * Copy de /inicio e /lancar, em português do Brasil.
 *
 * Termos canônicos: "lançamento" (nunca transação), "conta" (bancária ou
 * cartão), "Entrar"/"Sair" para sessão. Mensagem de erro de action NÃO mora
 * aqui: o `ResultadoAction.erro` já chega em pt-BR e é exibido como vem.
 */

export const NAVEGACAO = {
  rotuloDaBarra: 'Navegação principal',
  inicio: 'Início',
  carteira: 'Carteira',
  lancar: 'Lançar',
  acerto: 'Acerto',
  ajustes: 'Ajustes',
  sair: 'Sair',
} as const

export const INICIO = {
  titulo: 'Início',
  mesAnterior: 'Mês anterior',
  mesSeguinte: 'Próximo mês',
  entrou: 'Entrou',
  saiu: 'Saiu',
  saldoDoMes: 'Saldo do mês',
  aPagar: 'A pagar',
  apoioEntrou: 'Receitas já recebidas',
  apoioSaiu: 'Despesas já pagas',
  apoioAPagar: 'Despesas pendentes',
  tituloContas: 'Saldo das contas',
  semContas: 'Nenhuma conta cadastrada ainda.',
  tituloLancamentos: 'Lançamentos',
  semLancamentosNoMes: 'Nenhum lançamento neste mês.',
  semLancamentosNoMesDica: 'Use os botões acima para ver outro mês.',
  pago: 'Pago',
  pendente: 'Pendente',
  pagoEm: 'Pago em',
  paginaAnterior: 'Anterior',
  paginaSeguinte: 'Seguinte',
  paginacaoRotulo: 'Paginação dos lançamentos',
  paginaDe: (atual: number, total: number) => `Página ${atual} de ${total}`,
  lancarNovo: 'Lançar',
  avisoErroDeLeitura:
    'Não conseguimos carregar uma parte desta tela. Atualize a página para tentar de novo.',
} as const

export const TIPOS_DE_CONTA: Record<string, string> = {
  corrente: 'Conta corrente',
  beneficio: 'Benefício',
  cartao: 'Cartão',
  investimento: 'Investimento',
}

export const VAZIO_INICIAL = {
  titulo: 'Tudo pronto para começar',
  descricao:
    'Seus lançamentos vão aparecer aqui. Comece registrando um gasto ou uma entrada.',
  acao: 'Lançar o primeiro',
} as const

export const ERRO_INICIO = {
  titulo: 'Não foi possível abrir o início',
  descricao: 'Algo falhou ao carregar seus dados. Tente de novo.',
} as const

export const LANCAR = {
  titulo: 'Novo lançamento',
  tipoRotulo: 'Tipo',
  despesa: 'Despesa',
  receita: 'Receita',
  transferencia: 'Transferência',
  descricaoLabel: 'Descrição',
  descricaoPlaceholder: 'Ex.: Mercado',
  valorLabel: 'Valor',
  valorPlaceholder: '0,00',
  valorApoio: 'Digite o valor sem sinal. O tipo define se entra ou sai.',
  dataLabel: 'Data',
  contaLabel: 'Conta',
  contaOrigemLabel: 'Conta de origem',
  contaDestinoLabel: 'Conta de destino',
  contaPlaceholder: 'Escolha a conta',
  contaDestinoPlaceholder: 'Escolha a conta que recebe',
  categoriaLabel: 'Categoria',
  categoriaOpcional: '(opcional)',
  categoriaPlaceholder: 'Sem categoria',
  semCategoria: 'Sem categoria',
  parcelasLabel: 'Parcelas',
  parcelasPlaceholder: '1x (à vista)',
  statusRotuloDespesa: 'Já foi paga',
  statusRotuloReceita: 'Já foi recebida',
  statusRotuloTransferencia: 'Transferência concluída',
  dataPagamentoLabelDespesa: 'Data do pagamento',
  dataPagamentoLabelReceita: 'Data do recebimento',
  dataPagamentoLabelTransferencia: 'Data da transferência',
  vaiParaFatura: (mes: string) => `Esta compra vai para a fatura de ${mes}`,
  modoSimples: 'Lançamento único',
  modoLote: 'Lançamento em lote',
  adicionarItem: 'Adicionar lançamento',
  removerItem: 'Remover',
  itensNoLote: (qtd: number) => `${qtd} lançamento${qtd > 1 ? 's' : ''} no lote`,
  enviar: 'Salvar lançamento',
  enviarLote: (qtd: number) => `Salvar ${qtd} lançamento${qtd > 1 ? 's' : ''}`,
  enviando: 'Salvando…',
  cancelar: 'Cancelar',
  semContasTitulo: 'Você ainda não tem uma conta',
  semContasDescricao:
    'Todo lançamento precisa de uma conta. Cadastre uma conta antes de lançar.',
  voltarAoInicio: 'Voltar ao início',
  erroDeLeitura: 'Não foi possível carregar suas contas. Atualize a página.',
  maisDetalhes: 'Mais detalhes',
  ehBeneficioLabel: 'Pago com benefício (VR/VA)',
  ehFutilLabel: 'Gasto fútil (compra por impulso)',
  rotuloDoFutilLabel: 'O que motivou ou qual foi o item? (opcional)',
  rotuloDoFutilPlaceholder: 'Ex.: Delivery por preguiça, doce, roupa extra',
} as const
