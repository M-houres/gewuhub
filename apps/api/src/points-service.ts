import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 扣费逻辑
export async function deductPoints(userId: string, points: number, reason: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.points < points) {
    throw new Error("积分不足");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { points: { decrement: points } },
    }),
    prisma.pointRecord.create({
      data: { userId, change: -points, reason },
    }),
  ]);
}

// 充值逻辑
export async function addPoints(userId: string, points: number, reason: string) {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { points: { increment: points } },
    }),
    prisma.pointRecord.create({
      data: { userId, change: points, reason },
    }),
  ]);
}

// 套餐购买
export async function purchasePlan(userId: string, planId: string) {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error("套餐不存在");

  const order = await prisma.order.create({
    data: {
      userId,
      planName: plan.name,
      amount: plan.price,
      status: "pending",
      tradeNo: `T${Date.now()}${Math.random().toString(36).slice(2, 9)}`,
    },
  });

  return order;
}
