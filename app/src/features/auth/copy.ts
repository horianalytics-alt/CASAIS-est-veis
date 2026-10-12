/**
 * Copy das telas de autenticação, em português do Brasil.
 *
 * Termo canônico: "Entrar" para iniciar sessão (nunca Login/Acessar) e
 * "Criar conta" para registro (nunca Cadastrar-se/Registrar).
 *
 * Mensagem de erro de validação e de falha de login NÃO vive aqui: vem do
 * `ResultadoAction.erro` / `camposComErro` das Server Actions, já em pt-BR.
 */

export const LOGIN = {
  titulo: 'Entrar',
  // O subtítulo diz de quem é o app, porque é a primeira tela que abre.
  subtitulo: 'Controle as contas da casa com quem mora com você.',
  emailLabel: 'E-mail',
  emailPlaceholder: 'voce@email.com',
  senhaLabel: 'Senha',
  enviar: 'Entrar',
  enviando: 'Entrando…',
  semConta: 'Ainda não tem conta?',
  irParaCadastro: 'Criar conta',
  esqueciSenha: 'Esqueci minha senha',
} as const

export const CADASTRO = {
  titulo: 'Criar conta',
  subtitulo: 'Em seguida você cria a casa ou entra na casa do seu par.',
  emailLabel: 'E-mail',
  emailPlaceholder: 'voce@email.com',
  senhaLabel: 'Senha',
  senhaApoio: 'Pelo menos 8 caracteres.',
  confirmacaoLabel: 'Repita a senha',
  enviar: 'Criar conta',
  enviando: 'Criando conta…',
  temConta: 'Já tem conta?',
  irParaLogin: 'Entrar',
  // Caminho real quando a confirmação de e-mail está ligada no Supabase:
  // signUp não devolve sessão, então NÃO navegamos para o onboarding.
  confirmeTitulo: 'Confira seu e-mail',
  confirmeDescricao:
    'Enviamos um link de confirmação. Abra o link e depois volte para entrar.',
} as const
