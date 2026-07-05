import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR && process.env.DATA_DIR.trim().length > 0
  ? process.env.DATA_DIR
  : path.join(__dirname, "..", "..", "data");
const DATA_FILE = path.join(DATA_DIR, "tickets.json");
const CLAIMS_FILE = path.join(DATA_DIR, "ticket-claims.json");

export interface TicketRecord {
  guildId: string;
  channelId: string;
  openedById: string;
  closedById: string;
  timestamp: number;
}

export interface TicketClaimRecord {
  claimedById: string;
  timestamp: number;
}

type ClaimsMap = Record<string, TicketClaimRecord>;

function ensureClaimsFile(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(CLAIMS_FILE)) {
    fs.writeFileSync(CLAIMS_FILE, "{}", "utf-8");
  }
}

function readClaims(): ClaimsMap {
  ensureClaimsFile();
  try {
    const raw = fs.readFileSync(CLAIMS_FILE, "utf-8");
    return JSON.parse(raw) as ClaimsMap;
  } catch {
    return {};
  }
}

function writeClaims(claims: ClaimsMap): void {
  ensureClaimsFile();
  fs.writeFileSync(CLAIMS_FILE, JSON.stringify(claims, null, 2), "utf-8");
}

/**
 * Bir ticket kanalını belirli bir kullanıcıya sahiplendirir.
 * Kanal zaten sahiplenilmişse (ve farklı biri tarafından) false döner ve hiçbir şey değiştirmez.
 */
export function claimTicket(channelId: string, claimedById: string): boolean {
  const claims = readClaims();
  const existing = claims[channelId];
  if (existing && existing.claimedById !== claimedById) {
    return false;
  }
  claims[channelId] = { claimedById, timestamp: Date.now() };
  writeClaims(claims);
  return true;
}

export function getTicketClaim(channelId: string): TicketClaimRecord | undefined {
  const claims = readClaims();
  return claims[channelId];
}

export function removeTicketClaim(channelId: string): void {
  const claims = readClaims();
  if (claims[channelId]) {
    delete claims[channelId];
    writeClaims(claims);
  }
}

function ensureDataFile(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]", "utf-8");
  }
}

function readAll(): TicketRecord[] {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw) as TicketRecord[];
  } catch {
    return [];
  }
}

function writeAll(records: TicketRecord[]): void {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2), "utf-8");
}

export function addTicketClose(record: TicketRecord): void {
  const records = readAll();
  records.push(record);
  writeAll(records);
}

export function getTicketCounts(guildId: string): { byId: string; count: number }[] {
  const records = readAll().filter((r) => r.guildId === guildId);
  const counts = new Map<string, number>();
  for (const r of records) {
    counts.set(r.closedById, (counts.get(r.closedById) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([byId, count]) => ({ byId, count }))
    .sort((a, b) => b.count - a.count);
}

export function clearTickets(guildId: string): number {
  const records = readAll();
  const remaining = records.filter((r) => r.guildId !== guildId);
  const removedCount = records.length - remaining.length;
  writeAll(remaining);
  return removedCount;
}
