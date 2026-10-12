/**
 * Copy do onboarding da família, em português do Brasil.
 *
 * Termo canônico: "casa" para a família no texto de UI (é como o casal fala
 * do próprio arranjo) e "código de convite" para o código de 6 caracteres —
 * nunca "código de família" nem "convite" sozinho.
 *
 * Mensagem de erro não vive aqui: vem do `ResultadoAction.erro` das actions,
 * já em pt-BR ("Você já faz parte de uma família", "Código de convite não
 * encontrado", "Esta família já está completa").
 */

export const ONBOARDING = {
  titulo: 'Bem-vindo',
  subtitulo:
    'Para começar, crie a casa de vocês ou entre na casa que seu par já criou.',
  abaCriar: 'Criar a casa',
  abaEntrar: 'Entrar com código',
} as const

export const CRIAR_CASA = {
  titulo: 'Criar a casa',
  descricao: 'Você poderá convidar seu par logo depois.',

  nomeDaCasaLabel: 'Nome da casa',
  nomeDaCasaPlaceholder: 'Nossa casa',

  seuNomeLabel: 'Seu nome',
  seuNomePlaceholder: 'Como seu par te chama',

  regraLabel: 'Como dividir as contas',
  regraIgual: 'Meio a meio',
  regraIgualApoio: 'Cada um paga metade de cada gasto compartilhado.',
  regraProporcional: 'Pela renda de cada um',
  regraProporcionalApoio:
    'Quem ganha mais paga uma parte maior. Precisa informar a renda.',

  rendaLabel: 'Sua renda por mês',
  rendaPlaceholder: 'R$ 0,00',
  rendaApoioOpcional: 'Opcional na divisão meio a meio.',
  rendaApoioObrigatorio: 'Necessária para dividir pela renda.',

  enviar: 'Criar a casa',
  enviando: 'Criando…',
} as const

export const ENTRAR_CASA = {
  titulo: 'Entrar com código',
  descricao: 'Peça a seu par o código de convite que apareceu na tela dele.',

  codigoLabel: 'Código de convite',
  codigoPlaceholder: 'ABC234',
  codigoApoio: '6 letras ou números.',

  seuNomeLabel: 'Seu nome',
  seuNomePlaceholder: 'Como seu par te chama',

  rendaLabel: 'Sua renda por mês',
  rendaApoio: 'Só é usada se a casa dividir as contas pela renda.',

  enviar: 'Entrar na casa',
  enviando: 'Entrando…',

  previaEncontrada: 'Casa encontrada:',
  previaSemVaga: 'Esta casa já está completa.',
  previaNaoEncontrada: 'Não encontramos nenhuma casa com esse código.',
} as const

export const CASA_CRIADA = {
  titulo: 'Casa criada',
  descricao: 'Mande este código para seu par entrar na mesma casa:',
  rotuloDoCodigo: 'Código de convite',
  continuar: 'Continuar',
} as const
