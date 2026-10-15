const TYPES = new Set(['doc','document','sheet','slide','form','mind','flowchart','smartsheet','smartcanvas']);
const short = (value, limit=160) => String(value ?? '').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,limit);
export function documentURL(input, {home=false}={}) {
  let url; try { url=new URL(input); } catch { throw Error('请输入完整的腾讯文档链接'); }
  if(url.protocol!=='https:'||url.hostname!=='docs.qq.com'||url.port||url.username||url.password)throw Error('请使用 docs.qq.com 的 HTTPS 文档链接');
  if(home && ['/','/desktop','/desktop/'].includes(url.pathname)) return 'https://docs.qq.com/desktop/';
  if(!/^\/(doc|document|sheet|slide|form|mind|flowchart|smartsheet|smartcanvas)\/[^/]{1,300}\/?$/.test(url.pathname))throw Error('请输入包含文档 ID 的腾讯文档链接');
  const clean=new URL(url.origin+url.pathname);
  for(const key of ['tab','sheet']){const value=url.searchParams.get(key);if(value && value.length<=160)clean.searchParams.set(key,value);}
  return clean.href;
}
export function documentKind(url) { try { return new URL(documentURL(url)).pathname.split('/')[1]; } catch { return ''; } }
export function resultObjects(result) {
  const objects=[]; if(result?.structuredContent)objects.push(result.structuredContent);
  for(const part of result?.content||[])if(part.type==='text'){try{objects.push(JSON.parse(part.text));}catch{}}
  if(!objects.length && result && !result.content)objects.push(result);
  return objects;
}
export function fileRow(raw) {
  if(!raw||typeof raw!=='object')return null;
  const value={...raw,...raw.file_info,...raw.fileInfo,...raw.file};
  const id=short(value.file_id??value.fileId??value.folder_id??value.node_id??value.id,300);
  if(!id)return null;
  let type=short(value.file_type??value.fileType??value.type??'',30).toLowerCase();
  let url=null;try{url=documentURL(value.file_url??value.fileUrl??value.url??value.link);}catch{}
  if(!TYPES.has(type)&&type!=='folder')type=documentKind(url)||type;
  if(!url&&TYPES.has(type))url='https://docs.qq.com/'+type+'/'+encodeURIComponent(id);
  const owner=value.owner??value.creator??value.owner_info??value.creator_info;
  return {id,title:short(value.title??value.file_name??value.name??'未命名文档'),type:type==='folder'||value.is_folder===true?'folder':type,
    url,owner:short(typeof owner==='object'?owner?.nick_name??owner?.nickname??owner?.name:owner??value.owner_name??value.creator_name??'',100),
    modified:value.last_view_time??value.modified_time??value.modify_time??value.update_time??value.last_modify_time??null,
    size:Number.isFinite(Number(value.file_size??value.size))?Number(value.file_size??value.size):null};
}
export function fileList(result) {
  let rows=null,more=null;const visited=new Set();
  function visit(value,depth=0){
    if(!value||depth>7||visited.has(value)||rows!==null)return;visited.add(value);
    if(Array.isArray(value)){rows=value.map(fileRow).filter(Boolean);return;}
    if(typeof value!=='object')return;
    if(typeof value.has_next==='boolean')more=value.has_next;else if(typeof value.has_more==='boolean')more=value.has_more;
    for(const key of ['files','file_list','fileList','folder_file_list','items','children','list','results','data','result','body'])if(key in value)visit(value[key],depth+1);
  }
  for(const value of resultObjects(result))visit(value);
  if(rows===null)throw Error('腾讯文档列表格式尚未识别，请打开网页版或刷新连接');
  return {rows:rows.slice(0,20),hasMore:more??rows.length>=20};
}
export function documentText(result) {
  const parts=[];let total=0;
  const add=value=>{if(typeof value!=='string'||!value.trim())return;total+=value.length;if(total>300000)throw Error('腾讯文档正文较长，请缩小引用范围');parts.push(value);};
  function visit(value,depth=0){
    if(depth>10||value==null)return;
    if(['string','number','boolean'].includes(typeof value)){add(String(value));return;}
    if(Array.isArray(value)){for(const child of value)visit(child,depth+1);return;}
    if(typeof value!=='object')return;
    if(value.type==='text'&&typeof value.text==='string'){add(value.text);return;}
    let recognized=false;
    for(const key of ['content','text','markdown','plain_text','body','paragraphs','blocks','cells','rows','data','value','document'])if(key in value){recognized=true;visit(value[key],depth+1);}
    if(!recognized && ('sheets' in value))visit(value.sheets,depth+1);
  }
  for(const part of result?.content||[])if(part.type==='text'){
    try{visit(JSON.parse(part.text));}catch(error){if(error.message.startsWith('腾讯文档'))throw error;if(error instanceof SyntaxError)add(part.text);else throw error;}
  }
  if(!parts.length && result?.structuredContent)visit(result.structuredContent);
  return parts.join('\n\n');
}

function objectWith(result,key) {
  const search=(v,depth=0)=>{if(!v||typeof v!=='object'||depth>5)return null;if(Array.isArray(v[key]))return v;for(const k of ['data','result','body']){const found=search(v[k],depth+1);if(found)return found;}return null;};
  for(const value of resultObjects(result)){const found=search(value);if(found)return found;}
  throw Error('腾讯文档表格格式尚未识别，请打开原网页查看');
}
export function sheetTabs(result) {
  return objectWith(result,'sheets').sheets.filter(s=>!s.hidden).map(s=>({id:short(s.sheet_id,160),title:short(s.sheet_name,100),rows:Number(s.row_count),columns:Number(s.col_count)})).filter(s=>s.id&&Number.isSafeInteger(s.rows)&&s.rows>0&&Number.isSafeInteger(s.columns)&&s.columns>0).slice(0,200);
}
export function sheetBounds(sheet,startRow=0,startCol=0) {
  if(!Number.isSafeInteger(startRow)||!Number.isSafeInteger(startCol)||startRow<0||startCol<0||startRow>=sheet.rows||startCol>=sheet.columns)throw Error('请使用工作表内有效的行列范围');
  return {startRow,startCol,endRow:Math.min(startRow+39,sheet.rows-1),endCol:Math.min(startCol+11,sheet.columns-1)};
}
export function sheetCells(result,bounds) {
  let total=0;
  return objectWith(result,'cells').cells.filter(c=>Number.isInteger(c.row)&&Number.isInteger(c.col)&&c.row>=bounds.startRow&&c.row<=bounds.endRow&&c.col>=bounds.startCol&&c.col<=bounds.endCol).slice(0,480).map(c=>{
    const type=String(c.value_type||'').toUpperCase();let value;
    if(type==='NUMBER')value=c.number_value;
    else if(type==='BOOL'||type==='BOOLEAN')value=c.bool_value;
    else if(type==='FORMULA')value=c.string_value||c.formula;
    else if(type==='STRING'||!type)value=c.string_value??c.value??'';
    else value='['+type+']';
    const text=String(value??'');total+=text.length;if(total>300000)throw Error('腾讯文档选区内容过长，请在原网页缩小引用范围');
    return {row:c.row,col:c.col,text,formula:short(c.formula,1000),type};
  });
}
