import JSZip from "jszip"

const paragraphRegex = /<w:p\b[\s\S]*?<\/w:p>/g
const textNodeRegex = /<w:t\b[^>]*>[\s\S]*?<\/w:t>/g
const textInnerRegex = /(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function normalizeParagraphText(value: string) {
  return value.replace(/\r/g, "").replace(/\n+/g, " ").replace(/\s+/g, " ").trim()
}

function splitRewrittenParagraphs(value: string) {
  return value
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((item) => normalizeParagraphText(item))
    .filter((item) => item.length > 0)
}

function extractParagraphText(paragraphXml: string) {
  const values: string[] = []
  paragraphXml.replace(textNodeRegex, (node) => {
    const matched = node.match(textInnerRegex)
    if (!matched) return node
    values.push(decodeXml(matched[2]))
    return node
  })
  return normalizeParagraphText(values.join(""))
}

function replaceParagraphText(paragraphXml: string, nextText: string) {
  const escaped = escapeXml(nextText)
  let injected = false

  return paragraphXml.replace(textNodeRegex, (node) => {
    const matched = node.match(textInnerRegex)
    if (!matched) return node
    if (!injected) {
      injected = true
      return `${matched[1]}${escaped}${matched[3]}`
    }
    return `${matched[1]}${matched[3]}`
  })
}

export async function buildDocxWithPreservedLayout(input: {
  sourceDocxBuffer: Buffer
  rewrittenText: string
}) {
  const zip = await JSZip.loadAsync(input.sourceDocxBuffer)
  const documentXmlFile = zip.file("word/document.xml")
  if (!documentXmlFile) {
    throw new Error("word/document.xml not found in source docx")
  }

  const originalXml = await documentXmlFile.async("string")
  const rewrittenParagraphs = splitRewrittenParagraphs(input.rewrittenText)
  let rewriteCursor = 0

  const nextXml = originalXml.replace(paragraphRegex, (paragraphXml) => {
    const originalText = extractParagraphText(paragraphXml)
    if (!originalText) return paragraphXml

    const replacement = rewrittenParagraphs[rewriteCursor] || originalText
    rewriteCursor += 1
    return replaceParagraphText(paragraphXml, replacement)
  })

  zip.file("word/document.xml", nextXml)
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  })
}
