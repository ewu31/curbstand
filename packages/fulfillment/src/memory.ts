import type {
  BaselineRecord,
  BenchmarkRecord,
  EventRecord,
  GroupBuyRecord,
  ParticipantRecord,
  Region,
} from "./types"
import { safeEqual } from "./hash"
import type { CheckInTokenStore, FulfillmentRepository } from "./repository"

function clone<T>(value: T): T {
  return structuredClone(value)
}

export class MemoryFulfillmentRepository implements FulfillmentRepository {
  private groupBuys = new Map<string, GroupBuyRecord>()
  private participants = new Map<string, ParticipantRecord>()
  private events: EventRecord[] = []
  private benchmarks: BenchmarkRecord[] = []
  private baselines = new Map<string, BaselineRecord>()

  clear(): void {
    this.groupBuys.clear()
    this.participants.clear()
    this.events = []
    this.benchmarks = []
    this.baselines.clear()
  }

  async getGroupBuy(id: string): Promise<GroupBuyRecord | null> {
    const groupBuy = this.groupBuys.get(id)
    return groupBuy ? clone(groupBuy) : null
  }

  async saveGroupBuy(groupBuy: GroupBuyRecord): Promise<void> {
    this.groupBuys.set(groupBuy.id, clone(groupBuy))
  }

  async listParticipants(groupBuyId: string): Promise<ParticipantRecord[]> {
    return [...this.participants.values()]
      .filter((participant) => participant.groupBuyId === groupBuyId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
      .map((participant) => clone(participant))
  }

  async getParticipant(id: string): Promise<ParticipantRecord | null> {
    const participant = this.participants.get(id)
    return participant ? clone(participant) : null
  }

  async saveParticipant(participant: ParticipantRecord): Promise<void> {
    this.participants.set(participant.id, clone(participant))
  }

  async findParticipantByTokenHash(groupBuyId: string, tokenHash: string): Promise<ParticipantRecord | null> {
    const participant = [...this.participants.values()].find(
      (candidate) =>
        candidate.groupBuyId === groupBuyId &&
        candidate.checkInTokenHash !== null &&
        safeEqual(candidate.checkInTokenHash, tokenHash),
    )
    return participant ? clone(participant) : null
  }

  async listEvents(groupBuyId: string): Promise<EventRecord[]> {
    return this.events
      .filter((event) => event.groupBuyId === groupBuyId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
      .map((event) => clone(event))
  }

  async appendEvent(event: EventRecord): Promise<void> {
    this.events.push(clone(event))
  }

  async getFreshBenchmark(produceType: string, region: Region, now: Date): Promise<BenchmarkRecord | null> {
    const fresh = this.benchmarks
      .filter(
        (record) =>
          record.produceType === produceType &&
          record.region === region &&
          new Date(record.expiresAt).getTime() > now.getTime(),
      )
      .sort((left, right) => right.retrievedAt.localeCompare(left.retrievedAt))
    return fresh[0] ? clone(fresh[0]) : null
  }

  async getLatestBenchmark(produceType: string, region: Region): Promise<BenchmarkRecord | null> {
    const latest = this.benchmarks
      .filter((record) => record.produceType === produceType && record.region === region)
      .sort((left, right) => right.retrievedAt.localeCompare(left.retrievedAt))
    return latest[0] ? clone(latest[0]) : null
  }

  async saveBenchmark(record: BenchmarkRecord): Promise<void> {
    this.benchmarks.push(clone(record))
  }

  async getBaseline(produceType: string, region: Region): Promise<BaselineRecord | null> {
    const baseline = this.baselines.get(`${produceType}|${region}`)
    return baseline ? clone(baseline) : null
  }

  async saveBaseline(record: BaselineRecord): Promise<void> {
    this.baselines.set(`${record.produceType}|${record.region}`, clone(record))
  }
}

export class MemoryTokenStore implements CheckInTokenStore {
  private tokens = new Map<string, string>()

  async save(participantId: string, token: string): Promise<void> {
    this.tokens.set(participantId, token)
  }

  async get(participantId: string): Promise<string | null> {
    return this.tokens.get(participantId) ?? null
  }

  clear(): void {
    this.tokens.clear()
  }
}
