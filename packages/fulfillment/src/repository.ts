import type {
  BaselineRecord,
  BenchmarkRecord,
  EventRecord,
  GroupBuyRecord,
  ParticipantRecord,
  Region,
} from "./types"

/**
 * Persistence port for Task 4. The backend owns the database and should
 * implement this against its migrations. `schema/task4.sql` is the column contract.
 * Raw QR tokens belong in CheckInTokenStore, not on the participant row.
 */
export interface FulfillmentRepository {
  getGroupBuy(id: string): Promise<GroupBuyRecord | null>
  saveGroupBuy(groupBuy: GroupBuyRecord): Promise<void>
  listParticipants(groupBuyId: string): Promise<ParticipantRecord[]>
  getParticipant(id: string): Promise<ParticipantRecord | null>
  saveParticipant(participant: ParticipantRecord): Promise<void>
  findParticipantByTokenHash(groupBuyId: string, tokenHash: string): Promise<ParticipantRecord | null>
  listEvents(groupBuyId: string): Promise<EventRecord[]>
  appendEvent(event: EventRecord): Promise<void>
  getFreshBenchmark(produceType: string, region: Region, now: Date): Promise<BenchmarkRecord | null>
  getLatestBenchmark(produceType: string, region: Region): Promise<BenchmarkRecord | null>
  saveBenchmark(record: BenchmarkRecord): Promise<void>
  getBaseline(produceType: string, region: Region): Promise<BaselineRecord | null>
  saveBaseline(record: BaselineRecord): Promise<void>
}

export interface CheckInTokenStore {
  save(participantId: string, token: string): Promise<void>
  get(participantId: string): Promise<string | null>
}
