const DESKTOP = { width: 1440, height: 900 };

const coreRoutePairs = [
  { name: "ai-search", originalPath: "/en/AI-search", currentPath: "/zh/AI-search" },
  { name: "reduce-repeat", originalPath: "/en/rewrite?mode=similarity", currentPath: "/zh/reduce-repeat" },
  { name: "reduce-ai", originalPath: "/en/rewrite?mode=deai", currentPath: "/zh/reduce-ai" },
  { name: "detect", originalPath: "/en/aigc-detection", currentPath: "/zh/detect" },
  { name: "literature", originalPath: "/en/literature-review", currentPath: "/zh/literature" },
  { name: "proposal", originalPath: "/en/kaiti", currentPath: "/zh/proposal" },
  { name: "article", originalPath: "/en/thesis", currentPath: "/zh/article" },
  { name: "format", originalPath: "/en/format", currentPath: "/zh/format" },
  { name: "editor", originalPath: "/en/chat", currentPath: "/zh/editor" },
  { name: "ppt", originalPath: "/en/ppt", currentPath: "/zh/ppt" },
  { name: "review", originalPath: "/en/review", currentPath: "/zh/review" },
  { name: "assets", originalPath: "/en/project-assets", currentPath: "/zh/assets" },
];

/**
 * @param {"original" | "current"} target
 */
export function buildCoreScreenshotPages(target) {
  const useOriginal = target === "original";
  return coreRoutePairs.map((route) => ({
    name: `${route.name}-desktop`,
    path: useOriginal ? route.originalPath : route.currentPath,
    viewport: DESKTOP,
    fullPage: false,
  }));
}
