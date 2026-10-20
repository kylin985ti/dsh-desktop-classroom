import { GANTT_CSS } from './gantt-styles.js'
import { AI_SCHEDULE_CSS } from './ai-schedule-styles.js'
import { AI_PLANNING_CSS } from './ai-planning-styles.js'
import { CALENDAR_CSS } from './calendar-styles.js'

export const WORKBENCH_CSS = `
.tbRoot{
  --tb-canvas:#f7f8fa;--tb-surface:#fff;--tb-ink:#272b36;--tb-secondary:#646f80;--tb-muted:#8b95a5;
  --tb-line:#e3e7ee;--tb-subtle:#edf0f5;--tb-hover:#f1f3f8;--tb-accent:#6567d7;--tb-accent-soft:#f0f0fd;
  --tb-success:#377653;--tb-success-soft:#eef7f1;--tb-ongoing:#317777;--tb-ongoing-soft:#edf6f5;--tb-danger:#b45459;--tb-shadow:0 9px 28px #26365a16;
  display:flex;flex-direction:column;position:relative;isolation:isolate;width:100%;height:100%;
  min-width:0;min-height:0;overflow:hidden;container-type:inline-size;container-name:tb-body;
  font:13px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB",sans-serif;
  color:var(--tb-ink);background:var(--tb-canvas);box-sizing:border-box;
}
.tbRoot *{box-sizing:border-box}.tbRoot :is(button,input,select,textarea):not(.tbChatBody *){font:inherit;color:inherit}
.tbRoot button{cursor:pointer}.tbRoot button[disabled]{cursor:default;opacity:.5}
.tbRoot :is(button,a,input,select,textarea):focus-visible{outline:2px solid var(--tb-accent);outline-offset:2px}
.tbIcon{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;flex:0 0 auto;pointer-events:none}
.tbBar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:0 0 auto;padding:12px 24px;min-height:60px;background:var(--tb-surface);border-bottom:1px solid var(--tb-line);z-index:2}
.tbBarTitle{font-size:15px;font-weight:650;letter-spacing:-.2px}.tbBarPage{font-size:11px;color:var(--tb-muted);border-left:1px solid var(--tb-line);padding-left:12px;white-space:nowrap}
.tbGrow{flex:1 1 auto;min-width:0}.tbBarActions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.tbBtn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font-size:12px!important;line-height:1.5;padding:6px 10px;min-height:31px;border:1px solid var(--tb-line);border-radius:6px;background:var(--tb-surface);color:var(--tb-secondary)!important;white-space:nowrap}
.tbBtn:hover:not([disabled]){background:var(--tb-hover)}.tbBtn .tbIcon{width:14px;height:14px}
.tbBtnPrimary{background:var(--tb-accent);border-color:var(--tb-accent);color:white!important;font-weight:550}
.tbBtnPrimary:hover:not([disabled]){background:color-mix(in srgb,var(--tb-accent) 85%,#202047)}
.tbGhost{border-color:transparent;background:transparent}.tbDanger{color:var(--tb-danger)!important}.tbDanger:hover:not([disabled]){background:color-mix(in srgb,var(--tb-danger) 10%,var(--tb-surface))}
.tbScroll{flex:1 1 auto;min-height:0;min-width:0;overflow:auto;scrollbar-gutter:stable;padding:20px 24px 26px}
.tbViewBar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:16px;color:var(--tb-muted);font-size:11px}
.tbViewLabel{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:var(--tb-ink)}.tbViewLabel .tbIcon{width:14px;height:14px}
/* Board columns never wrap; scrolling belongs to this bounded viewport, not the app shell. */
.tbBoardScroll{display:flex;flex-direction:column;overflow:hidden;padding-bottom:12px}
.tbBoardViewport{flex:1 1 auto;min-width:0;min-height:0;overflow-x:auto;overflow-y:auto;padding:2px 2px 14px;overscroll-behavior-x:contain;scrollbar-width:thin;scrollbar-color:var(--tb-line) transparent}
.tbBoardViewport:focus-visible{outline:2px solid var(--tb-accent);outline-offset:-2px}
.tbBoardViewport::-webkit-scrollbar{width:8px;height:8px}.tbBoardViewport::-webkit-scrollbar-thumb{background:var(--tb-line);border-radius:5px}
.tbGroups{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(250px,1fr);grid-template-rows:auto;gap:16px;align-items:start;min-width:100%}
.tbGroup{min-width:0;border:1px solid transparent;border-radius:10px;background:none}
.tbGroupHead{display:flex;align-items:center;gap:7px;padding:6px 4px 12px;min-height:38px}
.tbGroupDot{width:9px;height:9px;border-radius:50%;flex:0 0 auto;background:#9aa5b5}
.tbGroupDot[data-status="doing"]{background:transparent;border:2px solid var(--tb-accent);border-right-color:color-mix(in srgb,var(--tb-accent) 25%,transparent)}
.tbGroupDot[data-status="ongoing"]{background:none;color:var(--tb-ongoing);width:13px;height:12px;position:relative}.tbGroupDot[data-status="ongoing"]::after{content:"∞";position:absolute;top:-5px;left:0;font-size:15px;line-height:20px;font-weight:600}
.tbGroupDot[data-status="done"]{background:var(--tb-success)}.tbGroupDot[data-status="dropped"]{background:none;border:1.5px solid #a4adbc}
.tbGroupTitle{font-size:12px;font-weight:600;white-space:nowrap}.tbGroupCount{font-size:10px;line-height:18px;color:var(--tb-secondary);background:var(--tb-line);padding:0 5px;border-radius:5px;font-variant-numeric:tabular-nums}
.tbGroupCaption{margin-left:auto;white-space:nowrap;font-size:10px;color:var(--tb-muted)}
.tbGroupBody{display:flex;flex-direction:column;gap:10px;min-height:44px}
.tbGroupAdd{padding:10px 8px;text-align:left;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--tb-muted)!important;border:0;border-radius:7px;background:none;width:100%}
.tbGroupAdd:hover{background:var(--tb-hover);color:var(--tb-accent)!important}.tbGroupAdd .tbIcon{width:13px;height:13px}
.tbGroupHeadAdd{padding:3px;border:0;background:none;color:var(--tb-muted)!important;border-radius:4px;display:flex}.tbGroupHeadAdd .tbIcon{width:13px;height:13px}
.tbGroupEmpty{padding:14px 8px 9px;color:var(--tb-muted);font-size:11px}
.tbSettlementHint{margin:14px 2px 0;padding:12px;border:1px dashed var(--tb-line);border-radius:8px;font-size:10px;color:var(--tb-muted);line-height:1.8}
.tbCard{background:var(--tb-surface);border:1px solid var(--tb-line);border-radius:10px;padding:15px 16px;min-width:0}
.tbItem{padding:12px 12px 10px;position:relative;box-shadow:0 1px 2px #25364d04}
.tbItem:hover{border-color:color-mix(in srgb,var(--tb-accent) 30%,var(--tb-line))}
.tbItemExpanded{border-color:color-mix(in srgb,var(--tb-accent) 32%,var(--tb-line))}
.tbCardHead{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
.tbItem > .tbCardHead{display:grid;grid-template-columns:20px minmax(0,1fr) auto 22px;gap:5px;align-items:start}
.tbCardTitle{font-weight:550;font-size:13px!important;line-height:24px;border:0;background:none;padding:0;text-align:left;word-break:break-word;overflow-wrap:anywhere;min-width:0}
.tbCardTitle:hover{color:var(--tb-accent)}.tbItem[data-status="done"] > .tbCardHead > .tbCardTitle,.tbItem[data-status="dropped"] > .tbCardHead > .tbCardTitle{color:var(--tb-secondary)}
.tbTaskMeta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:7px;padding-left:25px;font-size:10px;color:var(--tb-muted);min-width:0}
.tbTaskMeta .tbIcon{width:12px;height:12px}.tbMetaPart{display:inline-flex;align-items:center;gap:4px;min-width:0;max-width:100%}
.tbFold{display:inline-flex;align-items:center;gap:4px;font-size:10px!important;line-height:18px;white-space:nowrap;border:0;background:none;color:var(--tb-secondary)!important;padding:0;border-radius:4px;text-align:left}
.tbFold:hover{color:var(--tb-accent)!important}.tbFoldCaret{font-size:10px;color:var(--tb-muted)}.tbFoldDone{color:var(--tb-muted)}
.tbItemFoot{border-top:1px solid var(--tb-subtle);margin-top:10px;padding-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;color:var(--tb-muted);font-size:10px}
.tbProgress{width:30px;height:3px;overflow:hidden;background:var(--tb-line);border-radius:5px}.tbProgress > span{display:block;height:100%;background:var(--tb-accent);opacity:.65}
.tbInlineAdd{display:inline-flex;align-items:center;gap:4px;border:0;background:none;color:var(--tb-secondary)!important;padding:3px 0;font-size:11px!important;text-align:left;border-radius:4px}
.tbInlineAdd:hover{color:var(--tb-accent)!important}.tbInlineAdd .tbIcon{width:12px;height:12px}
.tbGrip{width:20px;height:24px;padding:3px 2px;border:0;border-radius:4px;background:none;color:var(--tb-muted)!important;opacity:.4;cursor:grab!important;user-select:none;touch-action:none;display:grid;place-content:center}
.tbGrip .tbIcon{width:12px;height:16px;stroke-width:2.4}.tbItem:hover .tbGrip,.tbRow:hover .tbGrip,.tbGrip:focus-visible{opacity:.95}
.tbGrip:hover{background:var(--tb-hover)}.tbGripSm{width:16px;height:24px}
.tbMenuTrigger,.tbAddNode{height:24px;width:22px;display:grid;place-items:center;border:0;background:none;border-radius:4px;padding:0;color:var(--tb-muted)!important;opacity:.3}
.tbMenuTrigger .tbIcon,.tbAddNode .tbIcon{width:14px;height:14px}
.tbItem:hover > .tbCardHead .tbMenuTrigger,.tbRow:hover .tbMenuTrigger,.tbRow:hover .tbAddNode,.tbMenuTrigger:focus-visible,.tbAddNode:focus-visible,[aria-expanded="true"].tbMenuTrigger{opacity:1}
.tbMenuTrigger:hover,.tbAddNode:hover{background:var(--tb-hover);color:var(--tb-accent)!important}
.tbStatus{display:inline-flex;align-items:center;gap:5px;min-width:0;flex:0 0 auto}
.tbStatusChip{display:inline-flex;align-items:center;justify-content:center;gap:4px;white-space:nowrap;height:24px;font-size:11px!important;line-height:18px;border:0;border-radius:5px;padding:0 6px;background:var(--tb-hover);color:var(--tb-secondary)!important;cursor:pointer}
.tbStatusChip[data-status="doing"]{color:var(--tb-accent)!important;background:var(--tb-accent-soft)}
.tbStatusChip[data-status="ongoing"]{color:var(--tb-ongoing)!important;background:var(--tb-ongoing-soft)}
.tbStatusChip[data-status="done"]{color:var(--tb-success)!important;background:var(--tb-success-soft)}
.tbStatusChip[data-status="dropped"]{color:var(--tb-secondary)!important;background:var(--tb-hover)}
.tbStatusChip:hover{filter:brightness(.97)}.tbStatusDot{width:5px;height:5px;border-radius:50%;background:currentColor;flex:0 0 auto}.tbStatusCaret{font-size:8px;opacity:.6}
.tbRow .tbStatusChip{height:22px;font-size:10px!important;padding:0 5px;gap:3px}
.tbChildren{margin-top:10px;padding-top:7px;border-top:1px solid var(--tb-subtle)}.tbGrandChildren{position:relative}
.tbChild{position:relative;min-width:0}.tbRow{display:grid;grid-template-columns:16px 12px minmax(0,1fr) auto 20px 20px;align-items:start;gap:3px;padding:4px 0 4px var(--tb-indent,0px);min-width:0;border-radius:6px}
.tbRow:hover{background:var(--tb-hover)}.tbRowBtn{font-size:12px!important;line-height:24px;text-align:left;padding:0;background:none;border:0;min-width:0;border-radius:4px}
.tbRowBtn:hover{color:var(--tb-accent)}.tbRowTitle{font-size:12px;word-break:break-word;overflow-wrap:anywhere;line-height:24px}
.tbRow[data-status="done"] .tbRowTitle{color:var(--tb-muted);text-decoration:line-through}.tbRow[data-status="dropped"] .tbRowTitle{color:var(--tb-muted)}
.tbFoldSm{justify-content:center;width:12px;height:24px}.tbFoldSpacer{width:12px;height:24px}.tbChild:has(>.tbGrandChildren)::before{content:"";position:absolute;top:33px;bottom:6px;left:calc(var(--tb-indent,0px) + 24px);width:1px;background:var(--tb-line);pointer-events:none}
.tbAddChild{display:flex;gap:5px;flex-wrap:wrap;align-items:center;padding:7px 0 2px;min-width:0}.tbAddChild .tbInput{flex:1 1 100px;min-width:80px}.tbAddChild .tbBtn{min-height:28px;padding:4px 7px;font-size:11px!important}
.tbAddChild .tbAddCancel{padding:4px;border:0;background:none;border-radius:4px;color:var(--tb-muted)!important}
.tbInput,.tbArea,.tbSelect{width:100%;min-width:0;border:1px solid var(--tb-line);border-radius:6px;padding:7px 9px;background:var(--tb-surface);font-size:12px!important;color:var(--tb-ink)}
.tbInput::placeholder,.tbArea::placeholder{color:var(--tb-muted)}.tbArea{resize:vertical;line-height:1.8}
.tbHelp,.tbSub{font-size:11px;color:var(--tb-muted);font-weight:400;line-height:1.8}.tbName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;max-width:100%}
.tbEmpty{padding:22px 8px;color:var(--tb-secondary);font-size:12px;text-align:center;line-height:1.8}.tbErr{color:var(--tb-danger);font-size:12px;padding:8px 16px;background:color-mix(in srgb,var(--tb-danger) 7%,var(--tb-surface));border-radius:6px;overflow-wrap:anywhere}.tbOk{font-size:11px;color:var(--tb-success);padding:6px 0}
.tbFooter{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 24px;color:var(--tb-muted);font-size:10px;border-top:1px solid var(--tb-line);flex-wrap:wrap;background:var(--tb-canvas)}
.tbDragging{opacity:.45}.tbDragging .tbGrip{cursor:grabbing!important}.tbDropBefore{box-shadow:inset 0 2px var(--tb-accent)}.tbDropAfter{box-shadow:inset 0 -2px var(--tb-accent)}.tbDropInto{outline:2px solid var(--tb-accent);outline-offset:-2px;background:var(--tb-accent-soft)}.tbDropPending{outline:2px dashed var(--tb-accent);outline-offset:-2px}
.tbGroupOver{border-style:dashed;border-color:var(--tb-accent);background:color-mix(in srgb,var(--tb-accent-soft) 45%,transparent)}
/* A single bounded root-level popover avoids nested-card clipping and z-order ambiguity. */
.tbPopover{position:absolute;z-index:80;width:190px;max-width:calc(100% - 16px);background:var(--tb-surface);border:1px solid var(--tb-line);border-radius:8px;padding:5px;box-shadow:var(--tb-shadow);overflow:auto}
.tbStatusMenu{width:154px}.tbMenuItem,.tbStatusItem{display:flex;align-items:center;gap:8px;width:100%;border:0;border-radius:5px;background:none;padding:8px;font-size:12px!important;line-height:1.5;text-align:left;white-space:nowrap;color:var(--tb-secondary)!important}
.tbMenuItem:hover,.tbStatusItem:hover,.tbMenuItem:focus-visible,.tbStatusItem:focus-visible{background:var(--tb-hover)}.tbMenuItem .tbIcon{width:14px;height:14px}.tbStatusItemActive{font-weight:600;color:var(--tb-ink)!important}.tbMenuRule{height:1px;margin:4px;background:var(--tb-subtle)}
.tbDialogShade{position:absolute;inset:var(--tb-bar-h,60px) 0 0;z-index:100;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:28px 16px;background:#26355330;backdrop-filter:blur(2px)}
.tbDialog{width:440px;max-width:100%;background:var(--tb-surface);border:1px solid var(--tb-line);border-radius:12px;box-shadow:var(--tb-shadow);padding:22px;display:flex;flex-direction:column;gap:15px;min-width:0;margin:auto 0}
.tbDialogTitle{margin:0;font-size:17px;font-weight:600}.tbDialog label{display:flex;flex-direction:column;gap:6px;font-size:11px;color:var(--tb-secondary)}.tbDialogActions{display:flex;align-items:center;gap:7px;justify-content:flex-end;padding-top:4px}.tbDialogText{margin:0;font-size:12px;line-height:1.9;color:var(--tb-secondary);overflow-wrap:anywhere}.tbDialog .tbDanger{border-color:var(--tb-danger);background:var(--tb-danger);color:white!important}
.tbDetailHeader{margin-bottom:24px;border-bottom:1px solid var(--tb-line);padding-bottom:22px}.tbBreadcrumb{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px}.tbBack{display:inline-flex;align-items:center;gap:5px;border:0;background:none;color:var(--tb-secondary)!important;padding:0;font-size:11px!important}.tbBack .tbIcon{width:13px;height:13px}
.tbDetailTitleLine{display:flex;align-items:flex-start;gap:10px;min-width:0}.tbDetailTitle{flex:1 1 auto;min-width:0;padding:0;font-size:22px!important;line-height:30px;font-weight:600;letter-spacing:-.5px;border:1px solid transparent;border-radius:5px;background:none;color:var(--tb-ink)}.tbDetailTitle:hover{border-color:var(--tb-line)}.tbDetailTitleLine .tbStatus{margin-top:4px}.tbDetailTitleLine .tbMenuTrigger{margin-top:4px;opacity:1}
.tbDetailMeta{display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--tb-muted);margin-top:9px}.tbDetailGrid{display:grid;grid-template-columns:minmax(0,1.06fr) minmax(0,1fr);gap:26px;align-items:start;min-width:0}.tbDetailColumn{min-width:0}
.tbSection{margin-bottom:23px}.tbSectionHeader{display:flex;align-items:center;gap:8px;margin-bottom:12px;min-width:0}.tbSectionHeader h2{font-size:13px;font-weight:600;margin:0}.tbSectionHeader .tbSub{font-size:10px}.tbSectionHeader .tbInlineAdd{margin-left:auto}.tbNote{border:0;background:var(--tb-surface);min-height:100px;resize:vertical;font-size:12px!important;line-height:1.85;padding:0;outline-offset:5px!important}
.tbDetailTree{padding:10px 14px}.tbDomain{display:flex;flex-direction:column;gap:12px}.tbDomainHeader{display:flex;align-items:center;gap:9px;min-width:0}.tbFolderTile{display:grid;place-items:center;width:32px;height:32px;border-radius:7px;flex:0 0 auto;background:var(--tb-hover);color:var(--tb-secondary)}
.tbDomainName{font-size:12px;font-weight:550;overflow-wrap:anywhere;min-width:0}.tbDomainPath{font-size:10px;color:var(--tb-muted);overflow-wrap:anywhere}.tbDomainControls{display:flex;gap:6px;flex-wrap:wrap}.tbDomainControls .tbBtn{font-size:11px!important;min-height:28px;padding:4px 7px}
.tbFileList{display:flex;flex-direction:column;gap:2px;max-height:210px;overflow:auto;min-width:0}.tbFileBtn{display:flex;align-items:center;gap:6px;width:100%;font-size:12px!important;line-height:1.5;padding:6px;border-radius:5px;border:0;background:none;text-align:left;min-width:0;color:var(--tb-secondary)!important}.tbFileBtn .tbIcon{width:13px;height:13px}.tbFileBtn:hover{background:var(--tb-hover)}.tbFileBtn[aria-current="true"]{background:var(--tb-accent-soft);color:var(--tb-accent)!important}
.tbTabs{display:flex;align-items:center;gap:5px;flex-wrap:wrap;padding:9px 0;border-top:1px solid var(--tb-subtle);border-bottom:1px solid var(--tb-subtle)}.tbTab{font-size:11px!important;background:none;border:0;border-radius:4px;padding:4px 7px;color:var(--tb-secondary)!important}.tbTab[aria-selected="true"]{background:var(--tb-accent-soft);color:var(--tb-accent)!important}.tbEditor{width:100%;min-width:0;min-height:260px;resize:vertical;white-space:pre;overflow:auto;border:1px solid var(--tb-line);border-radius:7px;padding:10px;font:12px/1.7 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace!important;background:var(--tb-surface)}
.tbDoc{font-size:12px;overflow-wrap:anywhere;min-width:0}.tbDoc .tbH{margin:12px 0 6px;line-height:1.4;font-weight:600}.tbDoc h1.tbH{font-size:19px}.tbDoc h2.tbH{font-size:17px}.tbDoc h3.tbH{font-size:15px}.tbDoc h4.tbH,.tbDoc h5.tbH,.tbDoc h6.tbH{font-size:13px}.tbDoc .tbP{margin:6px 0}.tbDoc .tbList{padding-left:20px;margin:6px 0}.tbDoc .tbQuote{padding:4px 10px;border-left:2px solid var(--tb-line);margin:8px 0;color:var(--tb-secondary)}
.tbDoc .tbCode,.tbCodeBox{font:12px/1.7 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--tb-hover);padding:10px;border-radius:7px;overflow:auto;max-width:100%;margin:8px 0}.tbCodeBox{white-space:pre;max-height:480px;min-width:0}.tbDoc code{font:12px ui-monospace,Menlo,monospace;background:var(--tb-hover);padding:1px 4px;border-radius:4px}.tbDoc .tbCode code{background:none;padding:0}.tbDoc .tbTable{border-collapse:collapse;width:100%;font-size:12px;margin:10px 0}.tbDoc .tbTable td,.tbDoc .tbTable th{border:1px solid var(--tb-line);padding:5px 8px;text-align:left}.tbDoc .tbHr{border:0;border-top:1px solid var(--tb-line);margin:14px 0}.tbDoc a{color:var(--tb-accent)}
.tbCmt{color:var(--tb-muted);font-style:italic}.tbStr{color:#248259}.tbKw{color:#8466c7}.tbNum{color:#a77936}
.tbChat{display:none;position:absolute;top:var(--tb-bar-h,60px);right:0;bottom:0;z-index:40;width:min(400px,86%);max-width:100%;min-width:0;background:var(--tb-surface);border-left:1px solid var(--tb-line);box-shadow:-12px 0 28px #26365a10;flex-direction:column}
.tbChatOpen{display:flex}.tbChatBar{display:flex;align-items:center;gap:8px;padding:12px 15px;border-bottom:1px solid var(--tb-line);flex:0 0 auto;font-size:12px;font-weight:600}.tbChatBar .tbMenuTrigger{margin-left:auto;opacity:1}.tbChatBody{flex:1 1 auto;min-width:0;min-height:0;overflow:auto;display:flex;flex-direction:column}.tbChatBody > *{flex:1 1 auto;min-height:0}.tbChatInit{padding:30px 20px;line-height:1.9;display:flex;flex-direction:column;gap:12px;font-size:12px;color:var(--tb-secondary)}
.tbWrap{display:flex;align-items:center;gap:7px;flex-wrap:wrap;min-width:0}.tbHead{display:flex;flex-direction:column;gap:6px;min-width:0}.tbSep{opacity:.4}.tbMuted{color:var(--tb-muted)}
@container tb-body (max-width:820px){.tbDetailGrid{grid-template-columns:minmax(0,1fr)}}
@container tb-body (max-width:520px){.tbBar{padding:10px 12px;gap:7px}.tbBarPage{display:none}.tbBarActions{gap:4px}.tbBarActions .tbBtn{padding:5px 7px;font-size:11px!important}.tbBarActions .tbBtnPrimary .tbIcon{display:none}.tbScroll{padding:16px 12px 22px}.tbGroups{gap:14px}.tbFooter{padding:9px 12px}.tbDetailTitle{font-size:19px!important}.tbDetailGrid{gap:0}.tbItem{padding:11px 10px}.tbDialogShade{padding:12px}.tbDialog{padding:18px}.tbRow{column-gap:2px}.tbDomain{padding:13px}}
@media(prefers-color-scheme:dark){.tbRoot{--tb-canvas:#191c25;--tb-surface:#222631;--tb-ink:#e1e5ef;--tb-secondary:#abb4c5;--tb-muted:#8793a8;--tb-line:#353c4b;--tb-subtle:#2d3443;--tb-hover:#2d3342;--tb-accent:#a19df7;--tb-accent-soft:#343353;--tb-success:#86c5a0;--tb-success-soft:#263d33;--tb-ongoing:#87cecb;--tb-ongoing-soft:#263f40;--tb-danger:#e18b90;--tb-shadow:0 9px 28px #0006}.tbStr{color:#89cba6}.tbKw{color:#b9a0ed}.tbNum{color:#d4b47f}}
.tbViewNav{display:inline-flex;gap:3px;align-items:center;padding:3px;border:1px solid var(--tb-line);border-radius:7px;background:var(--tb-canvas)}
.tbViewTab{border:0;border-radius:4px;background:none;color:var(--tb-secondary)!important;font-size:12px!important;line-height:22px;padding:1px 9px;white-space:nowrap}
.tbViewTab:hover{background:var(--tb-hover)}.tbViewTabActive{background:var(--tb-surface);color:var(--tb-accent)!important;box-shadow:0 1px 3px #26365a12;font-weight:600}
.tbGanttPage,.tbCalendarPage{flex:1 1 auto;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:hidden}.tbGanttPage>.tbErr,.tbCalendarPage>.tbErr{margin:12px 20px 0}
.tbPlanSection{margin-bottom:22px;min-width:0}.tbSectionTitle{font-size:12px;font-weight:600;margin:0}.tbPlanCard{padding:14px}
.tbPlanOverview{display:flex;align-items:start;gap:10px;justify-content:space-between}.tbPlanOverviewBody{display:flex;flex-direction:column;gap:4px;min-width:0;overflow-wrap:anywhere}
.tbPlanOverviewBody>strong{font-size:12px;font-weight:550}.tbPlanAssignee{font-size:12px;color:var(--tb-secondary);white-space:pre-wrap;overflow-wrap:anywhere}.tbPlanCard p{margin:9px 0 0}
.tbPlanForm{display:flex;flex-direction:column;gap:12px}.tbPlanDates{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.tbPlanField{display:flex;flex-direction:column;gap:5px;font-size:11px;color:var(--tb-secondary);min-width:0}
.tbPlanActions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.tbPlanForm .tbErr{margin-top:0;white-space:pre-line}.tbPlanForm .tbInput{color-scheme:light dark}
@container tb-body (max-width:520px){.tbViewTab{padding:1px 7px}.tbPlanDates{grid-template-columns:minmax(0,1fr)}.tbPlanOverview{flex-wrap:wrap}.tbPlanCard{padding:12px}}
${GANTT_CSS}
${AI_SCHEDULE_CSS}
${AI_PLANNING_CSS}
${CALENDAR_CSS}
@media(prefers-reduced-motion:reduce){.tbRoot *{scroll-behavior:auto!important}}
`
