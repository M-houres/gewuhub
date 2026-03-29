import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function createPromotion(data: {
  name: string;
  discount: number;
  startTime: Date;
  endTime: Date;
  planIds: string[];
}) {
  // 创建促销活动
  return { id: `promo_${Date.now()}`, ...data };
}

export async function getActivePromotions() {
  const now = new Date();
  // 返回当前有效的促销
  return [];
}

export async function applyPromotion(orderId: string, promoCode: string) {
  // 应用优惠码
  return { discount: 0.2 };
}
