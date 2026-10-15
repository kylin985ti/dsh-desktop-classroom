window.__ModuleLoader__.load({ id: "@local/dsh-library/client", factory: (require) => {
  const R = require("react"), h = R.createElement, { MarkdownText } = require("@deepseek-ai/dsh-client-ui-primitives"), T = DSHMarkdownEditor, handoffs = /* @__PURE__ */ new Map();
  const CSS = `.dlib{height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#24303c);font:14px/1.6 system-ui}.dlib *{box-sizing:border-box}.dlib button,.dlib input,.dlib textarea,.dlib select{font:inherit;color:inherit;background:var(--dsw-alias-bg-base,#fff);border:1px solid var(--dsw-alias-border-l2,#e1e5e9);border-radius:6px;padding:6px 9px}.dlib button{cursor:pointer}.dlib button:disabled{opacity:.45;cursor:default}.dlib button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#f0f3f6)}.dlib :is(button,input,textarea,select):focus-visible{outline:2px solid #5c8ab7;outline-offset:2px}.dlib .primary{background:#456e8c;color:#fff;border-color:transparent}.dlib .muted{color:var(--dsw-alias-label-tertiary,#79818b)}.dlib .tools{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.dlib>header{display:flex;align-items:center;gap:10px;padding:15px 20px;border-bottom:1px solid var(--dsw-alias-border-l2,#e1e5e9)}.dlib>header h1{margin:0 auto 0 0;font-size:20px;font-weight:620}.dlib .body{display:grid;grid-template-columns:230px minmax(0,1fr);flex:1;min-height:0}.dlib .files{overflow:auto;background:var(--dsw-alias-bg-module-platform,#f7f8fa);border-right:1px solid var(--dsw-alias-border-l2,#e1e5e9);padding:16px 10px}.dlib .files>input{width:100%;margin-bottom:18px;font-size:12px}.dlib .groupLabel{font-size:11px;color:var(--dsw-alias-label-tertiary,#79818b);padding:12px 9px 7px}.dlib .file{display:flex;align-items:center;gap:7px;text-align:left;width:100%;padding:7px 8px;border:0;background:transparent;overflow:hidden}.dlib .file .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dlib .file[aria-current=true]{background:var(--dsw-alias-interactive-bg-hover,#e9eef4);color:#456e8c}.dlib .badge{flex:none;font:9px/1.7 ui-monospace,monospace;min-width:28px;padding:1px 3px;text-align:center;border-radius:3px;background:#e9eef4;color:#56778f}.dlib .badge.csv{background:#e4eee9;color:#3a725b}.dlib .badge.html{background:#f1e9df;color:#95623c}.dlib .nested{border-left:1px solid var(--dsw-alias-border-l2,#e1e5e9);margin-left:13px;padding-left:5px}.dlib .work{min-height:0;min-width:0;display:flex;flex-direction:column}.dlib .tabs{display:flex;overflow:auto;flex:none;min-height:40px;background:var(--dsw-alias-bg-module-platform,#f7f8fa);border-bottom:1px solid var(--dsw-alias-border-l2,#e1e5e9)}.dlib .tab{display:flex;align-items:center;gap:8px;max-width:240px;min-width:120px;padding:6px 10px;border-right:1px solid var(--dsw-alias-border-l2,#e1e5e9);cursor:pointer;font-size:12px;white-space:nowrap}.dlib .tab[aria-selected=true]{background:var(--dsw-alias-bg-base,#fff);box-shadow:inset 0 2px #567e9a}.dlib .tab span.title{overflow:hidden;text-overflow:ellipsis}.dlib .tab button{margin-left:auto;border:0;background:transparent;padding:1px 5px}.dlib .pane{flex:1;min-height:0;display:flex;flex-direction:column}.dlib .toolbar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid var(--dsw-alias-border-l2,#e1e5e9);font-size:12px}.dlib .saveState{margin-right:auto;font-size:11px;color:var(--dsw-alias-label-tertiary,#79818b)}.dlib .workspace{display:grid;grid-template-columns:minmax(0,1fr);flex:1;min-height:0}.dlib .workspace.withAI{grid-template-columns:minmax(0,1fr) 330px}.dlib .document{overflow:auto;min-width:0;min-height:0;padding:28px 34px}.dlib .document.html,.dlib .document.pdf{padding:0;display:flex;flex-direction:column}.dlib .document iframe{width:100%;flex:1;min-height:420px;border:0;background:#fff}.dlib .document img{max-width:100%;max-height:72vh;display:block;margin:auto;object-fit:contain}.dlib .document :is(audio,video){max-width:100%}.dlib .source{width:100%;min-height:65vh;border:0;border-radius:0;padding:0;resize:vertical;font:13px/1.9 ui-monospace,monospace;background:transparent;tab-size:2}.dlib .plain{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.9 ui-monospace,monospace}.dlib .rich-markdown{max-width:860px;margin:auto}.dlib .rich-markdown .milkdown{--crepe-color-background:var(--dsw-alias-bg-base,#fff);--crepe-color-on-background:var(--dsw-alias-label-primary,#24303c);--crepe-color-surface:var(--dsw-alias-bg-module-platform,#f7f8fa);--crepe-color-on-surface:var(--dsw-alias-label-primary,#24303c);--crepe-color-outline:var(--dsw-alias-border-l2,#e1e5e9);font-family:inherit}.dlib .rich-markdown .milkdown .ProseMirror{padding:15px 24px;min-height:65vh;outline:none}.dlib .rich-markdown .milkdown h1{font-size:30px;margin:24px 0 16px}.dlib .rich-markdown .milkdown h2{font-size:23px;margin:24px 0 12px}.dlib .rich-markdown .milkdown p{margin:8px 0}.dlib .rich-markdown .milkdown-toolbar{z-index:20}.dlib .ai{overflow:auto;border-left:1px solid var(--dsw-alias-border-l2,#e1e5e9);background:var(--dsw-alias-bg-module-platform,#f7f8fa);padding:18px 16px}.dlib .ai h2{font-size:15px;margin:0 0 5px}.dlib .ai textarea{width:100%;min-height:100px;resize:vertical;margin:12px 0}.dlib .ai p{margin:7px 0}.dlib .answer{padding:17px 0;border-top:1px solid var(--dsw-alias-border-l2,#e1e5e9);margin-top:17px;overflow-wrap:anywhere}.dlib .answer .question{font-size:12px;font-weight:600}.dlib .answer .response{white-space:pre-wrap}.dlib .proposal{margin-top:12px;border:1px solid var(--dsw-alias-border-l2,#e1e5e9);border-radius:7px;background:var(--dsw-alias-bg-base,#fff);overflow:hidden}.dlib .proposal>.tools,.dlib .proposal>p{padding:9px 10px;margin:0}.dlib .diff{max-height:290px;overflow:auto;font:11px/1.7 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere}.dlib .diff>div{padding:3px 9px}.dlib .added{background:#e6f3e9;color:#285d3b}.dlib .removed{background:#fbe9e8;color:#93403a}.dlib details{padding:8px 10px;font-size:11px}.dlib details pre{max-height:250px;overflow:auto;white-space:pre-wrap}.dlib .notice,.dlib .error,.dlib .selection{padding:8px 16px;font-size:12px;background:var(--dsw-alias-interactive-bg-hover,#f0f3f6)}.dlib .error{color:var(--dsw-alias-state-error-primary,#a03932)}.dlib .selection{display:flex;align-items:center;gap:10px}.dlib .selection span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.dlib .selection button{font-size:11px}.dlib .empty{margin:auto;max-width:600px;padding:40px;color:var(--dsw-alias-label-tertiary,#79818b)}.dlib .empty h2{font-size:23px;color:var(--dsw-alias-label-primary,#24303c);font-weight:550}.dlib .csvWrap{overflow:auto}.dlib table{border-collapse:collapse;min-width:100%;font-size:12px}.dlib td,.dlib th{border:1px solid var(--dsw-alias-border-l2,#e1e5e9);padding:0}.dlib td input{width:100%;min-width:140px;border:0;border-radius:0;font-size:12px;padding:9px}.dlib th{background:var(--dsw-alias-bg-module-platform,#f7f8fa);font:11px ui-monospace,monospace;min-width:35px;padding:7px}.dlib .modal{position:absolute;inset:0;z-index:100;background:#0004;display:grid;place-items:center}.dlib .dialog{background:var(--dsw-alias-bg-base,#fff);border:1px solid var(--dsw-alias-border-l2,#e1e5e9);border-radius:10px;padding:24px;width:min(430px,90%);box-shadow:0 12px 50px #0002}.dlib .dialog h2{font-size:18px;margin:0 0 15px}.dlib .dialog input{width:100%;margin:10px 0 18px}.dlib .path{font:11px/1.7 ui-monospace,monospace;overflow-wrap:anywhere}@media(max-width:1050px){.dlib .workspace.withAI{display:flex;flex-direction:column}.dlib .workspace.withAI .document{flex:1}.dlib .ai{max-height:42vh;border-left:0;border-top:1px solid var(--dsw-alias-border-l2,#e1e5e9)}.dlib .body{grid-template-columns:195px minmax(0,1fr)}.dlib .document{padding:20px}}@media(max-width:700px){.dlib .body{display:flex;flex-direction:column}.dlib .files{max-height:180px;border-right:0;border-bottom:1px solid var(--dsw-alias-border-l2,#e1e5e9);flex:none}.dlib .work{flex:1}.dlib>header{flex-wrap:wrap;padding:12px}.dlib .toolbar{padding:8px}.dlib .document iframe{min-height:60vh}}`;
  const api = async (action, args = {}, signal) => {
    const r = await fetch("/api/dsh-library", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...args }), signal });
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "\u8D44\u6599\u5E93\u64CD\u4F5C\u5931\u8D25");
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
  function MarkdownEditor({ value, onChange, onError }) {
    const root = R.useRef(null), instance = R.useRef(null), latest = R.useRef({ value, onChange, onError });
    latest.current = { value, onChange, onError };
    R.useEffect(() => {
      let active = true;
      T.mount(root.current, latest.current.value, (text) => {
        if (active) latest.current.onChange(text);
      }).then((editor) => {
        if (!active) {
          void editor.destroy();
          return;
        }
        instance.current = editor;
        editor.setValue(latest.current.value);
      }).catch((e) => {
        if (active) latest.current.onError("\u7F16\u8F91\u5668\u52A0\u8F7D\u5931\u8D25\uFF1A" + e.message);
      });
      return () => {
        active = false;
        const editor = instance.current;
        instance.current = null;
        void editor?.destroy();
      };
    }, []);
    R.useEffect(() => {
      instance.current?.setValue(value);
    }, [value]);
    return h("div", { className: "rich-markdown", ref: root });
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
    return h("div", { className: "csvWrap" }, h("div", { className: "tools", style: { marginBottom: 12 } }, h("span", { className: "muted" }, parsed.rows.length + " \u884C \xB7 " + width + " \u5217"), h("button", { onClick: () => onChange(T.writeCSV([...parsed.rows, Array(width).fill("")], parsed)) }, "\u6DFB\u52A0\u884C"), h("button", { onClick: () => onChange(T.writeCSV(parsed.rows.map((row) => [...row, ...Array(width - row.length).fill(""), ""]), parsed)) }, "\u6DFB\u52A0\u5217"), h("button", { disabled: current === 0, onClick: () => setPage(current - 1) }, "\u4E0A\u4E00\u9875"), h("span", null, current + 1 + " / " + pages), h("button", { disabled: current === pages - 1, onClick: () => setPage(current + 1) }, "\u4E0B\u4E00\u9875")), h("table", { "aria-label": "CSV \u8868\u683C" }, h("tbody", null, parsed.rows.slice(current * 50, current * 50 + 50).map((row, i) => h("tr", { key: current * 50 + i }, h("th", null, current * 50 + i + 1), Array.from({ length: width }, (_, c) => h("td", { key: c }, h("input", { "aria-label": current * 50 + i + 1 + "\u884C" + (c + 1) + "\u5217", value: row[c] || "", onChange: (e) => cell(current * 50 + i, c, e.target.value) }))))))));
  }
  function Difference({ proposal }) {
    const before = proposal.scope === "selection" ? proposal.selectedText : proposal.baseText, after = proposal.scope === "selection" ? proposal.selectedReplacement : proposal.replacement;
    const parts = R.useMemo(() => T.changes(before, after), [before, after]);
    return h(R.Fragment, null, h("div", { className: "diff" }, parts ? parts.slice(0, 100).map((part, i) => h("div", { key: i, className: part.added ? "added" : part.removed ? "removed" : "" }, (part.added ? "+ " : part.removed ? "\u2212 " : "  ") + part.value.slice(0, 2e4))) : h("p", null, "\u5185\u5BB9\u8F83\u957F\uFF0C\u8BF7\u5C55\u5F00\u5B8C\u6574\u6B63\u6587\u6838\u5BF9\u3002")), h("details", null, h("summary", null, "\u67E5\u770B\u5B8C\u6574\u539F\u6587\u4E0E\u5EFA\u8BAE"), h("p", null, "\u539F\u6587"), h("pre", null, before), h("p", null, "\u4FEE\u6539\u540E"), h("pre", null, after)));
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
    } }, h("span", { "aria-hidden": true }, expanded ? "\u25BE" : "\u25B8"), h("span", { className: "name" }, title)), expanded && h("div", { className: "nested" }, error && h("p", { className: "error" }, error), listing?.rows.map((row) => row.type === "directory" ? h(Folder, { key: row.path, root, path: row.path, title: row.title, openFile, onDestination, revision }) : h("button", { className: "file", key: row.path, onClick: () => openFile(null, row.path) }, badge(row.title), h("span", { className: "name" }, row.title))), listing?.nextOffset !== null && listing?.nextOffset !== void 0 && h("button", { onClick: () => api("list", { rootId: root.id, path, offset: listing.nextOffset }).then((next) => setListing({ ...next, rows: [...listing.rows, ...next.rows] })).catch((e) => setError(e.message)) }, "\u7EE7\u7EED\u52A0\u8F7D")));
  }
  function FilePane({ id, active, apps, model, startTask, onMeta, onSaved, onOpen, closers }) {
    const [s, setS] = R.useState({ doc: null, draft: "", baseHash: null, dirty: false, view: "", html: "", history: [], ai: false, prompt: "", selection: "", busy: "", error: "", notice: "", conflict: false, saving: false, app: "default" }), ref = R.useRef(s), alive = R.useRef(true), controllers = R.useRef(/* @__PURE__ */ new Set()), saveRef = R.useRef(null), iframe = R.useRef(null), channel = R.useRef(crypto.randomUUID()), commits = R.useRef(/* @__PURE__ */ new Map());
    const patch = (value) => {
      ref.current = { ...ref.current, ...value };
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
      patch({ doc: doc2, draft, baseHash: result.draft?.baseHash ?? doc2.hash, dirty: !!result.draft && draft !== doc2.text, view: doc2.kind === "markdown" ? "rich" : doc2.kind === "csv" ? "grid" : "preview", history: result.history || ref.current.history, error: "", conflict: false, notice: result.draft ? "\u5DF2\u6062\u590D\u672A\u4FDD\u5B58\u8349\u7A3F\u3002" : "" });
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
    const change = (text) => patch({ draft: text, dirty: text !== ref.current.doc.text, notice: "" });
    const saveFile = async (automatic) => {
      if (saveRef.current) {
        await saveRef.current;
        if (!ref.current.dirty) return;
      }
      const value = ref.current;
      if (!value.doc || !value.dirty) return;
      if (value.conflict) throw Error("\u6587\u4EF6\u5DF2\u5728\u522B\u5904\u4FEE\u6539\uFF0C\u8BF7\u5237\u65B0\u6216\u53E6\u5B58\u526F\u672C");
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
      const timer = setTimeout(() => void persist(ref.current).catch((e) => patch({ error: "\u8349\u7A3F\u4FDD\u5B58\u5931\u8D25\uFF1A" + e.message })), 550);
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
          reject(Error("\u9875\u9762\u7F16\u8F91\u6682\u672A\u54CD\u5E94\uFF0C\u8BF7\u7A0D\u540E\u518D\u5B8C\u6210\u7F16\u8F91"));
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
      onMeta(id, { dirty: s.dirty, title: s.doc?.title || "\u8BFB\u53D6\u4E2D\u2026" });
    }, [s.dirty, s.doc?.title]);
    R.useEffect(() => {
      if (!active) return;
      const handler = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && ref.current.doc?.editable) {
          e.preventDefault();
          safely("\u4FDD\u5B58\u6587\u4EF6", async () => {
            await commitVisual();
            await saveFile(false);
          });
        }
      };
      window.addEventListener("keydown", handler);
      const focus = () => {
        if (ref.current.doc?.editable) void api("revision", { id }).then((value) => {
          if (value.hash !== ref.current.baseHash) patch({ conflict: true, error: "\u6587\u4EF6\u5DF2\u5728\u522B\u5904\u4FEE\u6539\uFF0C\u81EA\u52A8\u4FDD\u5B58\u5DF2\u6682\u505C\u3002\u8BF7\u5237\u65B0\u6216\u53E6\u5B58\u526F\u672C\u3002" });
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
      if (ref.current.dirty && !window.confirm("\u5237\u65B0\u4F1A\u653E\u5F03\u5F53\u524D\u672A\u4FDD\u5B58\u7684\u4FEE\u6539\uFF0C\u7EE7\u7EED\u5417\uFF1F")) return;
      safely("\u5237\u65B0\u6587\u4EF6", async (signal) => {
        if (saveRef.current) await saveRef.current.catch(() => {
        });
        await api("discardDraft", { id }, signal);
        await put(await api("read", { id }, signal), signal);
      });
    };
    const copy = () => {
      const title = window.prompt("\u526F\u672C\u540D\u79F0", s.doc.title.replace(/(\.[^.]+)$/, " \u526F\u672C$1"));
      if (title) safely("\u53E6\u5B58\u526F\u672C", async (signal) => {
        const result = await api("saveAs", { id, title, text: ref.current.draft }, signal);
        await onOpen(result.row.id);
        patch({ notice: "\u526F\u672C\u5DF2\u4FDD\u5B58\uFF0C\u539F\u6587\u4EF6\u4FDD\u7559\u3002" });
      });
    };
    const ask = (mode) => safely(mode === "edit" ? "\u751F\u6210\u4FEE\u6539\u5EFA\u8BAE" : "AI \u9605\u8BFB\u4E2D", async (signal) => {
      await commitVisual();
      if (ref.current.doc.kind === "markdown") await saveFile(true);
      const value = ref.current;
      const result = await api("ask", { id, prompt: value.prompt, mode, sourceText: value.draft, selection: value.selection }, signal);
      patch({ history: result.history, prompt: "" });
    });
    const resolveProposal = (row, decision) => safely("\u5904\u7406\u4FEE\u6539\u5EFA\u8BAE", async (signal) => {
      await commitVisual();
      if (saveRef.current) await saveRef.current;
      const value = ref.current;
      const result = await api("proposal", { id, proposalId: row.id, decision, currentText: value.draft, expectedHash: value.baseHash }, signal);
      if (result.doc) {
        const edited = ref.current.draft !== value.draft;
        patch({ doc: result.doc, draft: edited ? ref.current.draft : result.doc.text, baseHash: result.doc.hash, dirty: edited, conflict: edited, notice: edited ? "AI\u4FEE\u6539\u5DF2\u4FDD\u5B58\uFF1B\u751F\u6210\u671F\u95F4\u7684\u8F93\u5165\u5DF2\u4FDD\u7559\u4E3A\u8349\u7A3F\uFF0C\u8BF7\u6838\u5BF9\u540E\u5408\u5E76\u3002" : "\u4FEE\u6539\u5DF2\u63A5\u53D7\u5E76\u4FDD\u5B58\uFF0C\u4E0A\u4E00\u7248\u53EF\u64A4\u9500\u3002" });
        if (result.doc.kind === "html") patch({ html: await preview(result.doc, channel.current, signal) });
        announce(result.doc);
      }
      patch({ history: result.history });
    });
    const captureSelection = () => {
      const selection = window.getSelection(), parent = selection?.anchorNode?.parentElement;
      if (parent?.closest("[data-dsh-source-path]")?.dataset.dshSourcePath === ref.current.doc?.path) {
        const text = selection.toString().trim();
        if (text) patch({ selection: text.slice(0, 12e3) });
      }
    };
    const sourceSelection = (e) => {
      const text = e.target.value.slice(e.target.selectionStart, e.target.selectionEnd).trim();
      if (text) patch({ selection: text.slice(0, 12e3) });
    };
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
    const doc = s.doc, blocked = !!s.busy;
    let body;
    if (!doc) body = h("div", { className: "empty" }, s.error || "\u6B63\u5728\u8BFB\u53D6\u6587\u4EF6\u2026");
    else if (s.view === "source" && doc.editable) body = h("textarea", { className: "source", "aria-label": "\u6E90\u6587\u7F16\u8F91", value: s.draft, onChange: (e) => change(e.target.value), onSelect: sourceSelection });
    else if (doc.kind === "markdown") body = s.view === "read" ? h(MarkdownText, { text: s.draft, streaming: false }) : h(MarkdownEditor, { value: s.draft, onChange: change, onError: (error) => patch({ error }) });
    else if (doc.kind === "csv") body = h(CSVEditor, { value: s.draft, onChange: change });
    else if (doc.kind === "html") body = h("iframe", { ref: iframe, title: doc.title + " \u4EA4\u4E92\u9884\u89C8", srcDoc: s.html, sandbox: "allow-scripts allow-forms allow-modals allow-downloads", onLoad: () => {
      if (ref.current.view === "visual") iframe.current?.contentWindow.postMessage({ channel: channel.current, type: "set-visual", enabled: true }, "*");
    } });
    else if (doc.kind === "pdf") body = h("iframe", { title: doc.title + " PDF \u9884\u89C8", src: doc.url });
    else if (doc.kind === "image") body = h("img", { alt: doc.title, src: doc.url });
    else if (doc.kind === "audio" || doc.kind === "video") body = h(doc.kind, { controls: true, src: doc.url });
    else if (doc.text !== null) body = h("pre", { className: "plain" }, s.draft);
    else body = h("div", { className: "empty" }, h("h2", null, "\u7528\u5BF9\u5E94\u5E94\u7528\u7EE7\u7EED\u7F16\u8F91"), h("p", null, "\u6B64\u683C\u5F0F\u53EF\u901A\u8FC7\u539F\u5E94\u7528\u6253\u5F00\uFF0C\u4E5F\u53EF\u4EE5\u4EA4\u7ED9 DSH \u4F1A\u8BDD\u7528\u6587\u4EF6\u5DE5\u5177\u534F\u540C\u5904\u7406\u3002"));
    return h(
      "div",
      { className: "pane", style: active ? {} : { display: "none" } },
      doc && h("div", { className: "toolbar" }, badge(doc.title), h("span", { className: "saveState" }, s.saving ? "\u6B63\u5728\u4FDD\u5B58\u2026" : s.conflict ? "\u5916\u90E8\u53D8\u66F4 \xB7 \u8349\u7A3F\u5DF2\u4FDD\u7559" : s.dirty ? doc.kind === "markdown" ? "\u7B49\u5F85\u81EA\u52A8\u4FDD\u5B58\u2026" : "\u6709\u672A\u4FDD\u5B58\u4FEE\u6539" : doc.kind === "markdown" ? "\u5DF2\u81EA\u52A8\u4FDD\u5B58" : "\u672C\u5730\u6587\u4EF6"), doc.kind === "markdown" && h("select", { "aria-label": "Markdown \u7F16\u8F91\u6A21\u5F0F", value: s.view, onChange: (e) => patch({ view: e.target.value }) }, h("option", { value: "rich" }, "\u53EF\u89C6\u5316\u7F16\u8F91"), h("option", { value: "source" }, "Markdown \u6E90\u6587"), h("option", { value: "read" }, "\u9605\u8BFB")), doc.kind === "csv" && h("button", { onClick: () => patch({ view: s.view === "source" ? "grid" : "source" }) }, s.view === "source" ? "\u8868\u683C" : "CSV \u6E90\u6587"), doc.kind === "html" && h(R.Fragment, null, h("button", { disabled: blocked, onClick: () => safely("\u5207\u6362\u7F16\u8F91", () => setHTMLMode(s.view === "visual" ? "preview" : "visual")) }, s.view === "visual" ? "\u5B8C\u6210\u7F16\u8F91\u5E76\u4FDD\u5B58" : "\u70B9\u51FB\u6587\u5B57\u7F16\u8F91"), h("button", { disabled: blocked, onClick: () => safely("\u5207\u6362\u6E90\u6587", () => setHTMLMode(s.view === "source" ? "preview" : "source")) }, s.view === "source" ? "\u4FDD\u5B58\u5E76\u9884\u89C8" : "HTML \u6E90\u6587")), doc.editable && !["markdown", "csv", "html"].includes(doc.kind) && h("button", { onClick: () => patch({ view: s.view === "source" ? "preview" : "source" }) }, s.view === "source" ? "\u9605\u8BFB" : "\u7F16\u8F91\u6B63\u6587"), doc.editable && doc.kind !== "markdown" && h("button", { className: "primary", disabled: blocked || !s.dirty, onClick: () => safely("\u4FDD\u5B58\u6587\u4EF6", async () => {
        await commitVisual();
        await saveFile(false);
      }) }, "\u4FDD\u5B58"), h("button", { disabled: blocked, onClick: reload }, "\u5237\u65B0"), doc.previous && h("button", { disabled: blocked || s.dirty, onClick: () => safely("\u64A4\u9500\u4FEE\u6539", async (signal) => {
        const result = await api("undo", { id, expectedHash: s.baseHash }, signal);
        await put({ doc: result.doc, history: s.history }, signal);
        announce(result.doc);
      }) }, "\u64A4\u9500"), h("button", { disabled: blocked, onClick: () => patch({ ai: !s.ai }) }, s.ai ? "\u6536\u8D77 AI" : "AI \u534F\u4F5C"), h("select", { "aria-label": "\u66F4\u591A\u6587\u4EF6\u64CD\u4F5C", value: "", onChange: (e) => {
        const action = e.target.value;
        if (action === "copy") copy();
        if (action === "path") void navigator.clipboard.writeText(doc.path).then(() => patch({ notice: "\u6587\u4EF6\u8DEF\u5F84\u5DF2\u590D\u5236" }));
        if (action === "finder") window.dshDesktop?.openInFinder(doc.path);
        if (action === "rename") {
          const title = window.prompt("\u6587\u4EF6\u540D\u79F0\uFF08\u5305\u542B\u6269\u5C55\u540D\uFF09", doc.title);
          if (title) safely("\u91CD\u547D\u540D", async (signal) => {
            await saveFile(false);
            const result = await api("rename", { id, title }, signal);
            patch({ doc: result.doc });
            onMeta(id, { title: result.doc.title, path: result.doc.path });
            announce(result.doc);
          });
        }
      } }, h("option", { value: "" }, "\u6587\u4EF6\u64CD\u4F5C"), h("option", { value: "rename" }, "\u91CD\u547D\u540D"), doc.editable && h("option", { value: "copy" }, "\u53E6\u5B58\u526F\u672C"), h("option", { value: "path" }, "\u590D\u5236\u8DEF\u5F84"), h("option", { value: "finder" }, "\u5728\u8BBF\u8FBE\u663E\u793A")), h("select", { "aria-label": "\u6253\u5F00\u6587\u4EF6\u7684\u5E94\u7528", value: s.app, onChange: (e) => patch({ app: e.target.value }) }, h("option", { value: "default" }, "\u9ED8\u8BA4\u5E94\u7528"), apps.map((app) => h("option", { key: app.id, value: app.id }, app.label))), h("button", { disabled: blocked, onClick: () => safely("\u6253\u5F00\u5E94\u7528", (signal) => api("open", { id, app: s.app }, signal)) }, "\u6253\u5F00\u5E94\u7528")),
      s.error && h("div", { className: "error", role: "alert" }, s.error, s.conflict && doc?.editable && h("button", { onClick: copy, style: { marginLeft: 10 } }, "\u53E6\u5B58\u526F\u672C")),
      s.notice && h("div", { className: "notice", role: "status" }, s.notice),
      (doc?.warnings || []).map((text, i) => h("div", { className: "notice", key: i }, text)),
      s.view === "visual" && h("div", { className: "notice" }, "\u70B9\u51FB\u9875\u9762\u4E2D\u7684\u9759\u6001\u6587\u5B57\u76F4\u63A5\u4FEE\u6539\uFF0C\u5B8C\u6210\u540E\u4FDD\u5B58\u3002\u56FE\u8868\u548C\u52A8\u6001\u5185\u5BB9\u53EF\u7528 AI \u6216\u6E90\u6587\u4FEE\u6539\u3002"),
      s.selection && h("div", { className: "selection" }, h("span", null, "\u9009\u533A\uFF1A" + s.selection.slice(0, 130)), h("button", { onClick: () => patch({ ai: true }) }, "\u56F4\u7ED5\u8FD9\u6BB5\u534F\u4F5C"), h("button", { "aria-label": "\u6E05\u9664\u9009\u533A", onClick: () => patch({ selection: "" }) }, "\xD7")),
      h("div", { className: "workspace" + (s.ai && doc ? " withAI" : "") }, h("article", { "data-dsh-source-path": doc?.path, onMouseUp: captureSelection, onKeyUp: captureSelection, inert: ["\u5904\u7406\u4FEE\u6539\u5EFA\u8BAE", "\u5237\u65B0\u6587\u4EF6", "\u64A4\u9500\u4FEE\u6539", "\u91CD\u547D\u540D"].includes(s.busy), className: "document " + (s.view !== "source" ? doc?.kind || "" : "") }, body), s.ai && doc && h("aside", { className: "ai" }, h("h2", null, "\u4E0E\u8FD9\u4E2A\u6587\u4EF6\u534F\u4F5C"), h("p", { className: "muted", style: { fontSize: 11 } }, "\u5BF9\u8BDD\u8DDF\u968F\u6587\u4EF6\u4FDD\u5B58\u3002\u63D0\u4EA4\u65F6\u4F7F\u7528 " + (model?.model || "\u5F53\u524D\u914D\u7F6E\u6A21\u578B") + "\u3002"), h("textarea", { "aria-label": "AI \u534F\u4F5C\u8981\u6C42", value: s.prompt, placeholder: s.selection ? "\u8BF4\u660E\u8FD9\u6BB5\u6587\u5B57\u8981\u600E\u6837\u4FEE\u6539\u2026" : "\u603B\u7ED3\u3001\u89E3\u91CA\uFF0C\u6216\u63D0\u51FA\u5177\u4F53\u4FEE\u6539\u8981\u6C42\u2026", onChange: (e) => patch({ prompt: e.target.value }) }), h("div", { className: "tools" }, h("button", { className: "primary", disabled: blocked || !s.prompt.trim() || !doc.text, onClick: () => ask("question") }, s.busy === "AI \u9605\u8BFB\u4E2D" ? "\u6B63\u5728\u9605\u8BFB\u2026" : "\u63D0\u95EE"), doc.editable && h("button", { disabled: blocked || !s.prompt.trim(), onClick: () => ask("edit") }, s.busy === "\u751F\u6210\u4FEE\u6539\u5EFA\u8BAE" ? "\u6B63\u5728\u751F\u6210\u2026" : "\u5EFA\u8BAE\u4FEE\u6539")), h("div", { className: "tools", style: { marginTop: 12 } }, h("button", { disabled: blocked, onClick: () => safely("\u51C6\u5907\u4EFB\u52A1", async () => {
        await commitVisual();
        if (doc.editable) await saveFile(false);
        await startTask(ref.current.doc, ref.current.prompt);
      }) }, "\u6DFB\u52A0\u5230 DSH \u4EFB\u52A1"), h("button", { onClick: () => {
        if (!window.__DSH_QUOTE_CONTEXT__) {
          patch({ error: "\u5F15\u7528\u63D2\u4EF6\u5C1A\u672A\u52A0\u8F7D\uFF0C\u8BF7\u5728 DSH \u7A7A\u95F2\u540E\u91CD\u65B0\u52A0\u8F7D\u63D2\u4EF6" });
          return;
        }
        window.dispatchEvent(new CustomEvent("dsh:quote-to-prompt", { detail: { label: doc.title, path: doc.path, text: s.selection } }));
        patch({ notice: "\u5DF2\u51C6\u5907\u5F15\u7528\uFF0C\u56DE\u5230\u76EE\u6807\u4F1A\u8BDD\u540E\u52A0\u5165\u8F93\u5165\u6846\u3002" });
      } }, "\u5F15\u7528\u5230\u4E0B\u4E00\u8F6E")), h("p", { className: "muted", style: { fontSize: 11 } }, "\u4FEE\u6539\u5EFA\u8BAE\u5148\u5BA1\u9605\uFF0C\u63A5\u53D7\u540E\u624D\u4FDD\u5B58\uFF1B\u53EF\u64A4\u9500\u3002"), [...s.history].reverse().map((row) => h("div", { className: "answer", key: row.id || row.at }, h("div", { className: "question" }, row.prompt), h("p", { className: "response" }, row.answer), row.proposal && h("div", { className: "proposal" }, h("p", null, row.proposal.status === "accepted" ? "\u5DF2\u63A5\u53D7\u5E76\u4FDD\u5B58" : row.proposal.status === "rejected" ? "\u5DF2\u62D2\u7EDD\uFF0C\u6587\u4EF6\u672A\u66F4\u6539" : "\u5F85\u5BA1\u9605 \xB7 \u5C1A\u672A\u5199\u5165\u6587\u4EF6"), (!row.proposal.status || row.proposal.status === "pending") && h(R.Fragment, null, h(Difference, { proposal: row.proposal }), h("div", { className: "tools" }, h("button", { className: "primary", disabled: blocked || s.draft !== row.proposal.baseText, onClick: () => resolveProposal(row, "accept") }, "\u63A5\u53D7\u5E76\u4FDD\u5B58"), h("button", { disabled: blocked, onClick: () => resolveProposal(row, "reject") }, "\u62D2\u7EDD"), s.draft !== row.proposal.baseText && h("small", { className: "muted" }, "\u6B63\u6587\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210\u5EFA\u8BAE\u3002"))))))))
    );
  }
  function Panel({ startTask }) {
    const [state, setState] = R.useState({ files: [], roots: [], apps: [], model: null }), [tabs, setTabs] = R.useState([]), [active, setActive] = R.useState(null), [query, setQuery] = R.useState(""), [error, setError] = R.useState(""), [revision, setRevision] = R.useState(0), [destination, setDestination] = R.useState(null), [create, setCreate] = R.useState(null), [name, setName] = R.useState(""), [busy, setBusy] = R.useState(false);
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
          if (tabsRef.current.length >= 12) throw Error("\u5DF2\u6253\u5F0012\u4E2A\u6587\u4EF6\uFF0C\u8BF7\u5148\u5173\u95ED\u4E00\u4E2A\u6807\u7B7E");
          setTabs((rows) => [...rows, { id, title: row?.title || "\u8BFB\u53D6\u4E2D\u2026", path: row?.path, dirty: false }]);
        }
        setActive(id);
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
        if (!path) throw Error("\u65E0\u6CD5\u53D6\u5F97\u672C\u5730\u8DEF\u5F84\uFF0C\u8BF7\u4F7F\u7528 DSH Desktop \u539F\u751F\u6587\u4EF6\u9009\u62E9\u5165\u53E3");
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
    const filtered = state.files.filter((row) => row.title.toLowerCase().includes(query.toLowerCase()));
    return h("div", { className: "dlib", style: { position: "relative" }, onDragOver: (e) => {
      if ([...e.dataTransfer.types].includes("Files")) e.preventDefault();
    }, onDrop: (e) => {
      if (e.dataTransfer.files.length) {
        e.preventDefault();
        void addFiles([...e.dataTransfer.files]);
      }
    } }, h("header", null, h("h1", null, "\u8D44\u6599\u5E93"), h("button", { disabled: busy, onClick: () => file.current.click() }, "\u6DFB\u52A0\u6587\u4EF6"), h("button", { disabled: busy, onClick: addFolder }, "\u8FDE\u63A5\u6587\u4EF6\u5939"), h("select", { "aria-label": "\u65B0\u5EFA\u8D44\u6599", value: "", disabled: busy, onChange: (e) => {
      if (e.target.value) {
        setCreate(e.target.value);
        setName("");
      }
    } }, h("option", { value: "" }, "\uFF0B \u65B0\u5EFA"), h("option", { value: "markdown" }, "Markdown \u6587\u6863"), h("option", { value: "html" }, "HTML \u9875\u9762"), h("option", { value: "csv" }, "CSV \u8868\u683C"), h("option", { value: "folder" }, "\u6587\u4EF6\u5939")), h("input", { hidden: true, ref: file, type: "file", multiple: true, onChange: (e) => {
      const files = [...e.target.files];
      e.target.value = "";
      void addFiles(files);
    } })), error && h("div", { className: "error", role: "alert" }, error), h("div", { className: "body" }, h("aside", { className: "files" }, h("input", { type: "search", "aria-label": "\u67E5\u627E\u5DF2\u52A0\u5165\u7684\u6587\u4EF6", placeholder: "\u67E5\u627E\u5DF2\u52A0\u5165\u7684\u6587\u4EF6", value: query, onChange: (e) => setQuery(e.target.value) }), !query && h(R.Fragment, null, h("div", { className: "groupLabel" }, "\u672C\u5730\u8D44\u6599"), state.roots.map((root) => h(Folder, { key: root.id, root, title: root.title, openFile, onDestination: setDestination, revision })), h("div", { className: "groupLabel" }, "\u6700\u8FD1\u4F7F\u7528")), filtered.slice(0, query ? 100 : 20).map((row) => h("button", { className: "file", key: row.id, "aria-current": active === row.id, onClick: () => openFile(row.id) }, badge(row.title), h("span", { className: "name" }, row.title))), !filtered.length && h("p", { className: "muted", style: { padding: 9, fontSize: 12 } }, query ? "\u672A\u627E\u5230\u5DF2\u52A0\u5165\u7684\u6587\u4EF6\u3002" : "\u4ECE\u672C\u5730\u6DFB\u52A0\u6587\u4EF6\uFF0C\u6216\u65B0\u5EFA\u4E00\u4EFD\u8D44\u6599\u3002")), h("section", { className: "work" }, tabs.length ? h(R.Fragment, null, h("div", { className: "tabs", role: "tablist", "aria-label": "\u5DF2\u6253\u5F00\u6587\u4EF6" }, tabs.map((tab, i) => h("div", { className: "tab", key: tab.id, role: "tab", "aria-selected": active === tab.id, tabIndex: active === tab.id ? 0 : -1, onClick: () => setActive(tab.id), onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") setActive(tab.id);
      if (e.key === "ArrowRight") setActive(tabs[(i + 1) % tabs.length].id);
      if (e.key === "ArrowLeft") setActive(tabs[(i + tabs.length - 1) % tabs.length].id);
    } }, badge(tab.title), h("span", { className: "title" }, tab.title + (tab.dirty ? " \xB7" : "")), h("button", { "aria-label": "\u5173\u95ED " + tab.title, onClick: (e) => {
      e.stopPropagation();
      void close(tab.id);
    } }, "\xD7")))), tabs.map((tab) => h(FilePane, { key: tab.id, id: tab.id, active: active === tab.id, apps: state.apps, model: state.model, startTask, onMeta: meta, onSaved: () => void refresh().catch((e) => setError(e.message)), onOpen: openFile, closers }))) : h("div", { className: "empty" }, h("h2", null, "\u8D44\u6599\u7559\u5728\u8FD9\u91CC\uFF0C\u5DE5\u4F5C\u63A5\u7740\u5F80\u4E0B\u505A"), h("p", null, "\u628A\u6587\u4EF6\u62D6\u8FDB\u6765\uFF0C\u6216\u8FDE\u63A5\u672C\u5730\u6587\u4EF6\u5939\u3002\u5728\u6807\u7B7E\u4E2D\u5207\u6362\u8D44\u6599\uFF0C\u76F4\u63A5\u5199 Markdown\u3001\u7F16\u8F91 CSV\u3001\u8FD0\u884C HTML\u3002"), h("p", null, "AI \u5BF9\u8BDD\u8DDF\u968F\u6BCF\u4EFD\u6587\u4EF6\uFF0C\u4FEE\u6539\u5148\u5BA1\u9605\u518D\u4FDD\u5B58\u3002")))), create && h("div", { className: "modal" }, h("div", { className: "dialog", role: "dialog", "aria-modal": true, "aria-label": "\u65B0\u5EFA\u8D44\u6599" }, h("h2", null, "\u65B0\u5EFA" + { markdown: " Markdown \u6587\u6863", html: " HTML \u9875\u9762", csv: " CSV \u8868\u683C", folder: "\u6587\u4EF6\u5939" }[create]), h("p", { className: "muted" }, "\u4F4D\u7F6E\uFF1A" + (destination?.title || "\u6211\u7684\u6587\u6863")), h("label", { htmlFor: "dlib-new-name" }, "\u540D\u79F0"), h("input", { id: "dlib-new-name", value: name, autoFocus: true, onChange: (e) => setName(e.target.value), onKeyDown: (e) => {
      if (e.key === "Enter" && name.trim()) void make();
      if (e.key === "Escape") setCreate(null);
    } }), h("div", { className: "tools" }, h("button", { className: "primary", disabled: busy || !name.trim(), onClick: make }, "\u521B\u5EFA"), h("button", { disabled: busy, onClick: () => setCreate(null) }, "\u53D6\u6D88")))));
  }
  function Handoff({ sessionId, useInput, inputActions }) {
    const input = useInput((state) => state);
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
    const startTask = async (doc, prompt) => {
      const workspace = await ctx.workspaces.create({ path: doc.path.split("/").slice(0, -1).join("/") || "/" });
      const sessionId = await ctx.sessions.create({ workspaceId: workspace.workspaceId });
      handoffs.set(sessionId, (prompt.trim() || "\u8BF7\u5148\u9605\u8BFB\u8FD9\u4E2A\u6587\u4EF6\uFF0C\u8BF4\u660E\u53EF\u4EE5\u600E\u6837\u534F\u4F5C\u5904\u7406\u3002\u4FEE\u6539\u524D\u5148\u5C55\u793A\u5EFA\u8BAE\u3002") + "\n\n\u672C\u5730\u6587\u4EF6\uFF1A" + JSON.stringify(doc.path));
      ctx.uiWorkspace.openSession(sessionId);
      ctx.layout.selectPanel(null);
    };
    ctx.effect(() => {
      const style = document.createElement("style");
      style.textContent = T.styles + "\n" + CSS;
      style.dataset.plugin = "@local/dsh-library";
      document.head.appendChild(style);
      return () => style.remove();
    });
    const Page = () => h(Panel, { startTask });
    ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: "library" }, Page));
    ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({ name: "sidebar.panellist", id: "library", order: 32, label: "\u8D44\u6599\u5E93" }, () => h("span", { "aria-hidden": true }, "\u5E93")));
    ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register({ name: "conversation.input.overlay", id: "library-file-handoff" }, Handoff));
    ctx.slots.inject("plugins.item", () => ctx.slots.register({ name: "plugins.item", id: "library", order: 32, label: "\u8D44\u6599\u5E93" }, (p) => p.view === "summary" ? h("p", null, "\u6587\u4EF6\u6811\u3001\u591A\u6587\u4EF6\u6807\u7B7E\u3001Markdown \u81EA\u52A8\u4FDD\u5B58\u3001HTML \u4EA4\u4E92\u4E0E\u53EF\u5BA1\u9605\u7684 AI \u4FEE\u6539\u3002") : h(Page)));
  }
  return { inject: ["slots", "sessions", "workspaces", "uiWorkspace", "layout"], apply };
} });
