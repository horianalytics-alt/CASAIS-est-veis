/**
 * Copy de UI compartilhada, em português do Brasil.
 *
 * Termos canônicos do projeto — a mesma coisa tem UM nome em todas as telas:
 *   iniciar sessão .......... "Entrar"        (nunca Login/Acessar)
 *   encerrar sessão ......... "Sair"          (nunca Logout/Deslogar)
 *   criar conta de usuário .. "Criar conta"   (nunca Cadastrar-se/Registrar)
 *   conta bancária/cartão ... "conta"
 *   lançamento .............. "lançamento"    (nunca transação/movimento)
 *   código da família ....... "código de convite"
 *
 * Mensagem de erro vinda de Server Action NÃO é duplicada aqui: o
 * `ResultadoAction.erro` já chega em pt-BR e sem vazar texto cru do Postgres.
 * Este módulo só tem copy que nasce na tela.
 */

export const APP = {
  nome: 'Finanças a Dois',
  descricao: 'Controle de contas, faturas e acerto do mês para o casal.',
} as const

export const ACOES = {
  entrar: 'Entrar',
  entrando: 'Entrando…',
  sair: 'Sair',
  criarConta: 'Criar conta',
  criandoConta: 'Criando conta…',
  salvar: 'Salvar',
  salvando: 'Salvando…',
  cancelar: 'Cancelar',
  excluir: 'Excluir',
  tentarDeNovo: 'Tentar de novo',
  voltar: 'Voltar',
} as const

export const ERROS_GENERICOS = {
  // Usada quando algo falha sem que a action tenha devolvido mensagem.
  inesperado: 'Não foi possível concluir. Tente de novo em instantes.',
  tituloDeFalha: 'Algo deu errado',
} as const

export const CARREGANDO = {
  rotulo: 'Carregando…',
} as const
