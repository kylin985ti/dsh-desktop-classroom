/**
 * dsh-task-board: shared host React + scoped customFrame business UI.
 * The native conversation is mounted once in the shared drawer.
 * Business behavior is tested independently from the accepted visual redesign.
 */
import { WORKBENCH_CSS } from './styles.js'
import { createTaskBoard } from './task-board.js'
import { createDomainPanel } from './domain-panel.js'
import { loadTasks, saveTasks } from './task-api.js'

const CLIENT_ID = 'dsh-task-board'
const REPOSITORY = 'https://github.com/xudingsheng/dsh-task-board'

window.__ModuleLoader__.load({
  id: CLIENT_ID,
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    // ---------------------------------------------------------------------
    // 业务数据层
    // ---------------------------------------------------------------------

    // ---------------------------------------------------------------------
    // 与宿主的数据通道
    // ---------------------------------------------------------------------

    // Transport lives in task-api.js so the mixed-version no-write guard is tested directly.

    // ---------------------------------------------------------------------
    // 轻量 Markdown 渲染与代码着色（不引入外部依赖，全部打进本文件）
    // ---------------------------------------------------------------------

    const escapeHtml = (text) =>
      String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

    /** 行内元素：先转义再替换，避免注入。 */
    function inline(text) {
      let out = escapeHtml(text)
      out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
      out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
        try {
          const protocol = new URL(url.replace(/&amp;/g, '&'), 'https://local.invalid/').protocol
          if (!['http:', 'https:', 'mailto:'].includes(protocol)) return label
          return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
        } catch { return label }
      })
      return out
    }

    /**
     * Markdown → HTML。覆盖标题、列表、引用、代码块、表格和分割线，
     * 足以阅读与校对一般文档；不做完整 CommonMark 实现。
     */
    function renderMarkdown(source) {
      const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n')
      const html = []
      let index = 0
      let listType = null
      const closeList = () => {
        if (listType) {
          html.push(`</${listType}>`)
          listType = null
        }
      }

      while (index < lines.length) {
        const line = lines[index]

        const fence = /^\s*```(\w*)\s*$/.exec(line)
        if (fence) {
          closeList()
          const lang = fence[1] || ''
          const body = []
          index += 1
          while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
            body.push(lines[index])
            index += 1
          }
          index += 1
          html.push(
            `<pre class="tbCode" data-lang="${escapeHtml(lang)}"><code>${escapeHtml(body.join('\n'))}</code></pre>`,
          )
          continue
        }

        if (/\|/.test(line) && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[index + 1] || '')) {
          closeList()
          const cells = (row) =>
            row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((cell) => cell.trim())
          const head = cells(line)
          index += 2
          const rows = []
          while (index < lines.length && /\|/.test(lines[index]) && lines[index].trim()) {
            rows.push(cells(lines[index]))
            index += 1
          }
          html.push(
            '<table class="tbTable"><thead><tr>' +
              head.map((cell) => `<th>${inline(cell)}</th>`).join('') +
              '</tr></thead><tbody>' +
              rows.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('') +
              '</tbody></table>',
          )
          continue
        }

        const heading = /^(#{1,6})\s+(.*)$/.exec(line)
        if (heading) {
          closeList()
          const level = heading[1].length
          html.push(`<h${level} class="tbH">${inline(heading[2])}</h${level}>`)
          index += 1
          continue
        }

        if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
          closeList()
          html.push('<hr class="tbHr">')
          index += 1
          continue
        }

        const quote = /^\s*>\s?(.*)$/.exec(line)
        if (quote) {
          closeList()
          const body = [quote[1]]
          index += 1
          while (index < lines.length && /^\s*>\s?(.*)$/.test(lines[index])) {
            body.push(/^\s*>\s?(.*)$/.exec(lines[index])[1])
            index += 1
          }
          html.push(`<blockquote class="tbQuote">${inline(body.join(' '))}</blockquote>`)
          continue
        }

        const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
        const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
        if (bullet || numbered) {
          const wanted = bullet ? 'ul' : 'ol'
          if (listType !== wanted) {
            closeList()
            html.push(`<${wanted} class="tbList">`)
            listType = wanted
          }
          html.push(`<li>${inline((bullet || numbered)[1])}</li>`)
          index += 1
          continue
        }

        if (!line.trim()) {
          closeList()
          index += 1
          continue
        }

        closeList()
        html.push(`<p class="tbP">${inline(line)}</p>`)
        index += 1
      }
      closeList()
      return html.join('')
    }

    /** 极简语法着色：注释、字符串、关键字、数字。 */
    function highlightCode(source) {
      const keywords =
        /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|new|this|def|self|None|True|False|public|private|void|int|string|bool|struct|impl|fn|use|package|func|type|interface|null|undefined|true|false)\b/g
      const slots = []
      const stash = (html) => {
        slots.push(html)
        return `\u0000${slots.length - 1}\u0000`
      }
      let out = escapeHtml(source)
      // 先抽出字符串与注释，避免其中的关键字被二次着色
      out = out.replace(/(\/\/[^\n]*|#[^\n]*)/g, (m) => stash(`<span class="tbCmt">${m}</span>`))
      out = out.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, (m) =>
        stash(`<span class="tbStr">${m}</span>`),
      )
      out = out.replace(keywords, '<span class="tbKw">$1</span>')
      out = out.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tbNum">$1</span>')
      out = out.replace(/\u0000(\d+)\u0000/g, (_, at) => slots[Number(at)])
      return out
    }

    // ---------------------------------------------------------------------
    // 样式：注入一次，类名统一 tb 前缀，避免污染宿主样式
    // ---------------------------------------------------------------------

    const STYLE_ID = 'dsh-task-board-style'
    const CSS = WORKBENCH_CSS

    function ensureStyle() {
      if (document.getElementById(STYLE_ID)) return
      const element = document.createElement('style')
      element.id = STYLE_ID
      element.textContent = CSS
      document.head.appendChild(element)
    }

    const DomainPanel = createDomainPanel(React, { renderMarkdown, highlightCode })
    const TaskBoard = createTaskBoard(React, { ensureStyle, loadTasks, saveTasks, DomainPanel })

    // ---------------------------------------------------------------------
    // 注册
    // ---------------------------------------------------------------------

    function apply(ctx) {
      // Keep native session operations attributed to this provider, not the host frame.
      const ProviderTaskBoard = props => React.createElement(TaskBoard, { ...props, aiService: ctx.desktopWorkbenches })
      ctx.effect(() =>
        ctx.desktopWorkbenches.register(
          {
            title: '任务栏',
            repository: REPOSITORY,
            description:
              '以任务为单位组织工作：总览任务与子任务，为每个任务绑定工作域文件夹，就地阅读修改 Markdown 与审查代码。',
            panelTitle: '任务栏',
            // customFrame：面板独占主内容区，原生会话由我们在内部以抽屉形式呈现
            customFrame: true,
            layout: { businessSide: 'left', businessWidth: 0.62 },
          },
          ProviderTaskBoard,
        ),
      )
    }

    // aiService.ctx is the provider context. Cordis requires these direct
    // dependencies even though the workbench host also consumes them itself.
    return { apply, inject: ['desktopWorkbenches', 'sessions', 'conversation'] }
  },
})
