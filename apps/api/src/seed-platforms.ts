import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedPlatforms() {
  await prisma.platform.createMany({
    data: [
      { code: "cnki", name: "知网", enabled: true, sortOrder: 1, taskTypes: ["detect", "rewrite_reduce_repeat", "rewrite_reduce_ai"] },
      { code: "weipu", name: "维普", enabled: true, sortOrder: 2, taskTypes: ["detect", "rewrite_reduce_repeat"] },
      { code: "paperpass", name: "PaperPass", enabled: false, sortOrder: 3, taskTypes: ["detect", "rewrite_reduce_repeat"] },
      { code: "turnitin", name: "Turnitin", enabled: false, sortOrder: 4, taskTypes: ["detect"] },
    ],
    skipDuplicates: true,
  });
  console.log("✅ 平台初始化完成");
}

seedPlatforms().catch(console.error).finally(() => prisma.$disconnect());
