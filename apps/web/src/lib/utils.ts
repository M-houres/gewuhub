export function validateTaskInput(content: string, maxChars: number): string | null {
  if (!content.trim()) return "内容不能为空";
  if (content.length > maxChars) return `内容超过${maxChars}字限制`;
  return null;
}

export function formatPoints(points: number): string {
  return points.toLocaleString();
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleString('zh-CN');
}
