/**
 * Copy da tela de Acerto de Contas (/acerto), em português do Brasil.
 *
 * Termos canônicos: "acerto" (nunca split ou divisão de despesas), "lançamento", "conta".
 */

export const ACERTO = {
  titulo: 'Acerto de contas',
  subtitulo: 'Quem deve para quem no mês e quitação do saldo do casal',
  tudoZerado: 'Tudo acertado!',
  tudoZeradoDescricao: 'Nenhum dos dois tem saldo pendente para acertar no momento.',
  regraIgual: 'Divisão meio a meio (50% / 50%)',
  regraProporcional: 'Divisão proporcional à renda declarada',
  regraDescricaoIgual: 'Cada um é responsável por metade de todos os gastos compartilhados.',
  regraDescricaoProporcional:
    'A divisão dos gastos compartilhados é calculada com base na renda mensal de cada um.',
  cota: 'Cota da casa',
  totalPago: 'Pago do bolso',
  cotaDevida: 'Cota devida',
  saldoLiquido: 'Saldo no acerto',
  temReceber: 'A receber',
  devePagar: 'A pagar',
  botaoAcertar: 'Registrar acerto',
  erroCarregar: 'Não foi possível calcular o acerto da casa. Tente de novo.',
} as const

export const DIALOGO_ACERTO = {
  titulo: 'Registrar acerto de contas',
  subtitulo: 'Cria uma transferência no app para liquidar a diferença entre o casal',
  devedor: 'Quem paga',
  credor: 'Quem recebe',
  valor: 'Valor a transferir',
  data: 'Data da transferência',
  botaoConfirmar: 'Registrar acerto',
  botaoCancelar: 'Cancelar',
  processando: 'Registrando acerto…',
  sucesso: 'Acerto registrado com sucesso! O saldo foi liquidado.',
  avisoTransferencia:
    'Essa ação registra uma transferência entre os parceiros e zera a diferença calculada.',
} as const
