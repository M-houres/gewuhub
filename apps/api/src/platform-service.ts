import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const prisma = new PrismaClient();

export async function getEnabledPlatforms(taskType?: string) {
  const platforms = await prisma.platform.findMany({
    where: { enabled: true },
    orderBy: { sortOrder: "asc" },
  });

  if (!taskType) return platforms;

  return platforms.filter(p => {
    const types = p.taskTypes as string[];
    return types.includes(taskType);
  });
}

export async function getActivePlatformRule(platformCode: string, taskType: string) {
  const platform = await prisma.platform.findUnique({ where: { code: platformCode } });
  if (!platform) return null;

  return prisma.rulePackage.findFirst({
    where: { platformId: platform.id, taskType, isActive: true },
  });
}

export async function uploadRulePackage(data: {
  platformCode: string;
  taskType: string;
  rules: any;
  operator: string;
  notes?: string;
}) {
  const platform = await prisma.platform.findUnique({ where: { code: data.platformCode } });
  if (!platform) throw new Error("平台不存在");

  const hash = createHash("sha256").update(JSON.stringify(data.rules)).digest("hex");
  const version = `v${Date.now()}`;

  return prisma.rulePackage.create({
    data: {
      platformId: platform.id,
      taskType: data.taskType,
      version,
      rules: data.rules,
      hash,
      status: "draft",
      uploadedBy: data.operator,
      notes: data.notes,
    },
  });
}

export async function publishRulePackage(packageId: string, operator: string) {
  const pkg = await prisma.rulePackage.findUnique({ where: { id: packageId } });
  if (!pkg) throw new Error("规则包不存在");

  await prisma.$transaction(async (tx) => {
    await tx.rulePackage.updateMany({
      where: { platformId: pkg.platformId, taskType: pkg.taskType, isActive: true },
      data: { isActive: false, status: "archived" },
    });

    await tx.rulePackage.update({
      where: { id: packageId },
      data: { isActive: true, status: "active" },
    });

    await tx.auditLog.create({
      data: {
        action: "PUBLISH_RULE",
        entityType: "RulePackage",
        entityId: packageId,
        operator,
        details: { version: pkg.version, taskType: pkg.taskType },
      },
    });
  });
}

export async function rollbackRule(platformCode: string, taskType: string, operator: string) {
  const platform = await prisma.platform.findUnique({ where: { code: platformCode } });
  if (!platform) throw new Error("平台不存在");

  const archived = await prisma.rulePackage.findFirst({
    where: { platformId: platform.id, taskType, status: "archived" },
    orderBy: { createdAt: "desc" },
  });

  if (!archived) throw new Error("无可回滚版本");

  await publishRulePackage(archived.id, operator);
}
