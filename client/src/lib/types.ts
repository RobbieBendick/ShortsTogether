export type Role = 'watcher' | 'bridge'

export type Member = {
  clientId: string
  name: string
  role: Role
}

export type RoomState = {
  type: 'room-state'
  roomId: string
  videoId: string | null
  feedOwnerId: string | null
  members: Member[]
  bridges: Member[]
  historyLength: number
  updatedAt: number
  viewers: number
}
