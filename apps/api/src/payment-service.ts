import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function createPaymentOrder(data: {
  userId: string;
  planName: string;
  amount: number;
  payMethod: string;
}) {
  return prisma.order.create({
    data: {
      userId: data.userId,
      planName: data.planName,
      amount: data.amount,
      payMethod: data.payMethod,
      status: "pending",
      tradeNo: `T${Date.now()}${Math.random().toString(36).slice(2, 9)}`,
    },
  });
}

export async function handlePaymentCallback(tradeNo: string, status: string) {
  const order = await prisma.order.findUnique({ where: { tradeNo } });
  if (!order || order.status !== "pending") return;

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status, paidAt: new Date() },
    });

    if (status === "paid") {
      const plan = await tx.plan.findFirst({ where: { name: order.planName } });
      if (plan) {
        await tx.user.update({
          where: { id: order.userId },
          data: { points: { increment: plan.quota } },
        });

        await tx.pointRecord.create({
          data: {
            userId: order.userId,
            change: plan.quota,
            reason: `充值-${order.planName}`,
          },
        });
      }
    }
  });
}
