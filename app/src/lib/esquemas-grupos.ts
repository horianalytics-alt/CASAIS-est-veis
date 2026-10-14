import { z } from 'zod'
import { LIMITE_CARACTERES, limparNome } from '@/lib/lista-nomes'

/**
 * Esquemas Zod das actions de grupos de categoria (src/actions/grupos-categoria.ts).
 * Fora do arquivo de action porque um módulo 'use server' só pode exportar
 * funções assíncronas — e porque assim são testáveis sem servidor.
 *
 * Mesmas mensagens e mesmo limite de nome (LIMITE_CARACTERES, 40) das
 * categorias: a tela de Ajustes usa um vocabulário só.
 */

const id = z.string({ required_error: 'Item inválido.' }).uuid('Item inválido.')

const nomeDeGrupo = z
  .string({ required_error: 'Informe o nome.' })
  .transform(limparNome)
  .pipe(
    z
      .string()
      .min(1, 'Informe o nome.')
      .max(LIMITE_CARACTERES, `Use no máximo ${LIMITE_CARACTERES} caracteres.`),
  )

export const esquemaAdicionarGrupo = z.object({ nome: nomeDeGrupo })
export const esquemaRenomearGrupo = z.object({ id, nome: nomeDeGrupo })
export const esquemaExcluirGrupo = z.object({ id })

/**
 * `grupoId: null` = tirar a categoria de qualquer grupo. É null EXPLÍCITO:
 * campo ausente é recusado, para que um formulário quebrado não desvincule
 * a categoria sem querer.
 */
export const esquemaAtribuirGrupo = z.object({
  categoriaId: id,
  grupoId: z
    .string({ required_error: 'Escolha um grupo ou "nenhum".', invalid_type_error: 'Escolha um grupo ou "nenhum".' })
    .uuid('Escolha um grupo ou "nenhum".')
    .nullable(),
})
