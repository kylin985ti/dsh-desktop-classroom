export const GANTT_CSS = `
/* One bounded scroll surface owns both axes; cells and the date header share it. */
.tbGantt{
  --tb-gantt-left:min(468px,58cqi);--tb-gantt-indent:min(60px,calc(var(--tb-gantt-depth,0) * 12px));
  display:flex;flex:1 1 auto;flex-direction:column;position:relative;isolation:isolate;
  width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;padding:16px 24px 14px;
  color:var(--tb-ink);background:var(--tb-canvas);container-type:inline-size;container-name:tb-gantt;
}
.tbGantt[data-has-owners="false"]{--tb-gantt-left:min(400px,58cqi)}
.tbGantt,.tbGantt *{box-sizing:border-box}
.tbGantt button{font:inherit;cursor:pointer}
.tbGantt button[disabled]{cursor:default;opacity:.5}
.tbGantt :is(button,[tabindex]):focus-visible{outline:2px solid var(--tb-accent);outline-offset:-2px}
.tbGanttIcon{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;flex:0 0 auto;pointer-events:none}
.tbGanttToolbar{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;gap:12px;min-width:0;padding:0 1px 13px;flex-wrap:wrap}
.tbGanttScope{display:flex;flex:1 1 240px;flex-direction:column;gap:3px;min-width:0}
.tbGanttScopeLine{display:flex;align-items:center;gap:8px;min-width:0}
.tbGanttScopeTitle{margin:0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600;line-height:21px;letter-spacing:-.1px}
.tbGanttCount{flex:0 0 auto;border-radius:4px;padding:0 5px;font-size:10px;line-height:18px;color:var(--tb-secondary);background:var(--tb-subtle);font-variant-numeric:tabular-nums}
.tbGanttRange{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:10px;color:var(--tb-muted);line-height:17px;font-variant-numeric:tabular-nums}
.tbGanttActions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.tbGanttControl{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:30px;padding:5px 9px;border:1px solid var(--tb-line);border-radius:6px;background:var(--tb-surface);color:var(--tb-secondary)!important;font-size:11px!important;line-height:18px;white-space:nowrap}
.tbGanttControl:hover:not([disabled]){background:var(--tb-hover);border-color:color-mix(in srgb,var(--tb-accent) 25%,var(--tb-line))}
.tbGanttCompletedToggle[aria-pressed="true"]{background:var(--tb-accent-soft);border-color:color-mix(in srgb,var(--tb-accent) 25%,var(--tb-line));color:var(--tb-accent)!important}
.tbGanttAI{background:var(--tb-accent-soft);border-color:color-mix(in srgb,var(--tb-accent) 20%,var(--tb-line));color:var(--tb-accent)!important}
.tbGanttAI:hover:not([disabled]){background:color-mix(in srgb,var(--tb-accent) 14%,var(--tb-surface))}
.tbGanttViewport{display:block;flex:1 1 auto;min-width:0;min-height:0;position:relative;overflow:auto;overscroll-behavior:contain;border:1px solid var(--tb-line);border-radius:8px;background:var(--tb-surface);scrollbar-width:thin;scrollbar-color:var(--tb-line) transparent;overflow-anchor:none}
.tbGanttViewport::-webkit-scrollbar{height:9px;width:9px}
.tbGanttViewport::-webkit-scrollbar-thumb{background:var(--tb-line);border:2px solid var(--tb-surface);border-radius:8px}
.tbGanttViewport::-webkit-scrollbar-corner{background:var(--tb-surface)}
.tbGanttCanvas{position:relative;width:calc(var(--tb-gantt-left) + var(--tb-gantt-track));min-width:100%;min-height:100%}
.tbGanttHeader,.tbGanttRow{display:grid;grid-template-columns:var(--tb-gantt-left) var(--tb-gantt-track);width:100%;min-width:0}
.tbGanttHeader{position:sticky;top:0;z-index:10;height:62px;background:var(--tb-canvas);border-bottom:1px solid var(--tb-line)}
.tbGanttRow{--tb-gantt-indent:min(60px,calc(var(--tb-gantt-depth,0) * 12px));position:relative;height:var(--tb-gantt-row-height,52px);border-bottom:1px solid var(--tb-subtle)}
.tbGanttRow:last-child{border-bottom:0}
.tbGanttLeft{display:grid;grid-template-columns:minmax(0,1fr) 70px 168px;grid-template-areas:"task owner dates";align-items:center;position:sticky;left:0;z-index:4;min-width:0;height:100%;background:var(--tb-surface);border-right:1px solid var(--tb-line)}
.tbGantt[data-has-owners="false"] .tbGanttLeft{grid-template-columns:minmax(0,1fr) 168px;grid-template-areas:"task dates"}
.tbGanttLeftHead{z-index:12;background:var(--tb-canvas);color:var(--tb-secondary);font-size:10px;font-weight:550}
.tbGanttNameHead{grid-area:task;padding-left:14px;min-width:0;white-space:nowrap}
.tbGanttOwnerHead{grid-area:owner;padding:0 5px;min-width:0}
.tbGanttDatesHead{grid-area:dates;display:grid;grid-template-columns:1fr 1fr;text-align:center;gap:2px;padding:0 5px;min-width:0}
.tbGanttCompactOwnerHead{display:none}
.tbGanttTask{grid-area:task;display:flex;align-items:center;gap:5px;min-width:0;max-width:100%;height:100%;padding:0 5px 0 calc(7px + var(--tb-gantt-indent))}
.tbGanttFold,.tbGanttFoldSpace{display:inline-flex;align-items:center;justify-content:center;flex:0 0 17px;width:17px;height:26px;min-width:0;padding:0;border:0;border-radius:4px;background:none;color:var(--tb-muted)!important;font-size:11px!important;line-height:1}
.tbGanttFold:hover{background:var(--tb-subtle);color:var(--tb-accent)!important}
.tbGanttStatusDot{display:inline-block;flex:0 0 6px;width:6px;height:6px;background:var(--tb-gantt-status,var(--tb-muted));border-radius:50%}
.tbGanttRow[data-status="dropped"] .tbGanttStatusDot{background:none;border:1px solid var(--tb-gantt-status)}
.tbGanttRow[data-status="ongoing"] .tbGanttStatusDot{height:9px;border-radius:3px}
.tbGanttTaskTitle{display:block;min-width:0;flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;padding:3px 0;border:0;border-radius:3px;background:none;color:var(--tb-ink);font-size:12px!important;line-height:22px}
button.tbGanttTaskTitle:hover{color:var(--tb-accent)}
.tbGanttRow[data-depth="0"] .tbGanttTaskTitle{font-weight:550}
.tbGanttRow[data-status="done"] .tbGanttTaskTitle,.tbGanttRow[data-status="dropped"] .tbGanttTaskTitle{color:var(--tb-secondary)}
.tbGanttPartialBadge{display:inline-block;flex:0 0 auto;max-width:52px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:1px solid color-mix(in srgb,var(--tb-danger) 18%,var(--tb-line));background:color-mix(in srgb,var(--tb-danger) 6%,var(--tb-surface));border-radius:4px;padding:0 4px;font-size:9px;line-height:16px;color:var(--tb-danger)}
.tbGanttOwner{grid-area:owner;display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 5px;font-size:10px;line-height:18px;color:var(--tb-secondary)}
.tbGanttDatesCell{grid-area:dates;min-width:0;height:100%}
.tbGanttDates{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:center;gap:2px;min-width:0;width:100%;height:100%;padding:3px 5px;border:0;border-radius:0;background:none;color:var(--tb-secondary);font-size:10px!important;line-height:17px;text-align:center;font-variant-numeric:tabular-nums}
button.tbGanttDates:hover:not([disabled]){background:var(--tb-accent-soft);color:var(--tb-accent)}
.tbGanttDate{display:flex;align-items:center;justify-content:center;gap:3px;min-width:0;white-space:nowrap}
.tbGanttDate time{display:block;min-width:0;overflow:hidden;text-overflow:clip}
.tbGanttDateKey{display:none;font-size:8px;line-height:12px;opacity:.65}
.tbGanttDateEmpty{color:var(--tb-muted)}
.tbGanttAutoDates{font-style:italic}
.tbGanttTimeline,.tbGanttCalendar{position:relative;min-width:0;height:100%;background-image:repeating-linear-gradient(to right,var(--tb-subtle) 0,var(--tb-subtle) 1px,transparent 1px,transparent var(--tb-gantt-day)),repeating-linear-gradient(to right,transparent 0,transparent calc(var(--tb-gantt-day) * 5),color-mix(in srgb,var(--tb-canvas) 65%,var(--tb-surface)) calc(var(--tb-gantt-day) * 5),color-mix(in srgb,var(--tb-canvas) 65%,var(--tb-surface)) var(--tb-gantt-week));background-position:0 0,var(--tb-gantt-week-shift) 0}
.tbGanttTimeline{display:flex;align-items:center}
.tbGanttRow:hover .tbGanttLeft,.tbGanttRow:focus-within .tbGanttLeft{background:var(--tb-hover)}
.tbGanttRow:hover .tbGanttTimeline,.tbGanttRow:focus-within .tbGanttTimeline{background-color:color-mix(in srgb,var(--tb-hover) 38%,transparent)}
.tbGanttCalendar{overflow:hidden;background-color:var(--tb-canvas)}
.tbGanttMonths{position:absolute;inset:0 0 auto;height:26px;border-bottom:1px solid var(--tb-line);overflow:hidden}
.tbGanttMonth{position:absolute;top:0;height:26px;border-right:1px solid var(--tb-line);font-size:10px;color:var(--tb-secondary);line-height:25px;overflow:hidden;white-space:nowrap}
.tbGanttMonth > span{position:absolute;top:0}
.tbGanttDays{position:absolute;top:26px;right:0;bottom:0;left:0;overflow:hidden}
.tbGanttDay{position:absolute;top:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;color:var(--tb-secondary);font-variant-numeric:tabular-nums;line-height:13px}
.tbGanttDayNumber{font-size:10px;font-weight:500}
.tbGanttWeekday{font-size:8px;color:var(--tb-muted);line-height:11px}
.tbGanttWeekend{color:var(--tb-muted)}
.tbGanttDayToday{background:var(--tb-accent-soft);color:var(--tb-accent)}
.tbGanttDayToday .tbGanttWeekday{color:var(--tb-accent)}
.tbGanttTodayLine{position:absolute;top:62px;bottom:0;z-index:2;width:1px;background:var(--tb-accent);opacity:.7;pointer-events:none}
.tbGanttTodayMarker{position:absolute;top:0;bottom:0;z-index:2;width:1px;background:var(--tb-accent);pointer-events:none}
.tbGanttTodayMarker > span{position:absolute;top:5px;left:4px;display:block;border-radius:3px;background:var(--tb-accent-soft);padding:0 4px;color:var(--tb-accent);font-size:9px;line-height:17px;white-space:nowrap}
.tbGanttBar,.tbGanttSummary{display:block;position:absolute;top:13px;z-index:3;height:25px;min-width:0;padding:0;text-align:left;white-space:nowrap;font-size:10px!important;line-height:23px;cursor:default}
button.tbGanttBar,button.tbGanttSummary{cursor:pointer}
.tbGanttBar{overflow:hidden;border:1px solid var(--tb-gantt-status);border-radius:4px;background:color-mix(in srgb,var(--tb-gantt-status) 23%,var(--tb-surface));box-shadow:inset 2px 0 var(--tb-gantt-status);color:var(--tb-ink)}
button.tbGanttBar:hover{background:color-mix(in srgb,var(--tb-gantt-status) 32%,var(--tb-surface));box-shadow:inset 2px 0 var(--tb-gantt-status),0 1px 4px color-mix(in srgb,var(--tb-gantt-status) 18%,transparent)}
.tbGanttSummary{border:0;border-top:3px solid var(--tb-gantt-status);border-radius:1px;background:none;color:var(--tb-ink);line-height:19px}
.tbGanttSummary::before,.tbGanttSummary::after{content:"";position:absolute;top:-1px;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:7px solid var(--tb-gantt-status)}
.tbGanttSummary::before{left:-1px}.tbGanttSummary::after{right:-1px}
button.tbGanttSummary:hover{background:color-mix(in srgb,var(--tb-gantt-status) 9%,transparent)}
.tbGanttBarLabel{display:block;width:max-content;max-width:min(240px,100%);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 8px;pointer-events:none}
.tbGanttSummary .tbGanttBarLabel{padding-top:2px}
.tbGanttDeadline{position:absolute;top:12px;z-index:3;display:flex;align-items:center;justify-content:center;width:22px;height:27px;transform:translateX(-50%);padding:0;border:0;border-radius:4px;background:none;color:var(--tb-gantt-status)}
button.tbGanttDeadline:hover{background:color-mix(in srgb,var(--tb-gantt-status) 12%,var(--tb-surface))}
.tbGanttDiamond{display:block;width:11px;height:11px;border-radius:1px;background:var(--tb-gantt-status);transform:rotate(45deg);box-shadow:0 0 0 2px var(--tb-surface)}
.tbGanttDeadlineHint{position:absolute;top:15px;z-index:3;max-width:104px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;border:0;border-radius:3px;background:var(--tb-surface);color:var(--tb-muted);font-size:10px!important;line-height:20px;padding:0 4px}
button.tbGanttDeadlineHint:hover:not([disabled]){background:var(--tb-accent-soft);color:var(--tb-accent)}
.tbGanttEmptyPlan{position:sticky;left:calc(var(--tb-gantt-left) + 12px);z-index:3;display:inline-block;flex:0 0 auto;max-width:calc(100cqi - var(--tb-gantt-left) - 24px);margin-left:12px;padding:3px 5px;border:0;border-radius:4px;background:var(--tb-surface);color:var(--tb-muted);font-size:11px!important;line-height:16px;text-align:left;white-space:normal}
button.tbGanttEmptyPlan:hover:not([disabled]){background:var(--tb-accent-soft);color:var(--tb-accent)}
.tbGanttNoTasks{position:sticky;left:0;max-width:calc(100cqi - 2px);padding:30px 14px;text-align:center;font-size:12px;color:var(--tb-muted)}
.tbGanttFooter{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;padding:8px 2px 0;min-height:24px;font-size:10px;color:var(--tb-muted)}
/* A branch keeps its own rail; status remains on the dot and schedule bar. */
.tbGanttRow{--tb-gantt-group:var(--tb-accent);--tb-gantt-indent:min(80px,calc(var(--tb-gantt-depth,0) * 16px))}
.tbGanttRow[data-group="1"]{--tb-gantt-group:var(--tb-success)}
.tbGanttRow[data-group="2"]{--tb-gantt-group:#9773b6}
.tbGanttRow[data-group="3"]{--tb-gantt-group:#b58a48}
.tbGanttRow .tbGanttTask{position:relative;border-left:3px solid color-mix(in srgb,var(--tb-gantt-group) 65%,var(--tb-line))}
.tbGanttRow[data-parent="true"] .tbGanttLeft{background:color-mix(in srgb,var(--tb-gantt-group) 5%,var(--tb-surface))}
.tbGanttRow[data-parent="true"] .tbGanttTaskTitle{font-weight:650}
.tbGanttBranch{position:absolute;left:calc(2px + var(--tb-gantt-indent) - 12px);top:13px;height:25px;color:var(--tb-secondary);font:17px/25px ui-monospace,monospace;pointer-events:none}
.tbGanttOutline{flex:0 1 auto;max-width:52px;overflow:hidden;text-overflow:ellipsis;color:var(--tb-secondary);font-size:10px;line-height:20px;font-variant-numeric:tabular-nums}
.tbGanttParentBadge{flex:0 0 auto;font-size:9px;line-height:15px;padding:0 3px;border:1px solid var(--tb-line);border-radius:3px;color:var(--tb-secondary)}
.tbGanttHowTo{display:flex;flex:0 0 auto;align-items:baseline;justify-content:space-between;gap:7px;flex-wrap:wrap;padding:0 1px 9px;font-size:10px;line-height:18px;color:var(--tb-secondary)}
.tbGanttGuide{position:relative}.tbGanttGuide>summary{cursor:pointer;color:var(--tb-accent);border-radius:3px}
.tbGanttGuideBody{position:absolute;z-index:25;right:0;top:25px;width:365px;max-width:calc(100cqi - 24px);max-height:55vh;overflow:auto;padding:13px 15px;border:1px solid var(--tb-line);border-radius:8px;background:var(--tb-surface);box-shadow:var(--tb-shadow);color:var(--tb-secondary);font-size:11px;line-height:1.85}
.tbGanttGuideBody p{margin:9px 0 0}.tbGanttGuideTree{display:flex;flex-direction:column;border-left:3px solid var(--tb-accent);padding-left:9px;gap:3px;color:var(--tb-ink)}
.tbGanttGuideTree>span{padding-left:17px}.tbGanttGuideTree>.tbGanttGuideGrandchild{padding-left:34px}
.tbGanttGuideBar{display:flex;justify-content:space-between;gap:10px;border:1px solid var(--tb-accent);background:var(--tb-accent-soft);color:var(--tb-ink);border-radius:4px;margin-top:11px;padding:5px 7px;font-size:10px}
.tbGanttGuideBar strong{font-weight:500}
.tbGanttEditSlot{flex:0 0 auto;min-height:42px}
.tbGantt [data-editable="true"]{cursor:grab;touch-action:none;user-select:none}
.tbGantt [data-editable="true"]:active{cursor:grabbing}
.tbGanttResize{position:absolute;z-index:3;top:10px;width:10px;height:31px;border:1px solid var(--tb-gantt-status);border-radius:3px;background:var(--tb-surface);color:var(--tb-ink)!important;padding:0!important;cursor:ew-resize!important;touch-action:none;user-select:none;opacity:.8;font-size:12px!important;line-height:27px!important}
.tbGanttResize:hover,.tbGanttResize:focus-visible{opacity:1;background:var(--tb-accent-soft)}
.tbGanttRow[data-editing="true"] .tbGanttTimeline{background-color:var(--tb-accent-soft)}
.tbGanttRow[data-editing="true"] :is(.tbGanttBar,.tbGanttSummary,.tbGanttDeadline){outline:2px dashed var(--tb-accent);outline-offset:2px}
.tbGanttEditFeedback{flex:0 0 auto;padding:7px 10px;margin:0 0 8px;border:1px solid var(--tb-line);border-radius:6px;background:var(--tb-accent-soft);color:var(--tb-ink);font-size:11px;line-height:1.8;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.tbGanttEditError{background:color-mix(in srgb,var(--tb-danger) 7%,var(--tb-surface));color:var(--tb-danger);border-color:color-mix(in srgb,var(--tb-danger) 35%,var(--tb-line))}
.tbGanttInvalidGhost{position:absolute;top:9px;height:33px;z-index:3;border:2px dashed var(--tb-danger);background:color-mix(in srgb,var(--tb-danger) 9%,transparent);border-radius:4px;pointer-events:none}
.tbGanttLegend{display:flex;align-items:center;gap:13px;flex-wrap:wrap}
.tbGanttLegend > span{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.tbGanttLegendSummary{display:inline-block;width:16px;height:5px;border:1px solid var(--tb-secondary);border-top-width:2px;border-bottom:0}
.tbGanttLegendDeadline{display:inline-block;width:6px;height:6px;background:var(--tb-secondary);transform:rotate(45deg)}
.tbGanttTooltip{position:absolute;z-index:30;pointer-events:none;width:270px;max-width:calc(100% - 16px);padding:11px 13px;border:1px solid var(--tb-line);border-radius:7px;background:var(--tb-surface);box-shadow:var(--tb-shadow);color:var(--tb-ink);font-size:11px;line-height:18px;overflow-wrap:anywhere}
.tbGanttTooltip > strong{display:block;max-height:60px;overflow:hidden;font-size:12px;font-weight:600;line-height:19px}
.tbGanttTooltipStatus{display:flex;align-items:center;gap:5px;color:var(--tb-secondary);font-size:10px;margin-top:4px}
.tbGanttTooltip dl{display:grid;grid-template-columns:42px minmax(0,1fr);gap:2px 8px;margin:7px 0 0;font-variant-numeric:tabular-nums}
.tbGanttTooltip dt{margin:0;color:var(--tb-muted)}.tbGanttTooltip dd{margin:0;min-width:0;overflow-wrap:anywhere}
.tbGanttTooltipNote{border-top:1px solid var(--tb-subtle);margin-top:7px;padding-top:6px;color:var(--tb-muted);font-size:10px;line-height:16px}
/* Match the host's .tbRoot form-control reset without changing that reset. */
.tbGantt button.tbGanttControl{line-height:18px}
.tbGantt button.tbGanttFold{line-height:1}
.tbGantt button.tbGanttTaskTitle{line-height:22px}
.tbGantt button.tbGanttDates{line-height:17px;color:var(--tb-secondary)}
.tbGantt button.tbGanttAutoDates{font-style:italic}
.tbGantt button.tbGanttBar{line-height:23px;color:var(--tb-ink)}
.tbGantt button.tbGanttSummary{line-height:19px;color:var(--tb-ink)}
.tbGantt button.tbGanttDeadlineHint{line-height:20px;color:var(--tb-muted)}
.tbGantt button.tbGanttEmptyPlan{line-height:16px;color:var(--tb-muted)}

/* Dates stack before the frozen pane can crowd the daily timeline. */
@container tb-gantt (max-width:1000px){
  .tbGanttParentBadge{display:none}
  .tbGanttCanvas{--tb-gantt-left:min(370px,56cqi)}
  .tbGantt[data-has-owners="false"] .tbGanttCanvas{--tb-gantt-left:min(310px,56cqi)}
  .tbGanttLeft{grid-template-columns:minmax(0,1fr) 62px 90px}
  .tbGantt[data-has-owners="false"] .tbGanttLeft{grid-template-columns:minmax(0,1fr) 90px}
  .tbGanttDates{grid-template-columns:minmax(0,1fr);gap:0;align-content:center;padding:3px 5px}
  .tbGanttDatesHead{grid-template-columns:1fr;gap:0;line-height:17px}
  .tbGanttDate{justify-content:flex-start;gap:4px}
  .tbGanttDateKey{display:inline}
  .tbGanttOwner{font-size:10px}
}
@container tb-gantt (max-width:660px){
  .tbGanttToolbar{gap:8px}
  .tbGanttScope{flex-basis:100%}
  .tbGanttActions{gap:5px}
  .tbGanttControl{min-height:29px;padding:4px 7px;font-size:10px!important}
  .tbGanttCanvas,.tbGantt[data-has-owners="false"] .tbGanttCanvas{--tb-gantt-left:min(270px,60cqi)}
  .tbGanttLeft{grid-template-columns:minmax(0,1fr) 87px;grid-template-rows:30px 21px;grid-template-areas:"task dates" "owner dates"}
  .tbGantt[data-has-owners="false"] .tbGanttLeft{grid-template-columns:minmax(0,1fr) 87px;grid-template-rows:1fr;grid-template-areas:"task dates"}
  .tbGanttLeftHead{grid-template-rows:1fr;grid-template-areas:"task dates"}
  .tbGanttTask{--tb-gantt-indent:min(24px,calc(var(--tb-gantt-depth,0) * 8px));gap:4px;padding-right:3px}
  .tbGanttTaskTitle{font-size:11px!important;line-height:22px}
  .tbGanttFold,.tbGanttFoldSpace{flex-basis:15px;width:15px}
  .tbGanttOwner{--tb-gantt-indent:min(24px,calc(var(--tb-gantt-depth,0) * 8px));align-self:start;padding:0 3px 0 calc(32px + var(--tb-gantt-indent));font-size:9px;line-height:16px}
  .tbGanttOwnerHead{display:none}.tbGanttCompactOwnerHead{display:inline;font-weight:400;color:var(--tb-muted);font-size:9px}
  .tbGanttDates{font-size:9px!important}
  .tbGanttPartialBadge{max-width:39px;font-size:8px;padding:0 3px;line-height:15px}
  .tbGanttEmptyPlan{font-size:10px!important;line-height:15px;margin-left:8px;left:calc(var(--tb-gantt-left) + 8px);max-width:calc(100cqi - var(--tb-gantt-left) - 18px)}
  .tbGantt button.tbGanttEmptyPlan{line-height:15px}
}
@container tb-gantt (max-width:420px){
  .tbGanttCanvas,.tbGantt[data-has-owners="false"] .tbGanttCanvas{--tb-gantt-left:min(226px,62cqi)}
  .tbGanttLeft,.tbGantt[data-has-owners="false"] .tbGanttLeft{grid-template-columns:minmax(0,1fr) 78px}
  .tbGanttDates{padding:3px 2px}.tbGanttDate{gap:2px}.tbGanttDateKey{font-size:7px}
  .tbGanttTask{padding-left:calc(3px + var(--tb-gantt-indent));gap:3px}
  .tbGanttOwner{padding-left:calc(26px + var(--tb-gantt-indent))}
  .tbGanttPartialBadge{max-width:30px;line-height:12px;padding:0 2px}
  .tbGanttFooter{font-size:9px}.tbGanttLegend{gap:8px}
}
@container tb-body (max-width:760px){.tbGantt{padding:12px 14px 10px}}
@container tb-body (max-width:460px){.tbGantt{padding:10px 10px 8px}}
@media(prefers-reduced-motion:reduce){.tbGanttViewport{scroll-behavior:auto}}
`
