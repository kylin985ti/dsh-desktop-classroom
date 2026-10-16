/** Accept only a concrete Tencent document. Authentication parameters never become a source link. */
export function documentURL(input) {
  let url; try { url = new URL(input); } catch { throw new Error('请输入完整的腾讯文档链接'); }
  if (url.protocol !== 'https:' || url.hostname !== 'docs.qq.com' || url.port || url.username || url.password) throw new Error('请使用 docs.qq.com 的 HTTPS 文档链接');
  if (!/^\/(doc|document|sheet|slide|form|mind|flowchart|smartsheet|smartcanvas)\/[^/]{1,300}\/?$/.test(url.pathname)) throw new Error('请输入包含文档 ID 的腾讯文档链接');
  const clean = new URL(url.origin + url.pathname);
  for (const key of ['tab', 'sheet']) { const value = url.searchParams.get(key); if (value && value.length <= 160) clean.searchParams.set(key, value); }
  return clean.href;
}
