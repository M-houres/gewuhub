export type AdminAuditEntry = {
  id: string
  actor: string
  action: string
  targetType: string
  targetId?: string
  summary: string
  detail?: Record<string, unknown>
  createdAt: string
}

const adminAuditEntries: AdminAuditEntry[] = []

function makeAuditId() {
  return `admlog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function appendAdminAudit(input: Omit<AdminAuditEntry, "id" | "createdAt">) {
  const entry: AdminAuditEntry = {
    id: makeAuditId(),
    createdAt: new Date().toISOString(),
    ...input,
  }

  adminAuditEntries.unshift(entry)
  if (adminAuditEntries.length > 2000) {
    adminAuditEntries.splice(2000)
  }
  return entry
}

export function listAdminAudit(limit = 100) {
  const normalizedLimit = Math.max(1, Math.floor(limit))
  return adminAuditEntries.slice(0, normalizedLimit)
}
