// Shared by the browser and server. The full source stays local for version
// comparison and safe proposal application; only `input` goes to the model.
export const SELECTION_LIMIT = 12000;
const INPUT_LIMIT = 300000;
const bytes = text => new TextEncoder().encode(text).length;

export function collaborationInput({ filename, prompt, source, selection = '', contextScope } = {}) {
  if (typeof source !== 'string' || !source) throw new Error('此文件没有可用正文。可以交给 DSH 会话继续处理。');
  if (typeof selection !== 'string' || selection.includes('\0')) throw new Error('请选择有效的正文选区');
  if (selection && !selection.trim()) throw new Error('请选择包含正文的选区');
  if (selection.length > SELECTION_LIMIT) throw new Error('这段选区超过 ' + SELECTION_LIMIT + ' 字符上限');
  // Older clients can omit the scope. A supplied selection must never silently
  // expand into a whole-document model request.
  contextScope ??= selection ? 'selection' : 'document';
  if (!['selection', 'document'].includes(contextScope)) throw new Error('请选择 AI 处理范围');
  if (contextScope === 'selection' && !selection) throw new Error('请先选择要交给 AI 的正文');
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('请写下你希望 AI 做什么');
  prompt = prompt.trim();
  if (prompt.length > 4000 || prompt.includes('\0')) throw new Error('AI 要求超过 4000 字符或包含无效字符');
  const input = JSON.stringify({
    filename: String(filename || '文件'), prompt, contextScope,
    content: contextScope === 'selection' ? selection : source,
    // With full context, selectedText still identifies the edit target. With
    // selection-only context it would duplicate the entire supplied content.
    ...(contextScope === 'document' && selection ? { selectedText: selection } : {}),
  });
  if (bytes(input) > INPUT_LIMIT) throw new Error('正文较长，AI 输入超过 300000 字节；请选择较短的一段并使用“仅这段”');
  return { input, prompt, selection, contextScope };
}
