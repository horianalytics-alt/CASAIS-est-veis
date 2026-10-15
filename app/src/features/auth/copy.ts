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

export const RECUPERAR_SENHA = {
  titulo: 'Recuperar senha',
  subtitulo: 'Informe o seu e-mail para receber um link de redefinição.',
  emailLabel: 'E-mail',
  emailPlaceholder: 'voce@email.com',
  enviar: 'Enviar link de recuperação',
  enviando: 'Enviando…',
  voltarLogin: 'Voltar para entrar',
  confirmacaoTitulo: 'Confira seu e-mail',
  confirmacaoDescricao: 'Se houver uma conta com esse e-mail, enviamos um link.',
} as const

export const NOVA_SENHA = {
  titulo: 'Definir nova senha',
  subtitulo: 'Escolha uma senha nova para proteger a sua conta.',
  senhaLabel: 'Nova senha',
  senhaApoio: 'Pelo menos 8 caracteres.',
  confirmacaoLabel: 'Repita a senha',
  enviar: 'Salvar nova senha',
  enviando: 'Salvando…',
  sucessoTitulo: 'Senha atualizada',
  sucessoDescricao: 'Sua nova senha já está valendo. Você pode continuar para o início.',
  irParaInicio: 'Ir para o início',
  irParaLogin: 'Voltar para entrar',
  pedirNovoLink: 'Pedir novo link de recuperação',
  conferindoLink: 'Conferindo o link…',
  linkInvalido: 'Esse link expirou ou é inválido. Peça a recuperação de senha de novo.',
} as const

