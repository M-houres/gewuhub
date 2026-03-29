import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function createBatchTask(params: {
  userId: string;
  files: Array<{ name: string; content: string }>;
  taskType: string;
  platform: string;
  mode: string;
}) {
  const tasks = await prisma.$transaction(
    params.files.map(file =>
      prisma.task.create({
        data: {
          userId: params.userId,
          type: params.taskType,
          status: "queued",
          payload: {
            fileName: file.name,
            content: file.content,
            platform: params.platform,
            mode: params.mode,
          },
          pointsCost: 10,
        },
      })
    )
  );

  return { batchId: `B${Date.now()}`, taskIds: tasks.map(t => t.id) };
}

export async function getBatchStatus(taskIds: string[]) {
  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    select: { id: true, status: true, result: true },
  });

  const completed = tasks.filter(t => t.status === "completed").length;
  const total = tasks.length;

  return { completed, total, progress: (completed / total) * 100, tasks };
}
