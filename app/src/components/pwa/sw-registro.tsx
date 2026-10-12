'use client'

import { useEffect } from 'react'

export function SwRegistro() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
          // Registro opcional não deve quebrar execução
        })
      })
    }
  }, [])

  return null
}
