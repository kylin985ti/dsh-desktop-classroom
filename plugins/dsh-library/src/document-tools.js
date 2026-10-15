import Papa from "papaparse";
import { diffLines } from "diff";
export function readCSV(text) {
  if (text.length > 1024 * 1024) throw Error("\u8FD9\u4EFD\u8868\u683C\u8F83\u5927\uFF0C\u8BF7\u4F7F\u7528\u6E90\u6587\u6216 Excel \u6253\u5F00");
  const parsed = Papa.parse(text, { skipEmptyLines: false });
  if (parsed.errors.some((e) => !["UndetectableDelimiter"].includes(e.code))) throw Error("CSV \u5F15\u53F7\u6216\u5206\u9694\u683C\u5F0F\u9700\u8981\u68C0\u67E5\uFF0C\u8BF7\u5207\u5230\u6E90\u6587");
  if (parsed.data.length > 5e3 || parsed.data.some((row) => row.length > 100)) throw Error("\u8868\u683C\u8D85\u8FC75000\u884C\u6216100\u5217\uFF0C\u8BF7\u4F7F\u7528\u6E90\u6587\u6216 Excel \u6253\u5F00");
  return { rows: parsed.data, delimiter: parsed.meta.delimiter || ",", newline: parsed.meta.linebreak || "\n" };
}
export function writeCSV(rows, format) {
  return Papa.unparse(rows, { delimiter: format.delimiter, newline: format.newline });
}
export function changes(before, after) {
  return diffLines(before, after, { maxEditLength: 2e3, timeout: 100 }) || null;
}
const editableElements = (dom) => [...dom.querySelectorAll("h1,h2,h3,h4,h5,h6,p,span,a,li,button,td,th,label")].filter((el) => !el.childElementCount && el.textContent.trim() && !el.closest("script,style,template,svg"));
export function applyVisualEdit(source, edit) {
  if (!Number.isInteger(edit.nodeId) || edit.nodeId < 0 || typeof edit.text !== "string" || edit.text.length > 12e3) throw Error("\u9875\u9762\u6587\u5B57\u4FEE\u6539\u65E0\u6548");
  const dom = new DOMParser().parseFromString(source, "text/html"), el = editableElements(dom)[edit.nodeId];
  if (!el || el.textContent !== edit.before) throw Error("\u8FD9\u6BB5\u6587\u5B57\u7531\u9875\u9762\u52A8\u6001\u751F\u6210\u6216\u5DF2\u53D8\u5316\uFF0C\u8BF7\u7528\u6E90\u6587\u6216 AI \u4FEE\u6539");
  el.textContent = edit.text;
  return "<!doctype html>\n" + dom.documentElement.outerHTML;
}
export function htmlReferences(source) {
  const dom = new DOMParser().parseFromString(source, "text/html");
  return [...dom.querySelectorAll("[src],link[href]")].map((el) => el.getAttribute("src") || el.getAttribute("href")).concat([...source.matchAll(/fetch\(\s*['"]([^'"]+)['"]/g)].map((x) => x[1])).slice(0, 80);
}
function bridgeRuntime(channel) {
  let visual = false, current = null, before = "";
  const send = (data) => parent.postMessage({ channel, ...data }, "*");
  const commit = () => {
    if (!current) return;
    const el = current;
    current = null;
    el.removeAttribute("contenteditable");
    el.style.outline = "";
    if (el.textContent !== before) send({ type: "visual-edit", nodeId: Number(el.dataset.dlibNode), before, text: el.textContent });
  };
  addEventListener("message", (event) => {
    if (event.source !== parent || event.data?.channel !== channel) return;
    if (event.data.type === "set-visual") {
      commit();
      visual = event.data.enabled;
      document.documentElement.style.cursor = visual ? "text" : "";
    }
    if (event.data.type === "commit") {
      current?.blur();
      commit();
      send({ type: "committed", sequence: event.data.sequence });
    }
  });
  document.addEventListener("click", (event) => {
    if (!visual) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const el = event.target.closest("[data-dlib-node]");
    if (!el) return;
    if (current === el) return;
    commit();
    current = el;
    before = el.textContent;
    el.contentEditable = "plaintext-only";
    el.style.outline = "2px solid #4b8cbb";
    el.focus();
  }, { capture: true });
  document.addEventListener("blur", (event) => {
    if (event.target === current) commit();
  }, true);
  document.addEventListener("keydown", (event) => {
    if (!current) return;
    if (event.key === "Escape") {
      current.textContent = before;
      current.blur();
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      current.blur();
    }
  }, true);
}
export function prepareHTML(source, assets, channel) {
  const dom = new DOMParser().parseFromString(source, "text/html");
  for (const el of dom.querySelectorAll("[data-dlib-node]")) el.removeAttribute("data-dlib-node");
  editableElements(dom).forEach((el, index) => el.setAttribute("data-dlib-node", String(index)));
  const bridge = dom.createElement("script");
  bridge.textContent = "(" + bridgeRuntime.toString() + ")(" + JSON.stringify(channel) + ");";
  dom.head.prepend(bridge);
  const bytes = new TextEncoder().encode(JSON.stringify({ html: "<!doctype html>" + dom.documentElement.outerHTML, assets }));
  let binary = "";
  for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  const packed = btoa(binary);
  return `<!doctype html><meta charset="utf-8"><script>(()=>{const payload=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('${packed}'),c=>c.charCodeAt(0))));const mime={'.css':'text/css','.js':'application/javascript','.json':'application/json','.csv':'text/csv','.md':'text/markdown','.txt':'text/plain','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.svg':'image/svg+xml','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2'},urls=new Map(),content=new Map(),normalize=p=>String(p).replace(/^.//,'').split(/[?#]/)[0];for(const a of payload.assets){const bytes=Uint8Array.from(atob(a.data),c=>c.charCodeAt(0));content.set(normalize(a.reference),{bytes,mime:mime[a.extension]||'application/octet-stream'});urls.set(normalize(a.reference),URL.createObjectURL(new Blob([bytes],{type:mime[a.extension]})));}const originalFetch=fetch.bind(window);window.fetch=(input,options)=>{const value=typeof input==='string'?content.get(normalize(input)):null;return value?Promise.resolve(new Response(value.bytes,{headers:{'content-type':value.mime}})):originalFetch(input,options)};const dom=new DOMParser().parseFromString(payload.html,'text/html');for(const el of dom.querySelectorAll('[src],link[href]')){const key=el.hasAttribute('src')?'src':'href',url=urls.get(normalize(el.getAttribute(key)));if(url)el.setAttribute(key,url);}document.open();document.write('<!doctype html>'+dom.documentElement.outerHTML);document.close();})()<\/script>`;
}
