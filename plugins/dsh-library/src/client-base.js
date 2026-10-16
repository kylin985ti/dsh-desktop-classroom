window.__ModuleLoader__.load({ id: "@local/dsh-library/client", factory: (require) => {
  const R = require("react"), h = R.createElement, { MarkdownText } = require("@deepseek-ai/dsh-client-ui-primitives"), T = DSHMarkdownEditor, handoffs = /* @__PURE__ */ new Map();
  const CSS = `.dlib{height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#24303c);font:14px/1.6 system-ui}.dlib *{box-sizing:border-box}.dlib button,.dlib input,.dlib textarea,.dlib select{font:inherit;color:inherit;background:var(--dsw-alias-bg-base,#fff);border:1px solid var(--dsw-alias-border-l2,#e1e5e9);border-radius:6px;padding:6px 9px}.dlib button{cursor:pointer}.dlib button:disabled{opacity:.45;cursor:default}.dlib button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#f0f3f6)}.dlib :is(button,input,textarea,select):focus-visible{outline:2px solid #5c8ab7;outline-offset:2px}.dlib .primary{background:#456e8c;color:#fff;border-color:transparent}.dlib .muted{color:var(--dsw-alias-label-tertiary,#79818b)}.dlib .tools{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.dlib>header{display:flex;align-items:center;gap:10px;padding:15px 20px;border-bottom:1px solid var(--dsw-alias-border-l2,#e1e5e9)}.dlib>header h1{margin:0 auto 0 0;font-size:20px;font-weight:620}.dlib .body{display:grid;grid-template-columns:230px minmax(0,1fr);flex:1;min-height:0}.dlib .files{overflow:auto;background:var(--dsw-alias-bg-module-platform,#f7f8fa);border-right:1px solid var(--dsw-alias-border-l2,#e1e5e9);padding:16px 10px}.dlib .files>input{width:100%;margin-bottom:18px;font-size:12px}.dlib .groupLabel{font-size:11px;color:var(--dsw-alias-label-tertiary,#79818b);padding:12px 9px 7px}.dlib .file{display:flex;align-items:center;gap:7px;text-align:left;width:100%;padding:7px 8px;border:0;background:transparent;overflow:hidden}.dlib .file .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dlib .file[aria-current=true]{background:var(--dsw-alias-interactive-bg-hover,#e9eef4);color:#456e8c}.dlib .badge{flex:none;font:9px/1.7 ui-monospace,monospace;min-width:28px;padding:1px 3px;text-align:center;border-radius:3px;background:#e9eef4;color:#56778f}.dlib .badge.csv{background:#e4eee9;color:#3a725b}.dlib .badge.html{background:#f1e9df;color:#95623c}.dlib .nested{border-left:1px solid var(--dsw-alias-border-l2,#e1e5e9);margin-left:13px;padding-left:5px}.dlib .work{min-height:0;min-width:0;display:flex;flex-direction:column}.dlib .tabs{display:flex;overflow:auto;flex:none;min-height:40px;background:var(--dsw-alias-bg-module-platform,#f7f8fa);border-bottom:1px solid var(--dsw-alias-border-l2,#e1e5e9)}.dlib .tab{display:flex;align-items:center;gap:8px;max-width:240px;min-width:120px;padding:6px 10px;border-right:1px solid var(--dsw-alias-border-l2,#e1e5e9);cursor:pointer;font-size:12px;white-space:nowrap}.dlib .tab[aria-selected=true]{background:var(--dsw-alias-bg-base,#fff);box-shadow:inset 0 2px #567e9a}.dlib .tab span.title{overflow:hidden;text-overflow:ellipsis}.dlib .tab button{margin-left:auto;border:0;background:transparent;padding:1px 5px}.dlib .pane{flex:1;min-height:0;display:flex;flex-direction:column}.dlib .toolbar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid var(--dsw-alias-border-l2,#e1e5e9);font-size:12px}.dlib .saveState{margin-right:auto;font-size:11px;color:var(--dsw-alias-label-tertiary,#79818b)}.dlib .workspace{display:grid;grid-template-columns:minmax(0,1fr);flex:1;min-height:0}.dlib .workspace.withAI{grid-template-columns:minmax(0,1fr) 330px}.dlib .document{overflow:auto;min-width:0;min-height:0;padding:28px 34px}.dlib .document.html,.dlib .document.pdf{padding:0;display:flex;flex-direction:column}.dlib .document iframe{width:100%;flex:1;min-height:420px;border:0;background:#fff}.dlib .document img{max-width:100%;max-height:72vh;display:block;margin:auto;object-fit:contain}.dlib .document :is(audio,video){max-width:100%}.dlib .source{width:100%;min-height:65vh;border:0;border-radius:0;padding:0;resize:vertical;font:13px/1.9 ui-monospace,monospace;background:transparent;tab-size:2}.dlib .plain{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.9 ui-monospace,monospace}.dlib .rich-markdown{max-width:860px;margin:auto}.dlib .rich-markdown .milkdown{--crepe-color-background:var(--dsw-alias-bg-base,#fff);--crepe-color-on-background:var(--dsw-alias-label-primary,#24303c);--crepe-color-surface:var(--dsw-alias-bg-module-platform,#f7f8fa);--crepe-color-on-surface:var(--dsw-alias-label-primary,#24303c);--crepe-color-outline:var(--dsw-alias-border-l2,#e1e5e9);font-family:inherit}.dlib .rich-markdown .milkdown .ProseMirror{padding:15px 24px;min-height:65vh;outline:none}.dlib .rich-markdown .milkdown h1{font-size:30px;margin:24px 0 16px}.dlib .rich-markdown .milkdown h2{font-size:23px;margin:24px 0 12px}.dlib .rich-markdown .milkdown p{margin:8px 0}.dlib .rich-markdown .milkdown-toolbar{z-index:20}.dlib .ai{overflow:auto;border-left:1px solid var(--dsw-alias-border-l2,#e1e5e9);background:var(--dsw-alias-bg-module-platform,#f7f8fa);padding:18px 16px}.dlib .ai h2{font-size:15px;margin:0 0 5px}.dlib .ai textarea{width:100%;min-height:100px;resize:vertical;margin:12px 0}.dlib .ai p{margin:7px 0}.dlib .answer{padding:17px 0;border-top:1px solid var(--dsw-alias-border-l2,#e1e5e9);margin-top:17px;overflow-wrap:anywhere}.dlib .answer .question{font-size:12px;font-weight:600}.dlib .answer .response{white-space:pre-wrap}.dlib .proposal{margin-top:12px;border:1px solid var(--dsw-alias-border-l2,#e1e5e9);border-radius:7px;background:var(--dsw-alias-bg-base,#fff);overflow:hidden}.dlib .proposal>.tools,.dlib .proposal>p{padding:9px 10px;margin:0}.dlib .diff{max-height:290px;overflow:auto;font:11px/1.7 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere}.dlib .diff>div{padding:3px 9px}.dlib .added{background:#e6f3e9;color:#285d3b}.dlib .removed{background:#fbe9e8;color:#93403a}.dlib details{padding:8px 10px;font-size:11px}.dlib details pre{max-height:250px;overflow:auto;white-space:pre-wrap}.dlib .notice,.dlib .error,.dlib .selection{padding:8px 16px;font-size:12px;background:var(--dsw-alias-interactive-bg-hover,#f0f3f6)}.dlib .error{color:var(--dsw-alias-state-error-primary,#a03932)}.dlib .selection{display:flex;align-items:center;gap:10px}.dlib .selection span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.dlib .selection button{font-size:11px}.dlib .empty{margin:auto;max-width:600px;padding:40px;color:var(--dsw-alias-label-tertiary,#79818b)}.dlib .empty h2{font-size:23px;color:var(--dsw-alias-label-primary,#24303c);font-weight:550}.dlib .csvWrap{overflow:auto}.dlib table{border-collapse:collapse;min-width:100%;font-size:12px}.dlib td,.dlib th{border:1px solid var(--dsw-alias-border-l2,#e1e5e9);padding:0}.dlib td input{width:100%;min-width:140px;border:0;border-radius:0;font-size:12px;padding:9px}.dlib th{background:var(--dsw-alias-bg-module-platform,#f7f8fa);font:11px ui-monospace,monospace;min-width:35px;padding:7px}.dlib .modal{position:absolute;inset:0;z-index:100;background:#0004;display:grid;place-items:center}.dlib .dialog{background:var(--dsw-alias-bg-base,#fff);border:1px solid var(--dsw-alias-border-l2,#e1e5e9);border-radius:10px;padding:24px;width:min(430px,90%);box-shadow:0 12px 50px #0002}.dlib .dialog h2{font-size:18px;margin:0 0 15px}.dlib .dialog input{width:100%;margin:10px 0 18px}.dlib .path{font:11px/1.7 ui-monospace,monospace;overflow-wrap:anywhere}@media(max-width:1050px){.dlib .workspace.withAI{display:flex;flex-direction:column}.dlib .workspace.withAI .document{flex:1}.dlib .ai{max-height:42vh;border-left:0;border-top:1px solid var(--dsw-alias-border-l2,#e1e5e9)}.dlib .body{grid-template-columns:195px minmax(0,1fr)}.dlib .document{padding:20px}}@media(max-width:700px){.dlib .body{display:flex;flex-direction:column}.dlib .files{max-height:180px;border-right:0;border-bottom:1px solid var(--dsw-alias-border-l2,#e1e5e9);flex:none}.dlib .work{flex:1}.dlib>header{flex-wrap:wrap;padding:12px}.dlib .toolbar{padding:8px}.dlib .document iframe{min-height:60vh}}`;

  const DESIGN_CSS = __LIBRARY_UI_CSS__;
  let runtime = null, pendingTransfer = null;
  const paneDrafts = new Map(), inputSeats = new Map(), seatListeners = new Set();
  const ICONS = {
    book: ['M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z','M12 5v15'],
    folder: ['M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10H3Z'],
    doc: ['M6 3h8l4 4v14H6Z','M14 3v5h4M9 12h6M9 16h6'],
    search: ['M17 17l4 4','M16.5 10a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0'],
    star: ['m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3-4.6-4.5 6.4-.9Z'],
    clock: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0','M12 6v6l4 2'],
    spark: ['m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z','M20 2v4M18 4h4'],
    quote: ['M10 6H4v6h6v-2c0 5-2 7-5 8','M21 6h-6v6h6v-2c0 5-2 7-5 8'],
    sidebar: ['M3 4h18v16H3Z','M9 4v16'],
    plus: ['M12 5v14M5 12h14'],
    chat: ['M21 11a8 8 0 0 1-8 8H6l-4 3v-9a9 9 0 1 1 19-2Z'],
  };
  const icon = (name, props = {}) => h('svg', {className:'icon',viewBox:'0 0 24 24','aria-hidden':true,...props}, (ICONS[name]||ICONS.doc).map((d,i)=>h('path',{d,key:i})));
  function cached(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
  function remember(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
  function message(text, error=false) {
    const toast=document.createElement('div'); toast.className='dlibTransferToast'; toast.setAttribute('role',error?'alert':'status'); toast.textContent=text;
    Object.assign(toast.style,{position:'fixed',bottom:'25px',right:'25px',zIndex:10010,padding:'11px 18px',borderRadius:'9px',background:error?'#8d4939':'#354b70',color:'white',maxWidth:'440px',font:'13px/1.7 system-ui',boxShadow:'0 5px 24px #20395922'});
    document.body.append(toast); setTimeout(()=>toast.remove(),6500);
  }
  function SessionTarget({value,onChange}) {
    const source=runtime.sessions.list;
    const snapshot=R.useSyncExternalStore(cb=>source.subscribe(cb),()=>source.getSnapshot(),()=>source.getSnapshot());
    const current=runtime.uiSession.adapter.current.getSnapshot().key;
    const archived=new Set(runtime.workspaces.list?.getSnapshot?.().archivedSessionIds||[]);
    const rows=snapshot.ids.map(id=>snapshot.byId[id]).filter(row=>row&&row.origin!=='subagent'&&(!row.blank||row.id===current)&&!archived.has(row.id)&&runtime.uiWorkspace.isSessionVisible(row.id)).sort((a,b)=>b.updatedAt-a.updatedAt||a.id.localeCompare(b.id)).slice(0,20);
    return h('select',{'aria-label':'引用目标会话',value,onChange:e=>onChange(e.target.value)}, h('option',{value:'new'},'新会话'), rows.map(row=>h('option',{key:row.id,value:row.id},row.displayTitle||row.title||'未命名会话')));
  }
  function waitForInput(sessionId, signal) {
    return new Promise((resolve,reject)=>{
      const source=runtime.uiSession.adapter.current; let inputSource,offInput=()=>{},off=()=>{},timer,seen=false,settled=false;
      const finish=(err,binding)=>{if(settled)return;settled=true;clearTimeout(timer);off();offInput();seatListeners.delete(check);signal.removeEventListener('abort',abort);err?reject(err):resolve(binding)};
      const abort=()=>finish(Error('已取消引用交接，原草稿保留。'));
      const check=()=>{
        if(signal.aborted)return abort();
        const b=source.getSnapshot();
        if(seen&&b.key&&b.key!==sessionId)return finish(Error('目标会话已切换，引用未插入。'));
        if(b.key!==sessionId)return;
        seen=true;
        if(inputSource!==b.hooks.input){offInput();inputSource=b.hooks.input;offInput=inputSource?.subscribe(check)||(()=>{});}
        const seat=inputSeats.get(sessionId);
        if(seat?.ready&&seat.inputActions===b.props.inputActions&&b.ctx?.bail&&b.props.inputActions?.captureInsertion&&inputSource?.getSnapshot().phase==='plain')finish(null,b);
      };
      seatListeners.add(check);off=source.subscribe(check);signal.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>finish(Error('会话输入框尚未就绪。引用保留，请稍后重试。')),12000);check();
    });
  }
  async function transferReference(reference, target, comment) {
    if(window.__DSH_QUOTE_CONTEXT__!==true)throw Error('会话引用组件尚未就绪。引用已保留，请在插件加载完成后重试。');
    pendingTransfer?.abort();const controller=new AbortController();pendingTransfer=controller;
    let targetId=target;
    if(target==='new'){
      // A cwd-only blank session is the native Workspace-picker state, whose
      // composer is intentionally not editable. Associate a real workspace.
      const items=runtime.workspaces.list.getSnapshot().items;
      let workspace=items.filter(w=>reference.path===w.path||reference.path.startsWith(w.path.replace(/\/+$/,'')+'/')).sort((a,b)=>b.path.length-a.path.length)[0];
      if(!workspace)workspace=await runtime.workspaces.create({path:reference.path.split('/').slice(0,-1).join('/')||'/'});
      targetId=await runtime.sessions.create({workspaceId:workspace.workspaceId});
    }
    if(controller.signal.aborted)return;
    const payload=T.libraryQuotePayload(reference,targetId,comment);
    const waiting=waitForInput(targetId,controller.signal);
    runtime.uiWorkspace.openSession(targetId);
    try {
      await waiting;
      const b=runtime.uiSession.adapter.current.getSnapshot();
      if(b.key!==targetId||controller.signal.aborted)throw Error('目标会话已变化，引用未插入。');
      const input=b.hooks.input.getSnapshot();if(input.phase!=='plain')throw Error('输入框正在处理其他操作，请稍后重试。');
      if((input.occurrences||[]).filter(x=>x.source==='quote-context').length>=10)throw Error('一轮最多附加 10 条引用。');
      let binary='';for(const byte of new TextEncoder().encode(JSON.stringify(payload)))binary+=String.fromCharCode(byte);
      const referenceNode={source:'quote-context',ref:JSON.stringify(payload),label:'引用 · '+(payload.text||payload.label).replace(/\s+/g,' ').slice(0,36),appearance:'session',clipboardText:'⟦dsh-quote-v1:'+btoa(binary)+'⟧'};
      const at=input.draft.length-(input.occurrences||[]).filter(x=>x.offset<input.draft.length).reduce((sum,x)=>sum+x.length-1,0);
      const span={...b.props.inputActions.captureInsertion(),start:at,end:at};
      if(b.ctx.bail(b.ctx,'slash/input-insert-reference',{reference:referenceNode,span})!==true)throw Error('会话草稿刚刚变化，引用未插入。');
      const inserted=b.hooks.input.getSnapshot().occurrences?.some(x=>x.source==='quote-context'&&(()=>{try{return JSON.parse(x.ref).id===reference.id}catch{return false}})());
      if(!inserted)throw Error('未能确认引用已进入草稿，引用快照保留，请回到资料库检查。');
      if(paneDrafts.get(reference.fileId)?.reference?.id===reference.id)paneDrafts.delete(reference.fileId);
      message('引用已加入会话草稿，尚未发送；原有输入内容保留。');return true;
    }catch(e){message(e.message,true);throw e}finally{if(pendingTransfer===controller)pendingTransfer=null;}
  }

  const api = async (action, args = {}, signal) => {
    const r = await fetch("/api/dsh-library", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...args }), signal });
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "资料库操作失败");
    return d;
  };
  const badge = (title) => {
    const ext = title.split(".").pop().toLowerCase();
    return h("span", { className: "badge " + ext }, { markdown: "MD", md: "MD", html: "HTML", htm: "HTML", csv: "CSV", docx: "DOC", xlsx: "XLS", pptx: "PPT" }[ext] || ext.slice(0, 4).toUpperCase());
  };
  const persist = (s) => s.doc && s.dirty ? api("draft", { id: s.doc.id, draft: { text: s.draft, baseHash: s.baseHash, stamp: Date.now() } }) : Promise.resolve();
  async function preview(doc, channel, signal) {
    const { assets } = await api("assets", { id: doc.id, references: T.htmlReferences(doc.text) }, signal);
    return T.prepareHTML(doc.text, assets, channel);
  }
  function MarkdownEditor({ value, onChange, onError, readOnly, onSelection, onQuote, onCollaborate, editorRef }) {
    const root=R.useRef(null), instance=R.useRef(null), latest=R.useRef({value,onChange,onError,readOnly,onSelection,onQuote,onCollaborate});
    latest.current={value,onChange,onError,readOnly,onSelection,onQuote,onCollaborate};
    R.useEffect(()=>{
      let active=true;
      T.mount(root.current,latest.current.value,text=>{if(active)latest.current.onChange(text)}, {readOnly:latest.current.readOnly,onSelection:range=>{if(active)latest.current.onSelection?.(range)},onQuote:range=>{if(active)latest.current.onQuote?.(range)},onCollaborate:range=>{if(active)latest.current.onCollaborate?.(range)}}).then(editor=>{
        if(!active){void editor.destroy();return;}instance.current=editor;if(editorRef)editorRef.current=editor;editor.setValue(latest.current.value);editor.setReadOnly(latest.current.readOnly);
      }).catch(e=>{if(active)latest.current.onError('编辑器加载失败：'+e.message)});
      return()=>{active=false;const editor=instance.current;instance.current=null;if(editorRef)editorRef.current=null;void editor?.destroy()};
    },[]);
    R.useEffect(()=>{instance.current?.setValue(value)},[value]);
    R.useEffect(()=>{instance.current?.setReadOnly(readOnly)},[readOnly]);
    return h('div',{className:'rich-markdown',ref:root});
  }
  function CSVEditor({ value, onChange }) {
    const [page, setPage] = R.useState(0);
    let parsed;
    try {
      parsed = T.readCSV(value);
    } catch (e) {
      return h("p", { className: "error" }, e.message);
    }
    const width = Math.max(1, ...parsed.rows.map((x) => x.length)), pages = Math.max(1, Math.ceil(parsed.rows.length / 50)), current = Math.min(page, pages - 1);
    const cell = (r, c, v) => {
      const rows = parsed.rows.map((row) => row.slice());
      while (rows[r].length < width) rows[r].push("");
      rows[r][c] = v;
      onChange(T.writeCSV(rows, parsed));
    };
    return h("div", { className: "csvWrap" }, h("div", { className: "tools", style: { marginBottom: 12 } }, h("span", { className: "muted" }, parsed.rows.length + " 行 · " + width + " 列"), h("button", { onClick: () => onChange(T.writeCSV([...parsed.rows, Array(width).fill("")], parsed)) }, "添加行"), h("button", { onClick: () => onChange(T.writeCSV(parsed.rows.map((row) => [...row, ...Array(width - row.length).fill(""), ""]), parsed)) }, "添加列"), h("button", { disabled: current === 0, onClick: () => setPage(current - 1) }, "上一页"), h("span", null, current + 1 + " / " + pages), h("button", { disabled: current === pages - 1, onClick: () => setPage(current + 1) }, "下一页")), h("table", { "aria-label": "CSV 表格" }, h("tbody", null, parsed.rows.slice(current * 50, current * 50 + 50).map((row, i) => h("tr", { key: current * 50 + i }, h("th", null, current * 50 + i + 1), Array.from({ length: width }, (_, c) => h("td", { key: c }, h("input", { "aria-label": current * 50 + i + 1 + "行" + (c + 1) + "列", value: row[c] || "", onChange: (e) => cell(current * 50 + i, c, e.target.value) }))))))));
  }
  function Difference({ proposal }) {
    const before = proposal.scope === "selection" ? proposal.selectedText : proposal.baseText, after = proposal.scope === "selection" ? proposal.selectedReplacement : proposal.replacement;
    const parts = R.useMemo(() => T.changes(before, after), [before, after]);
    return h(R.Fragment, null, h("div", { className: "diff" }, parts ? parts.slice(0, 100).map((part, i) => h("div", { key: i, className: part.added ? "added" : part.removed ? "removed" : "" }, (part.added ? "+ " : part.removed ? "− " : "  ") + part.value.slice(0, 2e4))) : h("p", null, "内容较长，请展开完整正文核对。")), h("details", null, h("summary", null, "查看完整原文与建议"), h("p", null, "原文"), h("pre", null, before), h("p", null, "修改后"), h("pre", null, after)));
  }
  function Folder({ root, path, title, openFile, onDestination, revision }) {
    const [expanded, setExpanded] = R.useState(false), [listing, setListing] = R.useState(null), [error, setError] = R.useState("");
    R.useEffect(() => {
      if (!expanded) return;
      const c = new AbortController();
      api("list", { rootId: root.id, path }, c.signal).then(setListing).catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
      return () => c.abort();
    }, [expanded, root.id, path, revision]);
    return h("div", null, h("button", { className: "file", onClick: () => {
      setExpanded(!expanded);
      onDestination({ rootId: root.id, directory: path || root.path, title });
    } }, h("span", { "aria-hidden": true }, expanded ? "⌄" : "›"), icon("folder"), h("span", { className: "name" }, title)), expanded && h("div", { className: "nested" }, error && h("p", { className: "error" }, error), listing?.rows.map((row) => row.type === "directory" ? h(Folder, { key: row.path, root, path: row.path, title: row.title, openFile, onDestination, revision }) : h("button", { className: "file", key: row.path, onClick: () => openFile(null, row.path) }, badge(row.title), h("span", { className: "name" }, row.title))), listing?.nextOffset !== null && listing?.nextOffset !== void 0 && h("button", { onClick: () => api("list", { rootId: root.id, path, offset: listing.nextOffset }).then((next) => setListing({ ...next, rows: [...listing.rows, ...next.rows] })).catch((e) => setError(e.message)) }, "继续加载")));
  }
  function FilePane({ id, active, apps, model, startTask, onMeta, onSaved, onOpen, closers, isFavorite, onFavorite, toggleFiles, toggleGlobal }) {
    const [s, setS] = R.useState({ doc: null, draft: "", baseHash: null, dirty: false, view: "", html: "", history: [], ai: false, prompt: "", selection: "", busy: "", error: "", notice: "", conflict: false, saving: false, app: "default", aiMode:"quote", aiScope:"document",reference:null,target:"new",range:null,toc:false,...paneDrafts.get(id) }), ref = R.useRef(s), alive = R.useRef(true), controllers = R.useRef(/* @__PURE__ */ new Set()), saveRef = R.useRef(null), iframe = R.useRef(null), channel = R.useRef(crypto.randomUUID()), commits = R.useRef(/* @__PURE__ */ new Map());
    const article=R.useRef(null), editorRef=R.useRef(null);
    const patch = (value) => {
      ref.current = { ...ref.current, ...value };
      // Persist the local quote seat synchronously, even if its pane unmounts
      // while an existing autosave request completes. Never cache document writes.
      if(['ai','aiMode','aiScope','reference','prompt','target'].some(key=>Object.hasOwn(value,key))){const v=ref.current;paneDrafts.delete(id);paneDrafts.set(id,{ai:v.ai,aiMode:v.aiMode,aiScope:v.aiScope,reference:v.reference,prompt:v.prompt,target:v.target});if(paneDrafts.size>32)paneDrafts.delete(paneDrafts.keys().next().value)}
      if (alive.current) setS(ref.current);
    };
    const announce = (doc2) => {
      window.dispatchEvent(new CustomEvent("dsh:library-file-saved", { detail: { path: doc2.path } }));
      onSaved();
    };
    const run = async (label, fn) => {
      if (ref.current.busy) return;
      patch({ busy: label, error: "", notice: "" });
      const c = new AbortController();
      controllers.current.add(c);
      try {
        return await fn(c.signal);
      } catch (e) {
        if (e.name !== "AbortError") patch({ error: e.message });
        throw e;
      } finally {
        controllers.current.delete(c);
        patch({ busy: "" });
      }
    };
    const safely = (label, fn) => void run(label, fn).catch(() => {
    });
    const put = async (result, signal) => {
      const doc2 = result.doc, draft = result.draft?.text ?? doc2.text ?? "";
      patch({ doc: doc2, draft, baseHash: result.draft?.baseHash ?? doc2.hash, dirty: !!result.draft && draft !== doc2.text, view: doc2.kind === "markdown" ? "rich" : doc2.kind === "csv" ? "grid" : "preview", history: result.history || ref.current.history, error: "", conflict: false, notice: result.draft ? "已恢复未保存草稿。" : "" });
      if (doc2.kind === "html") patch({ html: await preview(doc2, channel.current, signal) });
      onMeta(id, { title: doc2.title, path: doc2.path });
    };
    R.useEffect(() => {
      alive.current = true;
      const c = new AbortController();
      controllers.current.add(c);
      api("read", { id }, c.signal).then((result) => put(result, c.signal)).catch((e) => {
        if (e.name !== "AbortError") patch({ error: e.message });
      });
      return () => {
        alive.current = false;
        c.abort();
        void persist(ref.current).catch(() => {
        });
        for (const item of controllers.current) item.abort();
        for (const timer of commits.current.values()) {
          clearTimeout(timer.timer);
          timer.resolve();
        }
      };
    }, [id]);
    const change = (text) => patch({ draft: text, dirty: text !== ref.current.doc.text, notice: "", range:null,selection:"" });
    const saveFile = async (automatic) => {
      if (saveRef.current) {
        await saveRef.current;
        if (!ref.current.dirty) return;
      }
      const value = ref.current;
      if (!value.doc || !value.dirty) return;
      if (value.conflict) throw Error("文件已在别处修改，请刷新或另存副本");
      const sent = value.draft;
      patch({ saving: true });
      const task = (async () => {
        await persist(value);
        const result = await api("save", { id, text: sent, expectedHash: value.baseHash, automatic: automatic === true });
        const current = ref.current;
        patch({ doc: result.doc, baseHash: result.doc.hash, dirty: current.draft !== sent, saving: false, notice: "" });
        announce(result.doc);
        return result.doc;
      })();
      saveRef.current = task;
      try {
        return await task;
      } catch (e) {
        patch({ saving: false, conflict: true, error: e.message });
        await persist(ref.current);
        throw e;
      } finally {
        if (saveRef.current === task) saveRef.current = null;
      }
    };
    R.useEffect(() => {
      if (!s.dirty || !s.doc) return;
      const timer = setTimeout(() => void persist(ref.current).catch((e) => patch({ error: "草稿保存失败：" + e.message })), 550);
      return () => clearTimeout(timer);
    }, [s.dirty, s.draft, s.baseHash]);
    R.useEffect(() => {
      if (s.doc?.kind !== "markdown" || !s.dirty || s.conflict || s.saving) return;
      const timer = setTimeout(() => void saveFile(true).catch(() => {
      }), 850);
      return () => clearTimeout(timer);
    }, [s.draft, s.dirty, s.conflict, s.saving, s.doc?.kind]);
    const commitVisual = () => {
      if (ref.current.view !== "visual" || !iframe.current) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const sequence = crypto.randomUUID(), timer = setTimeout(() => {
          commits.current.delete(sequence);
          reject(Error("页面编辑暂未响应，请稍后再完成编辑"));
        }, 1500);
        commits.current.set(sequence, { resolve, timer });
        iframe.current.contentWindow.postMessage({ channel: channel.current, type: "commit", sequence }, "*");
      });
    };
    R.useEffect(() => {
      const handler = (event) => {
        if (event.source !== iframe.current?.contentWindow || event.data?.channel !== channel.current) return;
        const data = event.data;
        if (data.type === "visual-edit" && ref.current.view === "visual") {
          try {
            change(T.applyVisualEdit(ref.current.draft, data));
          } catch (e) {
            patch({ error: e.message });
          }
        }
        if (data.type === "committed") {
          const item = commits.current.get(data.sequence);
          if (item) {
            clearTimeout(item.timer);
            item.resolve();
            commits.current.delete(data.sequence);
          }
        }
      };
      window.addEventListener("message", handler);
      return () => window.removeEventListener("message", handler);
    }, []);
    R.useEffect(() => {
      closers.current.set(id, async () => {
        await commitVisual();
        if (ref.current.doc?.kind === "markdown" && !ref.current.conflict) {
          await saveFile(true);
          if (ref.current.dirty) await saveFile(true);
        }
        await persist(ref.current);
        return true;
      });
      return () => closers.current.delete(id);
    }, [id]);
    R.useEffect(() => {
      onMeta(id, { dirty: s.dirty, title: s.doc?.title || "读取中…" });
    }, [s.dirty, s.doc?.title]);
    R.useEffect(() => {
      if (!active) return;
      const handler = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && ref.current.doc?.editable) {
          e.preventDefault();
          safely("保存文件", async () => {
            await commitVisual();
            await saveFile(false);
          });
        }
      };
      window.addEventListener("keydown", handler);
      const focus = () => {
        if (ref.current.doc?.editable) void api("revision", { id }).then((value) => {
          if (value.hash !== ref.current.baseHash) patch({ conflict: true, error: "文件已在别处修改，自动保存已暂停。请刷新或另存副本。" });
        }).catch(() => {
        });
      };
      window.addEventListener("focus", focus);
      return () => {
        window.removeEventListener("keydown", handler);
        window.removeEventListener("focus", focus);
      };
    }, [active]);
    const reload = () => {
      if (ref.current.dirty && !window.confirm("刷新会放弃当前未保存的修改，继续吗？")) return;
      safely("刷新文件", async (signal) => {
        if (saveRef.current) await saveRef.current.catch(() => {
        });
        await api("discardDraft", { id }, signal);
        await put(await api("read", { id }, signal), signal);
      });
    };
    const copy = () => {
      const title = window.prompt("副本名称", s.doc.title.replace(/(\.[^.]+)$/, " 副本$1"));
      if (title) safely("另存副本", async (signal) => {
        const result = await api("saveAs", { id, title, text: ref.current.draft }, signal);
        await onOpen(result.row.id);
        patch({ notice: "副本已保存，原文件保留。" });
      });
    };
    const ask = (mode) => safely(mode === "edit" ? "生成修改建议" : "AI 阅读中", async (signal) => {
      await commitVisual();
      const reference = ref.current.reference;
      if (reference && T.referenceStale(reference, ref.current.doc, ref.current.draft)) throw Error('正文已变化，请更新引用或重新选择 AI 处理范围。');
      if (ref.current.doc.kind === "markdown") await saveFile(true);
      const value = ref.current;
      if (reference && (value.reference?.id !== reference.id || value.draft !== reference.sourceText)) throw Error('正文或选区已变化，请重新确认 AI 处理范围。');
      const selection = reference?.scope === 'selection' ? reference.text : '';
      T.collaborationInput({ filename:value.doc.title,prompt:value.prompt,source:value.draft,selection,contextScope:value.aiScope });
      const result = await api("ask", { id, prompt: value.prompt, mode, sourceText: value.draft, selection, contextScope:value.aiScope,expectedHash:value.baseHash }, signal);
      patch({ history: result.history, prompt: "" });
    });
    const resolveProposal = (row, decision) => safely("处理修改建议", async (signal) => {
      await commitVisual();
      if (saveRef.current) await saveRef.current;
      const value = ref.current;
      const result = await api("proposal", { id, proposalId: row.id, decision, currentText: value.draft, expectedHash: value.baseHash }, signal);
      if (result.doc) {
        const edited = ref.current.draft !== value.draft;
        patch({ doc: result.doc, draft: edited ? ref.current.draft : result.doc.text, baseHash: result.doc.hash, dirty: edited, conflict: edited, notice: edited ? "AI修改已保存；生成期间的输入已保留为草稿，请核对后合并。" : "修改已接受并保存，上一版可撤销。" });
        if (result.doc.kind === "html") patch({ html: await preview(result.doc, channel.current, signal) });
        announce(result.doc);
      }
      patch({ history: result.history });
    });
    const captureSelection = () => {
      if(ref.current.doc?.kind==='markdown'&&ref.current.view!=='source')return;
      const selected=window.getSelection();
      if(!selected?.rangeCount||!article.current?.contains(selected.anchorNode)||!article.current?.contains(selected.focusNode))return;
      const text=selected.toString();const rect=selected.getRangeAt(0).getBoundingClientRect();
      patch({selection:text,range:text.trim()?{text,rect,active:true}:null});
    };
    const sourceSelection=e=>{const text=e.target.value.slice(e.target.selectionStart,e.target.selectionEnd);patch({selection:text,range:null})};
    const prepareReference=async(scope,selectedText)=>{
      const before=ref.current;
      const anchor=window.getSelection()?.anchorNode;
      const chapter=scope==='selection'&&anchor&&article.current?.contains(anchor)?[...article.current.querySelectorAll('.ProseMirror h1,.ProseMirror h2,.ProseMirror h3')].filter(node=>node.contains(anchor)||(node.compareDocumentPosition(anchor)&Node.DOCUMENT_POSITION_FOLLOWING)).at(-1)?.textContent:null;
      const quote=T.createReference(before.doc,{scope,text:selectedText??before.selection,draft:before.draft,hash:before.baseHash,chapter:chapter?.slice(0,300)});
      patch({reference:quote,ai:true,aiMode:'quote',aiScope:scope==='selection'?'selection':'document',range:null,notice:''});
      if(before.doc.kind==='markdown'&&before.dirty&&!before.conflict){
        await saveFile(true);
        const after=ref.current;
        // Re-anchor only the exact snapshot that was actually saved. Any input
        // made during the request keeps the old snapshot and is visibly stale.
        if(after.doc.id===quote.fileId&&after.doc.path===quote.path&&after.draft===quote.sourceText&&after.doc.text===quote.sourceText&&paneDrafts.get(id)?.reference?.id===quote.id){
          patch({reference:Object.freeze({...quote,baseHash:after.baseHash})});
        }
      }
    };
    const locateReference=()=>{
      const reference=ref.current.reference;if(!reference)return;
      const nodes=[...(article.current?.querySelectorAll('.ProseMirror p,.ProseMirror li,.ProseMirror h1,.ProseMirror h2,.ProseMirror h3,pre')||[])];
      const target=reference.scope==='selection'?nodes.find(node=>node.textContent.includes(reference.text)):article.current?.querySelector('.ProseMirror')||article.current;
      if(!target){patch({notice:'当前正文中无法精确定位这段快照；原引用仍保留。'});return;}
      target.scrollIntoView({block:'center',behavior:'smooth'});target.animate?.([{backgroundColor:'#dce8ff'},{backgroundColor:'transparent'}],{duration:1600});
    };
    const refreshReference=()=>{
      const value=ref.current;if(!value.reference)return;
      if(value.reference.scope==='selection'&&!value.draft.includes(value.reference.text)){patch({error:'原选区在新正文中已变化，请重新选择要引用的文字。'});return;}
      safely('更新引用',()=>prepareReference(value.reference.scope,value.reference.text));
    };
    const addToConversation=()=>safely('加入会话草稿',async(signal)=>{
      const value=ref.current,quote=value.reference;if(!quote)throw Error('请先选择要引用的文件或段落。');
      if(T.referenceStale(quote,value.doc,value.draft))throw Error('正文已变化，请更新引用或重新选择，不会自动替换快照。');
      if(value.dirty)throw Error('正文尚未保存，请先保存或等待自动保存。');
      if(quote.baseHash&&value.doc.editable){const version=await api('revision',{id},signal);if(version.hash!==quote.baseHash){patch({conflict:true});throw Error('文件已在别处修改，请刷新后重新选择引用。')}}
      await transferReference(quote,value.target,value.prompt);
    });
    const setHTMLMode = async (view) => {
      await commitVisual();
      if (ref.current.dirty) await saveFile(false);
      if (ref.current.view === "source" || view === "preview") patch({ html: await preview({ ...ref.current.doc, text: ref.current.draft }, channel.current) });
      patch({ view });
      if (view === "visual") iframe.current?.contentWindow.postMessage({ channel: channel.current, type: "set-visual", enabled: true }, "*");
    };
    R.useEffect(() => {
      const handler = (event) => {
        const value = ref.current;
        if (value.doc?.kind !== "html" || value.view !== "preview" || value.dirty) return;
        const related = T.htmlReferences(value.doc.text).some((reference) => {
          try {
            return decodeURIComponent(new URL(reference, "file://" + value.doc.path).pathname) === event.detail?.path;
          } catch {
            return false;
          }
        });
        if (related) void preview(value.doc, channel.current).then((html) => patch({ html })).catch((e) => patch({ error: e.message }));
      };
      window.addEventListener("dsh:library-file-saved", handler);
      return () => window.removeEventListener("dsh:library-file-saved", handler);
    }, []);
    const doc=s.doc, blocked=!!s.busy;
    const headings=R.useMemo(()=>doc?.kind==='markdown'?T.extractHeadings(s.draft):[],[doc?.kind,s.draft]);
    const headingText=text=>text.replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*_`~]/g,'').trim();
    const locateHeading=(row,index)=>{const title=headingText(row.text),at=headings.slice(0,index).filter(x=>x.level===row.level&&headingText(x.text)===title).length;const node=[...(article.current?.querySelectorAll('h'+row.level)||[])].filter(x=>x.textContent.trim()===title)[at];if(node)node.scrollIntoView({block:'start',behavior:'smooth'});else patch({notice:'这个目录项暂时无法精确定位，请在正文中查看。'})};
    const stale=s.reference&&doc?T.referenceStale(s.reference,doc,s.draft):false;
    const selectMode=view=>patch({view,range:null,selection:''});
    const fileAction=action=>{
      if(action==='source')selectMode(doc.kind==='markdown'&&s.view==='source'?'rich':'source');
      if(action==='reload')reload();
      if(action==='copy')copy();
      if(action==='path')void navigator.clipboard.writeText(doc.path).then(()=>patch({notice:'文件路径已复制'})).catch(e=>patch({error:e.message}));
      if(action==='finder')window.dshDesktop?.openInFinder(doc.path);
      if(action==='task')safely('准备任务',async()=>{await commitVisual();if(doc.editable)await saveFile(false);await startTask(ref.current.doc,ref.current.prompt)});
      if(action==='undo')safely('撤销修改',async signal=>{const result=await api('undo',{id,expectedHash:s.baseHash},signal);await put({doc:result.doc,history:s.history},signal);announce(result.doc)});
      if(action==='rename'){
        const title=window.prompt('文件名称（包含扩展名）',doc.title);
        if(title)safely('重命名',async signal=>{await commitVisual();await saveFile(false);const result=await api('rename',{id,title},signal);patch({doc:result.doc});onMeta(id,{title:result.doc.title,path:result.doc.path});announce(result.doc)});
      }
    };
    const quoteFile=()=>safely('准备引用',()=>prepareReference(s.selection.trim()?'selection':'file'));
    const collaborateSelection=range=>safely('准备 AI 选区',async()=>{await prepareReference('selection',range.text);patch({aiMode:'assist'})});
    const showAI=()=>{
      if(ref.current.selection.trim())collaborateSelection({text:ref.current.selection});
      else patch({ai:true,aiMode:'assist',range:null});
    };
    let body;
    if(!doc)body=h('div',{className:'empty'},s.error||'正在读取文件…');
    else if(s.view==='source'&&doc.editable)body=h('textarea',{className:'source','aria-label':'源文编辑',value:s.draft,onChange:e=>change(e.target.value),onSelect:sourceSelection});
    else if(doc.kind==='markdown')body=h(MarkdownEditor,{value:s.draft,onChange:change,onError:error=>patch({error}),readOnly:!doc.editable,editorRef,onSelection:range=>patch({selection:range?.active?range.text:'',range:range?.active?range:null}),onQuote:range=>safely('准备引用',()=>prepareReference('selection',range.text)),onCollaborate:collaborateSelection});
    else if(doc.kind==='csv')body=h(CSVEditor,{value:s.draft,onChange:change});
    else if(doc.kind==='html')body=h('iframe',{ref:iframe,title:doc.title+' 交互预览',srcDoc:s.html,sandbox:'allow-scripts allow-forms allow-modals allow-downloads',onLoad:()=>{if(ref.current.view==='visual')iframe.current?.contentWindow.postMessage({channel:channel.current,type:'set-visual',enabled:true},'*')}});
    else if(doc.kind==='pdf')body=h('iframe',{title:doc.title+' PDF 预览',src:doc.url});
    else if(doc.kind==='image')body=h('img',{alt:doc.title,src:doc.url});
    else if(doc.kind==='audio'||doc.kind==='video')body=h(doc.kind,{controls:true,src:doc.url});
    else if(doc.text!==null)body=h('pre',{className:'plain'},s.draft);
    else body=h('div',{className:'empty'},h('h2',null,'用对应应用继续编辑'),h('p',null,'此格式可通过原应用打开，或引用到 DSH 会话后用文件工具协作。'));
    const quotePanel=s.aiMode==='quote',hasAISelection=s.reference?.scope==='selection';
    const sourceCard=s.reference&&h('div',{className:'sourceCard','aria-label':'引用来源卡片'},
      h('header',null,icon('doc'),h('strong',null,s.reference.label),h('button',{'aria-label':'移除引用',disabled:blocked,onClick:()=>patch({reference:null,aiScope:'document'})},'×')),
      h('blockquote',null,s.reference.scope==='selection'?s.reference.text:'整份文件 · '+(s.reference.summary||s.reference.path)),
      h('div',{className:'sourceLocation',title:s.reference.path},s.reference.path.split('/').slice(-3,-1).join('/')+(s.reference.chapter?' / '+s.reference.chapter:'')),
      h('div',{className:'sourceMeta'},h('span',null,quotePanel?(hasAISelection?'仅引用选中内容':'仅传递文件路径，由会话读取'):(hasAISelection?(s.aiScope==='selection'?'仅将这段发送给 AI':'选区与全文一起发送给 AI'):'将文件正文发送给 AI')),h('button',{onClick:locateReference},'定位原文 ↗')),
      stale&&h('div',{className:'stale',role:'status'},'正文版本已变化；原快照保留。',h('button',{onClick:refreshReference,disabled:blocked},'更新引用')));
    const history=h('div',{className:'aiHistory'},s.history.length? [...s.history].reverse().map(row=>h('div',{className:'answer',key:row.id||row.at},
      h('div',{className:'question'},row.prompt),h('p',{className:'response'},row.answer),row.proposal&&h('div',{className:'proposal'},
        h('p',null,row.proposal.status==='accepted'?'已接受并保存':row.proposal.status==='rejected'?'已拒绝，文件未更改':'待审阅 · 尚未写入文件'),
        (!row.proposal.status||row.proposal.status==='pending')&&h(R.Fragment,null,h(Difference,{proposal:row.proposal}),h('div',{className:'tools'},
          h('button',{className:'primary',disabled:blocked||s.draft!==row.proposal.baseText,onClick:()=>resolveProposal(row,'accept')},'接受并保存'),
          h('button',{disabled:blocked,onClick:()=>resolveProposal(row,'reject')},'拒绝'),s.draft!==row.proposal.baseText&&h('small',{className:'muted'},'正文已变化，请重新生成建议。')))))):
      h('div',{className:'aiEmpty'},icon('spark'),h('strong',null,'与这份资料一起工作'),h('p',null,'总结、解释或生成修改建议。',h('br'),'修改先审阅，接受后才写回文件。')));
    return h('div',{className:'pane',style:active?{}:{display:'none'}},
      doc&&h('div',{className:'docHeader'},
        h('div',{className:'crumbs'},h('button',{className:'iconButton openFiles',title:'显示或隐藏资料导航',onClick:toggleFiles},icon('sidebar')),h('span',{className:'parentCrumb'},'资料库'),h('span',null,'/'),h('span',{className:'docTitle',title:doc.path},doc.title)),
        h('div',{className:'docHeaderActions'},
          h('button',{disabled:blocked,onMouseDown:e=>e.preventDefault(),onClick:showAI},icon('spark'),h('span',{className:'textAI'},' AI 协作')),
          h('button',{className:'referenceButton',disabled:blocked,onClick:quoteFile},icon('quote'),' 引用到对话'),
          h('details',{className:'fileMenu'},h('summary',{'aria-label':'更多文件操作'},'•••'),h('div',{className:'dropdown'},
            doc.editable&&h('button',{onClick:()=>fileAction('source')},doc.kind==='markdown'&&s.view==='source'?'返回正文':'查看 / 编辑源文'),
            h('button',{disabled:blocked,onClick:()=>fileAction('reload')},'刷新文件'),
            doc.previous&&h('button',{disabled:blocked||s.dirty,onClick:()=>fileAction('undo')},'撤销上次保存'),
            h('button',{disabled:blocked,onClick:()=>fileAction('rename')},'重命名'),
            doc.editable&&h('button',{disabled:blocked,onClick:()=>fileAction('copy')},'另存副本'),
            h('button',{onClick:()=>fileAction('path')},'复制文件路径'),h('button',{onClick:()=>fileAction('finder')},'在访达显示'),
            h('label',null,'打开方式',h('select',{'aria-label':'打开文件的应用',value:s.app,onChange:e=>patch({app:e.target.value})},h('option',{value:'default'},'默认应用'),apps.map(app=>h('option',{key:app.id,value:app.id},app.label)))),
            h('button',{disabled:blocked,onClick:()=>safely('打开应用',signal=>api('open',{id,app:s.app},signal))},'在所选应用中打开'),
            h('button',{disabled:blocked,onClick:()=>fileAction('task')},'新建 DSH 文件任务'),
            h('button',{onClick:toggleGlobal},'收起 / 展开全局侧栏'))))),
      s.error&&h('div',{className:'error',role:'alert'},s.error,s.conflict&&doc?.editable&&h('button',{onClick:copy},'另存副本')),
      s.notice&&h('div',{className:'notice',role:'status'},s.notice),
      (doc?.warnings||[]).map((text,i)=>h('div',{className:'notice',key:i},text)),
      s.view==='visual'&&h('div',{className:'notice'},'点击静态文字修改，完成后保存。动态内容请用源文或 AI 修改。'),
      h('div',{className:'workspace'+(s.ai&&doc?' withAI':'')},
        h('article',{ref:article,'data-library-source-path':doc?.path,onMouseUp:captureSelection,onKeyUp:captureSelection,inert:['处理修改建议','刷新文件','撤销修改','重命名'].includes(s.busy),className:'document '+(s.view!=='source'?doc?.kind||'':'')},
          doc&&h('div',{className:'modebar'},h('span',null,h('i',{className:'saveDot'}),s.saving?'正在保存…':s.conflict?'草稿已保留 · 保存暂停':s.dirty?(doc.kind==='markdown'?'等待自动保存…':'未保存修改'):doc.kind==='markdown'?'已自动保存':'本地文件'),
            doc.kind==='markdown'&&s.view==='source'&&h(R.Fragment,null,h('span',{className:'sourceMode'},'源文模式'),h('button',{onClick:()=>selectMode('rich')},'返回正文')),
            doc.kind==='markdown'&&headings.length>0&&h('button',{className:'tocToggle','aria-expanded':s.toc,onClick:()=>patch({toc:!s.toc})},'目录⌄'),
            doc.kind==='csv'&&h('button',{onClick:()=>selectMode(s.view==='source'?'grid':'source')},s.view==='source'?'表格':'CSV 源文'),
            doc.kind==='html'&&h(R.Fragment,null,h('button',{disabled:blocked,onClick:()=>safely('切换编辑',()=>setHTMLMode(s.view==='visual'?'preview':'visual'))},s.view==='visual'?'完成编辑并保存':'点击文字编辑'),h('button',{disabled:blocked,onClick:()=>safely('切换源文',()=>setHTMLMode(s.view==='source'?'preview':'source'))},s.view==='source'?'保存并预览':'HTML 源文')),
            doc.editable&&!['markdown','csv','html'].includes(doc.kind)&&h('button',{onClick:()=>selectMode(s.view==='source'?'preview':'source')},s.view==='source'?'阅读':'编辑正文'),
            doc.editable&&doc.kind!=='markdown'&&h('button',{className:'primary',disabled:blocked||!s.dirty,onClick:()=>safely('保存文件',async()=>{await commitVisual();await saveFile(false)})},'保存')),
          s.toc&&s.view!=='source'&&doc?.kind==='markdown'&&h('nav',{className:'toc','aria-label':'本文目录'},headings.map((row,i)=>h('button',{key:row.key,style:{paddingLeft:Math.max(0,row.level-1)*9},onClick:()=>locateHeading(row,i)},row.text))),
          doc?.kind==='markdown'&&s.view!=='source'&&h('div',{className:'docMeta'},icon('doc'),h('span',{className:'kind'},'MARKDOWN'),h('span',{className:'dot'},'·'),h('span',null,'本地文档'),h('button',{className:'favorite','aria-label':isFavorite?'取消收藏':'收藏文档','aria-pressed':isFavorite,onClick:()=>onFavorite(id)},icon('star'))),
          body),
        active&&doc?.kind!=='markdown'&&s.range?.rect&&h('div',{className:'quoteFloating',role:'toolbar','aria-label':'资料选区操作',style:{left:Math.max(8,Math.min(s.range.rect.left,window.innerWidth-245)),top:Math.max(8,Math.min(s.range.rect.bottom+8,window.innerHeight-48))},onMouseDown:e=>e.preventDefault(),onPointerDown:e=>e.preventDefault()},
          h('button',{onClick:()=>safely('准备引用',()=>prepareReference('selection',s.range.text))},icon('quote'),'引用到对话'),
          h('button',{onClick:()=>{const text=s.range.text;safely('准备引用',async()=>{await prepareReference('selection',text);patch({aiMode:'assist'})})}},icon('spark'),'协作')),
        s.ai&&doc&&h('aside',{className:'ai','aria-label':quotePanel?'引用到对话':'文件 AI 协作'},
          h('div',{className:'aiHead'},h('strong',null,icon(quotePanel?'chat':'spark'),quotePanel?'对话草稿':'AI 协作'),h('button',{className:'iconButton','aria-label':'关闭协作面板',onClick:()=>patch({ai:false})},'×')),
          h('div',{className:'aiMode'},quotePanel?h(R.Fragment,null,h('span',null,'加入到：'),h(SessionTarget,{value:s.target,onChange:target=>patch({target})})):h('span',null,model?.model||'文件协作模型'),h('button',{className:'iconButton',title:quotePanel?'切换为文件内提问 / 修改':'切换为引用到会话',onClick:()=>patch({aiMode:quotePanel?'assist':'quote'})},icon(quotePanel?'spark':'quote'))),
          quotePanel?h('div',{className:'aiHistory'},h('div',{className:'aiEmpty'},icon('spark'),h('strong',null,'带着原文，继续讨论'),h('p',null,'先检查来源，再加入目标会话草稿。',h('br'),'不会自动发送，也不会改动文档。')),
            h('button',{className:'suggestion',onClick:()=>patch({prompt:'请把这段说明整理为三条操作建议。'})},'整理成三条操作建议 ↗'),h('button',{className:'suggestion',onClick:()=>patch({prompt:'请检查这段说明是否清楚，给出修改建议。'})},'检查说明是否清楚 ↗')):history,
          h('div',{className:'aiCompose'},sourceCard,
            !quotePanel&&(hasAISelection?h('fieldset',{className:'aiScope',disabled:blocked},h('legend',null,'发送给 AI 的范围'),h('label',null,h('input',{type:'radio',name:'ai-scope-'+id,value:'selection',checked:s.aiScope==='selection',onChange:()=>patch({aiScope:'selection'})}),'仅这段'),h('label',null,h('input',{type:'radio',name:'ai-scope-'+id,value:'document',checked:s.aiScope==='document',onChange:()=>patch({aiScope:'document'})}),'结合全文')):h('p',{className:'scopeHint'},'发送范围：整篇正文')),
            h('textarea',{'aria-label':quotePanel?'引用附加要求':'AI 协作要求',value:s.prompt,maxLength:4000,placeholder:quotePanel?'附加要求（可选）…':'总结、解释，或提出具体修改要求…',onChange:e=>patch({prompt:e.target.value})}),
            h('div',{className:'tools'},quotePanel?h(R.Fragment,null,h('small',null,'只加入草稿 · 不自动发送'),h('button',{className:'primary',disabled:blocked||!s.reference||stale||s.dirty,onClick:addToConversation},'加入会话草稿 ↗')):
              h(R.Fragment,null,h('button',{className:'primary',disabled:blocked||stale||!s.prompt.trim()||!s.draft,onClick:()=>ask('question')},s.busy==='AI 阅读中'?'正在阅读…':'提问'),doc.editable&&h('button',{disabled:blocked||stale||!s.prompt.trim(),onClick:()=>ask('edit')},s.busy==='生成修改建议'?'正在生成…':'建议修改'))),
            !quotePanel&&h('small',{className:'muted'},hasAISelection?(s.aiScope==='selection'?'AI 仅收到这段内容；修改仅作用于这段，需审阅后接受。':'AI 将收到全文作为上下文；修改仍仅作用于选区，需审阅后接受。'):'AI 将收到整篇正文；修改需审阅后接受。')))),
      doc&&h('footer',{className:'docFooter'},h('span',null,doc.kind==='markdown'?'Markdown · '+s.draft.length.toLocaleString()+' 字':doc.extension?.toUpperCase()+' · 本地文件'),h('span',{title:doc.path},s.conflict?'检测到外部变更':'文件保留在原位置')));
  }
  function Panel({ startTask, toggleGlobal }) {
    const [state, setState] = R.useState({ files: [], roots: [], apps: [], model: null }), [tabs, setTabs] = R.useState([]), [active, setActive] = R.useState(null), [query, setQuery] = R.useState(""), [error, setError] = R.useState(""), [revision, setRevision] = R.useState(0), [destination, setDestination] = R.useState(null), [create, setCreate] = R.useState(null), [name, setName] = R.useState(""), [busy, setBusy] = R.useState(false);
    const [filter,setFilter]=R.useState('recent'),[favorites,setFavorites]=R.useState(()=>cached('dsh-library.favorites.v1',[])),[recent,setRecent]=R.useState(()=>cached('dsh-library.recent.v1',[])),[hiddenFiles,setHiddenFiles]=R.useState(false),[limit,setLimit]=R.useState(50);
    const toggleFavorite=id=>setFavorites(rows=>{const next=rows.includes(id)?rows.filter(x=>x!==id):[...rows,id];remember('dsh-library.favorites.v1',next);return next});
    R.useEffect(()=>{setLimit(50)},[query,filter]);
    const file = R.useRef(null), closers = R.useRef(/* @__PURE__ */ new Map()), boot = R.useRef(false), tabsRef = R.useRef(tabs);
    tabsRef.current = tabs;
    const refresh = async () => {
      const data = await api("status");
      setState(data);
      setRevision((x) => x + 1);
      if (!boot.current) {
        boot.current = true;
        try {
          const saved = JSON.parse(localStorage.getItem("dsh-library.tabs.v3") || "{}"), known = new Map(data.files.map((x) => [x.id, x])), restored = (saved.ids || []).filter((id) => known.has(id)).slice(0, 12).map((id) => ({ id, title: known.get(id).title, path: known.get(id).path, dirty: false }));
          setTabs(restored);
          setActive(restored.some((x) => x.id === saved.active) ? saved.active : restored[0]?.id || null);
        } catch {
        }
      }
    };
    R.useEffect(() => {
      void refresh().catch((e) => setError(e.message));
    }, []);
    R.useEffect(() => {
      if (!boot.current) return;
      try {
        localStorage.setItem("dsh-library.tabs.v3", JSON.stringify({ ids: tabs.map((x) => x.id), active }));
      } catch {
      }
    }, [tabs, active]);
    R.useEffect(() => {
      const handler = (e) => {
        if (tabsRef.current.some((x) => x.dirty)) {
          e.preventDefault();
          e.returnValue = "";
        }
      };
      window.addEventListener("beforeunload", handler);
      return () => window.removeEventListener("beforeunload", handler);
    }, []);
    const task = async (fn) => {
      if (busy) return;
      setBusy(true);
      setError("");
      try {
        await fn();
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    };
    const openFile = async (id, path) => {
      try {
        let row = state.files.find((x) => x.id === id);
        if (!id) {
          ({ row } = await api("register", { path }));
          id = row.id;
          await refresh();
        }
        if (!tabsRef.current.some((x) => x.id === id)) {
          if (tabsRef.current.length >= 12) throw Error("已打开12个文件，请先关闭一个标签");
          setTabs((rows) => [...rows, { id, title: row?.title || "读取中…", path: row?.path, dirty: false }]);
        }
        setActive(id);
        setRecent(rows=>{const next=[id,...rows.filter(x=>x!==id)].slice(0,300);remember('dsh-library.recent.v1',next);return next});
      } catch (e) {
        setError(e.message);
      }
    };
    const close = async (id) => {
      try {
        await closers.current.get(id)?.();
        setTabs((rows) => {
          const at = rows.findIndex((x) => x.id === id), next = rows.filter((x) => x.id !== id);
          if (active === id) setActive(next[Math.min(at, next.length - 1)]?.id || null);
          return next;
        });
      } catch (e) {
        setError(e.message);
      }
    };
    const meta = (id, value) => setTabs((rows) => rows.map((row) => row.id === id ? { ...row, ...value } : row));
    const addFiles = (files) => task(async () => {
      for (const value of files) {
        const path = window.__DSH_HOST_PATHS__?.pathFor(value);
        if (!path) throw Error("无法取得本地路径，请使用 DSH Desktop 原生文件选择入口");
        const { row } = await api("register", { path });
        if (files.length === 1) await openFile(row.id);
      }
      await refresh();
    });
    const addFolder = () => task(async () => {
      const path = await window.__DSH_DIRECTORY_PICKER__?.pick();
      if (!path) return;
      await api("register", { path, kind: "directory" });
      await refresh();
    });
    const make = () => task(async () => {
      const args = { title: name, kind: create, ...destination ? { rootId: destination.rootId, directory: destination.directory } : {} };
      if (create === "folder") await api("folder", args);
      else {
        const { row } = await api("create", args);
        await openFile(row.id);
      }
      setCreate(null);
      setName("");
      await refresh();
    });
    const known=new Map(state.files.map(row=>[row.id,row]));
    const byOrder=filter==='favorites'?favorites.map(id=>known.get(id)).filter(Boolean):filter==='recent'?[...new Set([...recent,...state.files.map(row=>row.id)])].map(id=>known.get(id)).filter(Boolean):state.files;
    const filtered=(query?state.files:byOrder).filter(row=>row.title.toLowerCase().includes(query.toLowerCase()));
    const renderFile=row=>h('div',{className:'fileRow',key:row.id},
      h('button',{className:'file','aria-current':active===row.id,title:row.path,onClick:()=>openFile(row.id)},badge(row.title),h('span',{className:'name'},row.title)),
      h('button',{className:'favorite','aria-pressed':favorites.includes(row.id),'aria-label':(favorites.includes(row.id)?'取消收藏 ':'收藏 ')+row.title,onClick:()=>toggleFavorite(row.id)},icon('star')));
    const beginCreate=kind=>{setCreate(kind);setName('')};
    const addMenu=h('details',{className:'navAddMenu'},h('summary',{'aria-label':'添加或新建资料',title:'添加或新建资料'},icon('plus')),h('div',{className:'dropdown'},
      h('button',{disabled:busy,onClick:()=>file.current.click()},'添加本地文件'),h('button',{disabled:busy,onClick:addFolder},'连接文件夹'),
      h('button',{onClick:()=>beginCreate('markdown')},'新建 Markdown 文档'),h('button',{onClick:()=>beginCreate('html')},'新建 HTML 页面'),h('button',{onClick:()=>beginCreate('csv')},'新建 CSV 表格'),h('button',{onClick:()=>beginCreate('folder')},'新建文件夹')));
    return h('div',{className:'dlib'+(hiddenFiles?' hiddenFiles':''),style:{position:'relative'},onDragOver:e=>{if([...e.dataTransfer.types].includes('Files'))e.preventDefault()},onDrop:e=>{if(e.dataTransfer.files.length){e.preventDefault();void addFiles([...e.dataTransfer.files])}}},
      h('input',{hidden:true,ref:file,type:'file',multiple:true,onChange:e=>{const files=[...e.target.files];e.target.value='';void addFiles(files)}}),
      error&&h('div',{className:'error',role:'alert'},error),
      h('div',{className:'body'},
        h('aside',{className:'files','aria-label':'资料导航'},
          h('div',{className:'libraryNavHead'},h('strong',null,'资料库'),h('div',{className:'navActions'},addMenu,h('button',{className:'iconButton',title:'收起 / 展开全局侧栏','aria-label':'收起或展开全局侧栏',onClick:toggleGlobal},icon('sidebar')))),
          h('input',{className:'navSearch',type:'search','aria-label':'查找已加入的文件',placeholder:'搜索已加入的文件…',title:'按文件名查找已加入的文件；本地文件夹可展开浏览',value:query,onChange:e=>setQuery(e.target.value)}),
          h('button',{className:'navChoice','aria-pressed':filter==='recent',onClick:()=>setFilter('recent')},icon('clock'),'最近打开'),
          h('button',{className:'navChoice','aria-pressed':filter==='favorites',onClick:()=>setFilter('favorites')},icon('star'),'已收藏'),
          h('button',{className:'navChoice','aria-pressed':filter==='all',onClick:()=>setFilter('all')},icon('doc'),'已加入文件'),
          !query&&h(R.Fragment,null,h('div',{className:'groupLabel'},'我的文档',h('button',{className:'iconButton','aria-label':'新建我的文档',onClick:()=>{setDestination(null);beginCreate('markdown')}},icon('plus'))),
            state.roots.filter(root=>root.title==='我的文档').map(root=>h(Folder,{key:root.id,root,title:root.title,openFile,onDestination:setDestination,revision})),
            h('div',{className:'groupLabel'},'已连接文件夹',h('button',{className:'iconButton','aria-label':'连接本地文件夹',onClick:addFolder,disabled:busy},icon('plus'))),
            state.roots.filter(root=>root.title!=='我的文档').map(root=>h(Folder,{key:root.id,root,title:root.title,openFile,onDestination:setDestination,revision}))),
          h('div',{className:'groupLabel'},query?'搜索结果':filter==='favorites'?'收藏的文件':filter==='all'?'全部文件':'最近打开'),
          filtered.slice(0,limit).map(renderFile),
          filtered.length>limit&&h('button',{className:'navChoice',onClick:()=>setLimit(n=>n+100)},'继续加载（'+(filtered.length-limit)+'）'),
          !filtered.length&&h('p',{className:'muted',style:{padding:9,fontSize:11}},query?'未找到已加入的文件。':filter==='favorites'?'点击文件旁的星标收藏常用资料。':'添加文件，或新建一份文档。'),
          h('div',{className:'navBottom'},icon('folder'),'文件保留在原位置')),
        h('section',{className:'work'},tabs.length?h(R.Fragment,null,
          h('div',{className:'tabs',role:'tablist','aria-label':'已打开文件'},tabs.map((tab,i)=>h('div',{className:'tab',key:tab.id,role:'tab','aria-selected':active===tab.id,tabIndex:active===tab.id?0:-1,onClick:()=>setActive(tab.id),onKeyDown:e=>{
            if(e.key==='Enter'||e.key===' '){e.preventDefault();setActive(tab.id)}
            if(e.key==='ArrowRight')setActive(tabs[(i+1)%tabs.length].id);
            if(e.key==='ArrowLeft')setActive(tabs[(i+tabs.length-1)%tabs.length].id);
          }},badge(tab.title),h('span',{className:'title'},tab.title+(tab.dirty?' ·':'')),h('button',{'aria-label':'关闭 '+tab.title,onClick:e=>{e.stopPropagation();void close(tab.id)}},'×')))),
          tabs.map(tab=>h(FilePane,{key:tab.id,id:tab.id,active:active===tab.id,apps:state.apps,model:state.model,startTask,onMeta:meta,onSaved:()=>void refresh().catch(e=>setError(e.message)),onOpen:openFile,closers,isFavorite:favorites.includes(tab.id),onFavorite:toggleFavorite,toggleFiles:()=>setHiddenFiles(x=>!x),toggleGlobal}))) :
          h('div',{className:'empty'},icon('book'),h('h2',null,'资料留在这里，工作接着往下做'),h('p',null,'连接一个文件夹，或把文件拖进来。随时阅读、编辑，再带着来源加入对话。'),h('div',{className:'tools'},h('button',{className:'primary',onClick:()=>beginCreate('markdown')},'新建文档'),h('button',{onClick:()=>file.current.click()},'添加文件'),h('button',{onClick:addFolder},'连接文件夹'))))),
      create&&h('div',{className:'modal'},h('div',{className:'dialog',role:'dialog','aria-modal':true,'aria-label':'新建资料'},
        h('h2',null,'新建'+{markdown:' Markdown 文档',html:' HTML 页面',csv:' CSV 表格',folder:'文件夹'}[create]),h('p',{className:'muted'},'位置：'+(destination?.title||'我的文档')),
        h('label',{htmlFor:'dlib-new-name'},'名称'),h('input',{id:'dlib-new-name',value:name,autoFocus:true,onChange:e=>setName(e.target.value),onKeyDown:e=>{if(e.key==='Enter'&&name.trim())void make();if(e.key==='Escape')setCreate(null)}}),
        h('div',{className:'tools'},h('button',{className:'primary',disabled:busy||!name.trim(),onClick:make},'创建'),h('button',{disabled:busy,onClick:()=>setCreate(null)},'取消')))));
  }
  function Handoff({ sessionId, useInput, inputActions }) {
    const input = useInput((state) => state);
    R.useEffect(() => {
      // The scope is available before the native composer restores its persisted
      // draft and binds its mirror. Wait for that mounted seat, not just phase=plain.
      const seat={inputActions,ready:false};let active=true,frame1=0,frame2=0;
      inputSeats.set(sessionId,seat);
      queueMicrotask(()=>{if(!active)return;frame1=requestAnimationFrame(()=>{frame2=requestAnimationFrame(()=>{if(!active)return;seat.ready=true;for(const notify of [...seatListeners])notify();})})});
      return()=>{active=false;cancelAnimationFrame(frame1);cancelAnimationFrame(frame2);if(inputSeats.get(sessionId)===seat)inputSeats.delete(sessionId)};
    },[sessionId,inputActions]);
    R.useEffect(() => {
      const draft = handoffs.get(sessionId);
      if (draft && !input.draft && !input.attachmentIds?.length && input.phase === "plain") {
        inputActions.setDraft(draft);
        handoffs.delete(sessionId);
      }
    }, [sessionId, inputActions, input.draft]);
    return null;
  }
  function apply(ctx) {
    runtime=ctx;
    ctx.effect(()=>()=>{pendingTransfer?.abort();pendingTransfer=null;if(runtime===ctx)runtime=null;});
    const startTask = async (doc, prompt) => {
      const workspace = await ctx.workspaces.create({ path: doc.path.split("/").slice(0, -1).join("/") || "/" });
      const sessionId = await ctx.sessions.create({ workspaceId: workspace.workspaceId });
      handoffs.set(sessionId, (prompt.trim() || "请先阅读这个文件，说明可以怎样协作处理。修改前先展示建议。") + "\n\n本地文件：" + JSON.stringify(doc.path));
      ctx.uiWorkspace.openSession(sessionId);
      ctx.layout.selectPanel(null);
    };
    ctx.effect(() => {
      const style = document.createElement("style");
      style.textContent = T.styles + "\n" + CSS + "\n" + DESIGN_CSS;
      style.dataset.plugin = "@local/dsh-library";
      document.head.appendChild(style);
      return () => style.remove();
    });
    const Page = () => h(Panel, { startTask, toggleGlobal:()=>ctx.layout.toggleSidebar() });
    ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: "library" }, Page));
    ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({ name: "sidebar.panellist", id: "library", order: 32, label: "资料库" }, () => icon("book", {
      className: "dlib-sidebar-icon", width: 16, height: 16, fill: "none", stroke: "currentColor",
      strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", focusable: false,
      style: { display: "block", flex: "none" }
    })));
    ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register({ name: "conversation.input.overlay", id: "library-file-handoff" }, Handoff));
    ctx.slots.inject("plugins.item", () => ctx.slots.register({ name: "plugins.item", id: "library", order: 32, label: "资料库" }, (p) => p.view === "summary" ? h("p", null, "文件树、多文件标签、Markdown 自动保存、HTML 交互与可审阅的 AI 修改。") : h(Page)));
  }
  return { inject: ["slots", "sessions", "workspaces", "uiWorkspace", "uiSession", "layout"], apply };
} });
