const MONTHS_SHORT = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
] as const

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function formatBRL(value: number, hideValues = false): string {
  if (hideValues) return 'R$ ••••'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function parseBRLInput(input: string): number {
  const stripped = input.replace(/[^\d.,-]/g, '')
  if (stripped === '') return NaN

  const lastComma = stripped.lastIndexOf(',')
  const lastDot = stripped.lastIndexOf('.')

  // O separador decimal é o último a aparecer; os outros são de milhar.
  let normalized: string
  if (lastComma > lastDot) {
    normalized = stripped.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > lastComma) {
    normalized = stripped.replace(/,/g, '')
  } else {
    normalized = stripped
  }

  const parsed = Number(normalized)
  return Number.isNaN(parsed) ? NaN : parsed
}

export function todayISO(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayBR(): string {
  return isoToBR(todayISO())
}

export function isoToBR(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

export function brToISO(br: string): string {
  const [day, month, year] = br.split('/')
  return `${year}-${month}-${day}`
}

function daysInMonth(year: number, month1to12: number): number {
  // Dia 0 do mês seguinte é o último dia deste mês.
  return new Date(year, month1to12, 0).getDate()
}

export function daysInMonthISO(iso: string): number {
  const match = ISO_DATE_RE.exec(iso)
  if (!match) return NaN
  return daysInMonth(Number(match[1]), Number(match[2]))
}

export function isValidISODate(iso: string): boolean {
  const match = ISO_DATE_RE.exec(iso)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (month < 1 || month > 12) return false
  if (day < 1 || day > daysInMonth(year, month)) return false
  return true
}

export function addMonthsISO(iso: string, months: number): string {
  const match = ISO_DATE_RE.exec(iso)
  if (!match) return iso

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  const totalMonths = (year * 12) + (month - 1) + months
  const targetYear = Math.floor(totalMonths / 12)
  const targetMonth = (totalMonths % 12) + 1

  // 31/jan + 1 mês cai no último dia de fevereiro, não transborda para março.
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth))

  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
}

export function diffDaysISO(fromISO: string, toISO: string): number {
  const from = Date.UTC(
    Number(fromISO.slice(0, 4)),
    Number(fromISO.slice(5, 7)) - 1,
    Number(fromISO.slice(8, 10)),
  )
  const to = Date.UTC(
    Number(toISO.slice(0, 4)),
    Number(toISO.slice(5, 7)) - 1,
    Number(toISO.slice(8, 10)),
  )
  return Math.round((to - from) / 86_400_000)
}

export function monthKeyFromISO(iso: string): string {
  return iso.slice(0, 7)
}

export function monthLabel(iso: string): string {
  const [year, month] = iso.split('-')
  return `${MONTHS_SHORT[Number(month) - 1]}/${year}`
}
