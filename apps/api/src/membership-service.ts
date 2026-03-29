import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const membershipTiers = {
  free: { name: "免费版", monthlyQuota: 10, discount: 0 },
  basic: { name: "基础版", monthlyQuota: 100, discount: 0.1, price: 29 },
  pro: { name: "专业版", monthlyQuota: 500, discount: 0.2, price: 99 },
  enterprise: { name: "企业版", monthlyQuota: 9999, discount: 0.3, price: 299 },
};

export async function upgradeMembership(userId: string, tier: string) {
  const config = membershipTiers[tier as keyof typeof membershipTiers];

  await prisma.user.update({
    where: { id: userId },
    data: {
      // 添加会员字段到User表
      // membership: tier,
      // membershipExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    },
  });
}
