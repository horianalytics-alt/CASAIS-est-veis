/**
 * Utilitário seguro para feedback tátil (haptic feedback / vibração) em dispositivos móveis.
 * Só executa no navegador se o dispositivo suportar `navigator.vibrate`.
 * Em desktops ou navegadores sem suporte, falha silenciosamente sem gerar erros.
 */
export const hapticFeedback = {
  /** Micro-toque imperceptível para navegação entre abas e seleção rápida (8ms) */
  selection: () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate?.(8)
      } catch {
        // Silencioso se não suportado
      }
    }
  },

  /** Toque suave para alternar botões de estado (ex: modo privacidade, checkboxes) (15ms) */
  light: () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate?.(15)
      } catch {
        // Silencioso se não suportado
      }
    }
  },

  /** Toque médio para confirmações de ações (ex: arrastar swipe até o gatilho, abrir modal) (25ms) */
  medium: () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate?.(25)
      } catch {
        // Silencioso se não suportado
      }
    }
  },

  /** Padrão de sucesso duplo para salvamento ou quitação de acerto ([15, 60, 20]ms) */
  success: () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate?.([15, 60, 20])
      } catch {
        // Silencioso se não suportado
      }
    }
  },

  /** Padrão de aviso/atenção para exclusões ou limites estourados ([30, 40, 30]ms) */
  warning: () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate?.([30, 40, 30])
      } catch {
        // Silencioso se não suportado
      }
    }
  },
}
