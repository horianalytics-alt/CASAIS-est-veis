'use client'

// 'use client' porque guarda estado (useState), lê localStorage e expõe
// contexto. É folha de infraestrutura: as páginas continuam Server Components
// e só os componentes que exibem valor consomem o hook.

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const CHAVE = 'fad.ocultarValores'

interface OcultarValoresContexto {
  oculto: boolean
  alternar: () => void
}

const Contexto = createContext<OcultarValoresContexto | null>(null)

export function OcultarValoresProvider({
  children,
}: {
  children: React.ReactNode
}) {
  // Começa SEMPRE em false, igual ao servidor. Ler localStorage na inicial
  // daria divergência de hidratação (o servidor não tem localStorage).
  const [oculto, setOculto] = useState(false)

  // Só depois de montar aplicamos a preferência salva. Como o valor já está
  // pintado, a troca é imperceptível e não há mismatch.
  useEffect(() => {
    try {
      if (localStorage.getItem(CHAVE) === '1') setOculto(true)
    } catch {
      /* janela privada ou storage bloqueado: segue visível. */
    }
  }, [])

  const alternar = useCallback(() => {
    setOculto((atual) => {
      const proximo = !atual
      try {
        localStorage.setItem(CHAVE, proximo ? '1' : '0')
      } catch {
        /* não poder lembrar a escolha não impede de aplicá-la agora. */
      }
      return proximo
    })
  }, [])

  return (
    <Contexto.Provider value={{ oculto, alternar }}>
      {children}
    </Contexto.Provider>
  )
}

/**
 * Fora do provider devolve `oculto: false` em vez de lançar: um componente de
 * valor renderizado isolado (teste, storybook) deve mostrar o número, não
 * quebrar a árvore.
 */
export function useOcultarValores(): OcultarValoresContexto {
  return useContext(Contexto) ?? { oculto: false, alternar: () => {} }
}
