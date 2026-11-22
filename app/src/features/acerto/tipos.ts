export interface RegistroAcerto {
  id: string
  date: string
  amount: number
  pagadorId: string      // paid_by_member_id
  pagadorNome: string
  receptorId: string     // settlement_to_member_id
  receptorNome: string
}
