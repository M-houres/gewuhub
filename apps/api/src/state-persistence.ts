import { PrismaClient } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";

import type { StoreSnapshot } from "./store";

const SNAPSHOT_TABLE_NAME = "app_state_snapshot";
const SNAPSHOT_KEY = "main";
const SNAPSHOT_VERSION = 1;

type PersistedSnapshotEnvelope = {
  version: number;
  savedAt: string;
  snapshot: StoreSnapshot;
};

export type StoreStatePersistence = {
  enabled: boolean;
  init: () => Promise<void>;
  loadSnapshot: () => Promise<StoreSnapshot | null>;
  saveSnapshot: (snapshot: StoreSnapshot) => Promise<void>;
  disconnect: () => Promise<void>;
};

function parsePersistedSnapshot(value: unknown): PersistedSnapshotEnvelope | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<PersistedSnapshotEnvelope>;
  if (record.version !== SNAPSHOT_VERSION) {
    return null;
  }

  if (!record.snapshot || typeof record.snapshot !== "object") {
    return null;
  }

  return {
    version: record.version,
    savedAt: typeof record.savedAt === "string" ? record.savedAt : new Date().toISOString(),
    snapshot: record.snapshot as StoreSnapshot,
  };
}

export function createStoreStatePersistence(input: {
  databaseUrl?: string;
  logger: FastifyBaseLogger;
}): StoreStatePersistence {
  const databaseUrl = input.databaseUrl?.trim();
  if (!databaseUrl) {
    return {
      enabled: false,
      async init() {
        input.logger.warn("DATABASE_URL missing, state persistence is disabled and API falls back to in-memory store.");
      },
      async loadSnapshot() {
        return null;
      },
      async saveSnapshot() {},
      async disconnect() {},
    };
  }

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  let initialized = false;

  return {
    enabled: true,

    async init() {
      if (initialized) return;
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS ${SNAPSHOT_TABLE_NAME} (
          state_key TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      initialized = true;
    },

    async loadSnapshot() {
      if (!initialized) {
        await this.init();
      }

      const rows = await prisma.$queryRaw<Array<{ payload: unknown }>>`
        SELECT payload
        FROM app_state_snapshot
        WHERE state_key = ${SNAPSHOT_KEY}
        LIMIT 1
      `;

      if (!rows[0]) {
        return null;
      }

      const envelope = parsePersistedSnapshot(rows[0].payload);
      if (!envelope) {
        input.logger.warn("Snapshot exists but version or payload is invalid; skipping hydration.");
        return null;
      }

      return envelope.snapshot;
    },

    async saveSnapshot(snapshot: StoreSnapshot) {
      if (!initialized) {
        await this.init();
      }

      const payload: PersistedSnapshotEnvelope = {
        version: SNAPSHOT_VERSION,
        savedAt: new Date().toISOString(),
        snapshot,
      };

      const payloadJson = JSON.stringify(payload);
      await prisma.$executeRaw`
        INSERT INTO app_state_snapshot (state_key, payload, updated_at)
        VALUES (${SNAPSHOT_KEY}, ${payloadJson}::jsonb, NOW())
        ON CONFLICT (state_key)
        DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
      `;
    },

    async disconnect() {
      await prisma.$disconnect();
    },
  };
}
