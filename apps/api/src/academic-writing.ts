export async function generateLiteratureReview(params: {
  topic: string;
  keywords: string[];
  wordCount: number;
}) {
  const prompt = `请撰写关于"${params.topic}"的文献综述，关键词：${params.keywords.join('、')}，字数约${params.wordCount}字。

要求：
1. 研究背景与意义
2. 国内外研究现状
3. 研究方法综述
4. 研究趋势与展望
5. 参考文献格式规范`;

  return { content: prompt, structure: "literature_review" };
}

export async function generateProposal(params: {
  title: string;
  subject: string;
  researchQuestion: string;
  wordCount: number;
}) {
  const prompt = `请撰写开题报告：${params.title}

学科：${params.subject}
研究问题：${params.researchQuestion}
字数：${params.wordCount}字

包含：
1. 选题背景与意义
2. 文献综述
3. 研究内容与方法
4. 技术路线
5. 预期成果
6. 研究计划`;

  return { content: prompt, structure: "proposal" };
}
