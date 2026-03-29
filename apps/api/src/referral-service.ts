import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function handleReferral(inviteCode: string, newUserId: string) {
  const inviter = await prisma.user.findUnique({ where: { inviteCode } });
  if (!inviter) return;

  const config = await getPromotionConfig();
  const rewardPoints = config.referralReward || 100;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: newUserId },
      data: { invitedBy: inviter.id },
    });

    await tx.referral.create({
      data: {
        userId: inviter.id,
        referredUserId: newUserId,
        rewardPoints,
        status: "pending",
      },
    });
  });
}

export async function completeReferral(referralId: string) {
  const referral = await prisma.referral.findUnique({ where: { id: referralId } });
  if (!referral || referral.status !== "pending") return;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: referral.userId },
      data: { agentPoints: { increment: referral.rewardPoints } },
    });

    await tx.referral.update({
      where: { id: referralId },
      data: { status: "completed" },
    });

    await tx.pointRecord.create({
      data: {
        userId: referral.userId,
        change: referral.rewardPoints,
        reason: "推广奖励",
      },
    });
  });
}

async function getPromotionConfig() {
  const config = await prisma.promotionConfig.findUnique({ where: { key: "referral" } });
  return config?.value as any || { referralReward: 100 };
}
