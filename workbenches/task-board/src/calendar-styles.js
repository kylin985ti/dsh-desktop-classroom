import { CALENDAR_WEEK_HEIGHT } from './calendar-window-model.js'

export const CALENDAR_CSS = `
/* Scoped to the task workbench; month scrolling never reaches the app shell. */
.tbCalendar{display:flex;flex:1 1 auto;flex-direction:column;position:relative;isolation:isolate;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;overflow:clip;padding:16px 24px 14px;color:var(--tb-ink);background:var(--tb-canvas);container-type:inline-size;container-name:tb-calendar}
.tbCalendar[hidden]{display:none}
.tbCalendar,.tbCalendar *{box-sizing:border-box}
.tbCalendar button{font:inherit;cursor:pointer}
.tbCalendar button[disabled]{cursor:default;opacity:.5}
.tbCalendar :is(button,input,select,[tabindex]):focus-visible{outline:2px solid var(--tb-accent);outline-offset:-2px}
.tbCalendarIcon{width:14px;height:14px;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.tbCalendarToolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:0 0 auto;flex-wrap:wrap;min-width:0;padding:0 1px 13px}
.tbCalendarScope{display:flex;flex:1 1 180px;flex-direction:column;gap:2px;min-width:0}
.tbCalendarScopeTitle{margin:0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600;line-height:21px}
.tbCalendarScopeCaption{font-size:10px;line-height:17px;color:var(--tb-muted);font-variant-numeric:tabular-nums}
.tbCalendarToolbarActions{display:flex;align-items:center;gap:9px;flex-wrap:wrap;min-width:0}
.tbCalendarControl{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:0;min-height:30px;padding:5px 9px;border:1px solid var(--tb-line);border-radius:6px;background:var(--tb-surface);color:var(--tb-secondary)!important;font-size:11px!important;line-height:18px;white-space:nowrap}
.tbCalendarControl:hover:not([disabled]){background:var(--tb-hover);border-color:color-mix(in srgb,var(--tb-accent) 24%,var(--tb-line))}
.tbCalendarSourcesToggle{display:none}
.tbCalendarSummaryToggle{display:inline-flex;align-items:center;gap:6px;min-height:30px;font-size:10px;line-height:18px;color:var(--tb-secondary);white-space:nowrap;cursor:pointer}
.tbCalendar input[type="checkbox"]{width:13px;height:13px;margin:0;flex:0 0 auto;accent-color:var(--tb-accent);cursor:pointer}
.tbCalendar input[type="checkbox"]:disabled{cursor:default}
.tbCalendarStatusFilter{min-width:0;max-width:140px;height:30px;border:1px solid var(--tb-line);border-radius:6px;padding:3px 22px 3px 8px;background:var(--tb-surface);color:var(--tb-secondary);font-size:10px!important;line-height:20px;color-scheme:light dark}
.tbCalendarBody{display:grid;grid-template-columns:206px minmax(0,1fr);gap:18px;flex:1 1 auto;min-width:0;min-height:0;position:relative;overflow:hidden;overflow:clip}
.tbCalendarSidebar{min-width:0;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--tb-line) transparent;padding:1px 12px 8px 1px;border-right:1px solid var(--tb-line)}
.tbCalendarSourceSection,.tbCalendarUnplannedSection{min-width:0}
.tbCalendarUnplannedSection{margin-top:23px;padding-top:17px;border-top:1px solid var(--tb-line)}
.tbCalendarSideHeading{display:flex;align-items:center;gap:7px;margin:0 0 11px;font-size:11px;line-height:20px;font-weight:600}
.tbCalendarSideHeading>.tbCalendarSourceCount{margin-left:auto}
.tbCalendarOwnSource{display:flex;align-items:center;gap:7px;font-size:11px;line-height:22px;min-width:0}
.tbCalendarOwnSource>.tbCalendarSourceCount{margin-left:auto}
.tbCalendarSourceCount{flex:0 0 auto;padding:0 5px;border-radius:4px;background:var(--tb-subtle);color:var(--tb-secondary);font-size:9px;line-height:17px;font-variant-numeric:tabular-nums}
.tbCalendarTinyTag{display:inline-block;flex:0 0 auto;max-width:42px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 4px;border-radius:3px;border:1px solid var(--tb-line);color:var(--tb-muted);font-size:8px;line-height:14px;font-weight:400}
.tbCalendarSideHelp{margin:5px 0;font-size:10px;line-height:18px;color:var(--tb-muted);overflow-wrap:anywhere}
.tbCalendarMainError{border:1px solid color-mix(in srgb,var(--tb-danger) 18%,var(--tb-line));border-radius:6px;background:color-mix(in srgb,var(--tb-danger) 5%,var(--tb-surface));color:var(--tb-danger);font-size:10px;line-height:18px;padding:7px 8px;overflow-wrap:anywhere}
.tbCalendarMainError{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:0 0 auto;margin-bottom:8px}
.tbCalendarUnplannedList{display:flex;flex-direction:column;gap:3px;margin-top:8px;min-width:0}
.tbCalendarUnplanned{display:flex;align-items:flex-start;gap:7px;width:100%;min-width:0;padding:7px 3px;border:0;border-radius:5px;background:none;color:var(--tb-secondary);font-size:11px!important;line-height:19px;text-align:left}
.tbCalendarUnplanned>.tbCalendarItemDot{margin-top:6px}
.tbCalendarUnplanned>span:last-child{min-width:0;overflow-wrap:anywhere}
.tbCalendarUnplanned:hover{background:var(--tb-hover);color:var(--tb-accent)}
.tbCalendarItemDot{display:inline-block;flex:0 0 auto;width:6px;height:6px;border-radius:50%;background:var(--tb-calendar-color,var(--tb-muted))}
.tbCalendarDiamond{display:inline-block;flex:0 0 auto;width:6px;height:6px;border-radius:1px;transform:rotate(45deg);background:var(--tb-calendar-color,var(--tb-secondary));margin:0 2px}
.tbCalendarMain{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;overflow:clip}
.tbCalendarMonthToolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0;flex:0 0 auto;padding-bottom:8px}
.tbCalendarMonthTitle{display:flex;align-items:center;gap:8px;min-width:0;position:relative}
.tbCalendarMonthTitle h3{margin:0;font-size:17px;line-height:27px;font-weight:600;letter-spacing:-.3px;font-variant-numeric:tabular-nums;white-space:nowrap}
.tbCalendarMonthTitle>span{color:var(--tb-muted);font-size:9px;line-height:16px;white-space:nowrap}
.tbCalendar button.tbCalendarMonthButton{display:inline-flex;align-items:center;gap:7px;min-height:31px;max-width:100%;padding:0 4px 0 0;border:0;border-radius:5px;background:none;color:var(--tb-ink);font:inherit;font-size:inherit!important;font-weight:600;line-height:27px;white-space:nowrap}
.tbCalendarMonthButton:hover{background:var(--tb-hover)}
.tbCalendarMonthButton>span{font-size:13px;line-height:20px;color:var(--tb-muted)}
.tbCalendarMonthPicker{position:absolute;top:calc(100% + 7px);left:0;z-index:45;width:282px;max-width:calc(100cqi - 20px);padding:12px;border:1px solid var(--tb-line);border-radius:8px;background:var(--tb-surface);box-shadow:var(--tb-shadow)}
.tbCalendarPickerHeader{display:flex;align-items:center;gap:5px;min-width:0;margin-bottom:11px}
.tbCalendarPickerYear{display:flex;align-items:center;gap:7px;flex:1 1 auto;min-width:0;color:var(--tb-muted);font-size:10px;line-height:24px}
.tbCalendarPickerYear input{min-width:0;width:76px;height:29px;border:1px solid var(--tb-line);border-radius:5px;padding:3px 6px;background:var(--tb-surface);color:var(--tb-ink);font-size:12px!important;font-variant-numeric:tabular-nums;color-scheme:light dark}
.tbCalendarPickerHeader>.tbCalendarControl{min-height:27px;padding:3px 5px}
.tbCalendarPickerHeader>.tbCalendarClose{width:24px;height:27px;padding:3px}
.tbCalendarPickerMonths{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}
.tbCalendar button.tbCalendarPickerMonth{height:32px;min-width:0;border:1px solid transparent;border-radius:5px;background:none;color:var(--tb-secondary);font-size:11px!important;line-height:24px}
.tbCalendar button.tbCalendarPickerMonth:hover:not([disabled]){background:var(--tb-hover)}
.tbCalendar button.tbCalendarPickerMonth[aria-pressed="true"]{background:var(--tb-accent-soft);border-color:color-mix(in srgb,var(--tb-accent) 25%,var(--tb-line));color:var(--tb-accent)}
.tbCalendarPickerError{font-size:10px;color:var(--tb-danger);line-height:18px;margin:0 0 8px}
.tbCalendarMonthNav{display:flex;align-items:center;gap:4px;flex:0 0 auto}
.tbCalendarMonthNav .tbCalendarControl{min-height:28px;padding:4px 7px;line-height:18px}
.tbCalendarMonthNav .tbCalendarIcon{width:12px;height:12px}
.tbCalendarObservation{display:flex;align-items:center;gap:5px 12px;flex-wrap:wrap;min-width:0;flex:0 0 auto;min-height:24px;padding:0 1px 6px;font-size:9px;line-height:17px;color:var(--tb-muted);overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.tbCalendarWarning{color:var(--tb-danger);font-size:10px;line-height:18px;overflow-wrap:anywhere}
.tbCalendarWindowRange{color:var(--tb-secondary)}
.tbCalendarViewport{flex:1 1 auto;min-width:0;min-height:0;position:relative;overflow:auto;overscroll-behavior:contain;border:1px solid var(--tb-line);border-radius:8px;background:var(--tb-surface);scrollbar-width:thin;scrollbar-color:var(--tb-line) transparent;overflow-anchor:none}
.tbCalendarViewport::-webkit-scrollbar{width:8px;height:8px}
.tbCalendarViewport::-webkit-scrollbar-thumb{background:var(--tb-line);border:2px solid var(--tb-surface);border-radius:7px}
.tbCalendarViewport::-webkit-scrollbar-corner{background:var(--tb-surface)}
.tbCalendarCanvas{display:flex;flex-direction:column;position:relative;width:100%;min-width:560px;min-height:100%;--tb-calendar-week-height:${CALENDAR_WEEK_HEIGHT}px}
.tbCalendarWeekdays{position:sticky;top:0;z-index:10;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));flex:0 0 29px;height:29px;background:var(--tb-canvas);border-bottom:1px solid var(--tb-line);font-size:9px;color:var(--tb-secondary);line-height:28px;text-align:center}
.tbCalendarWeekendLabel{color:var(--tb-muted)}
.tbCalendarWeek{position:relative;flex:0 0 var(--tb-calendar-week-height);height:var(--tb-calendar-week-height);min-width:0;min-height:var(--tb-calendar-week-height)}
.tbCalendarWeekHeader{position:absolute;inset:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:8px;height:22px;padding:0 8px;border-top:1px solid var(--tb-subtle);border-bottom:1px solid var(--tb-line);background:var(--tb-canvas);color:var(--tb-muted);font-size:8px;line-height:21px;font-variant-numeric:tabular-nums;white-space:nowrap}
.tbCalendarWeekHeader>span:first-child{font-size:9px;font-weight:500;color:var(--tb-secondary)}
.tbCalendarWeekHeader[data-current-month="true"]>span:first-child{color:var(--tb-accent)}
.tbCalendarWeek[data-month-transition="true"] .tbCalendarWeekHeader{border-top-color:color-mix(in srgb,var(--tb-accent) 30%,var(--tb-line))}
.tbCalendarDayCells{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));position:absolute;inset:22px 0 0;min-width:0}
.tbCalendarDay{position:relative;min-width:0;border-right:1px solid var(--tb-subtle);border-bottom:1px solid var(--tb-line);background:var(--tb-surface)}
.tbCalendarDay:last-child{border-right:0}
.tbCalendarWeek:last-child .tbCalendarDay{border-bottom:0}
.tbCalendarWeekend{background:color-mix(in srgb,var(--tb-canvas) 65%,var(--tb-surface))}
.tbCalendarDaySelected{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--tb-accent) 40%,var(--tb-line));background:color-mix(in srgb,var(--tb-accent-soft) 25%,var(--tb-surface))}
.tbCalendarDayButton{display:flex;align-items:center;justify-content:space-between;gap:5px;width:100%;height:31px;min-width:0;padding:3px 7px;border:0;border-radius:0;background:none;color:var(--tb-secondary);font-size:10px!important;line-height:22px;text-align:left;font-variant-numeric:tabular-nums}
.tbCalendarDayButton>time{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;border-radius:5px}
.tbCalendarDayButton:hover{background:color-mix(in srgb,var(--tb-hover) 65%,transparent)}
.tbCalendarOtherMonth .tbCalendarDayButton{color:var(--tb-muted)}
.tbCalendarAdjacentMonth{font-size:8px;color:var(--tb-muted);white-space:nowrap}
.tbCalendarToday>time{background:var(--tb-accent);color:white;font-weight:600}
.tbCalendarBars{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-template-rows:repeat(4,20px);gap:2px 0;position:absolute;top:54px;right:0;left:0;pointer-events:none;min-width:0}
.tbCalendarBar{display:flex;align-items:center;gap:4px;min-width:0;height:20px;margin:0 3px;padding:0 5px;pointer-events:auto;overflow:hidden;border:1px solid color-mix(in srgb,var(--tb-calendar-color) 44%,var(--tb-line));border-left:2px solid var(--tb-calendar-color);border-radius:4px;background:color-mix(in srgb,var(--tb-calendar-color) 12%,var(--tb-surface));color:var(--tb-ink);font-size:10px!important;line-height:18px;text-align:left}
.tbCalendarBar:hover{background:color-mix(in srgb,var(--tb-calendar-color) 23%,var(--tb-surface));border-color:var(--tb-calendar-color)}
.tbCalendarBarTitle{display:block;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tbCalendarBar[data-auto="true"]{border-style:dashed;border-left-style:solid;background:color-mix(in srgb,var(--tb-calendar-color) 5%,var(--tb-surface))}
.tbCalendarBar[data-status="done"] .tbCalendarBarTitle{text-decoration:line-through;text-decoration-color:color-mix(in srgb,var(--tb-calendar-color) 40%,transparent)}
.tbCalendarBar[data-status="dropped"]{opacity:.72}
.tbCalendarBar[data-kind="deadline"]{border:0;background:none;box-shadow:none;color:var(--tb-calendar-color)}
.tbCalendarBar[data-kind="deadline"]:hover{background:color-mix(in srgb,var(--tb-calendar-color) 8%,var(--tb-surface))}
.tbCalendarBar[data-kind="deadline"] .tbCalendarDiamond{width:7px;height:7px}
.tbCalendarBar>.tbCalendarTinyTag{border:0;padding:0 1px;font-size:8px;color:var(--tb-secondary);line-height:14px}
.tbCalendarContinuesBefore{border-top-left-radius:0;border-bottom-left-radius:0;margin-left:0}
.tbCalendarContinuesAfter{border-top-right-radius:0;border-bottom-right-radius:0;margin-right:0}
.tbCalendarOverflow{position:absolute;left:5px;right:5px;bottom:2px;display:block;min-width:0;max-width:calc(100% - 10px);min-height:16px;padding:0 3px;border:0;border-radius:3px;background:none;color:var(--tb-muted);font-size:9px!important;line-height:16px;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tbCalendarOverflow:hover{background:var(--tb-accent-soft);color:var(--tb-accent)}
.tbCalendarFooter{display:flex;align-items:flex-start;justify-content:space-between;gap:5px 12px;flex:0 0 auto;flex-wrap:wrap;min-width:0;padding:8px 1px 0;color:var(--tb-muted);font-size:9px;line-height:17px}
.tbCalendarLegend{display:flex;align-items:center;gap:5px 10px;flex-wrap:wrap;min-width:0}
.tbCalendarLegend>span{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
.tbCalendarLegend .tbCalendarItemDot{width:5px;height:5px}
.tbCalendarLegend .tbCalendarDiamond{width:5px;height:5px}
/* The nonmodal drawer occupies only the measured month viewport, never navigation. */
.tbCalendarDetail{position:absolute;top:var(--tb-calendar-detail-top,120px);right:24px;bottom:var(--tb-calendar-detail-bottom,14px);z-index:30;display:flex;flex-direction:column;width:320px;max-width:calc(100% - 24px);min-width:0;min-height:0;overflow:hidden;border:1px solid var(--tb-line);border-radius:9px;background:var(--tb-surface);box-shadow:-10px 0 32px #26365a18}
.tbCalendarDetailHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex:0 0 auto;min-width:0;padding:15px 16px 12px;border-bottom:1px solid var(--tb-line)}
.tbCalendarDetailHeader>div{min-width:0}
.tbCalendarDetailHeader h3{margin:0;font-size:15px;font-weight:600;line-height:24px;overflow-wrap:anywhere}
.tbCalendarDetailHeader span{display:block;font-size:10px;line-height:18px;color:var(--tb-muted);overflow-wrap:anywhere}
.tbCalendarClose{display:flex;align-items:center;justify-content:center;flex:0 0 auto;width:28px;height:28px;padding:4px;border:0;border-radius:5px;background:none;color:var(--tb-muted)}
.tbCalendarClose:hover{background:var(--tb-hover);color:var(--tb-ink)}
.tbCalendarClose>.tbCalendarIcon{width:14px;height:14px}
.tbCalendarDetailBody{min-width:0;min-height:0;flex:1 1 auto;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;padding:10px 12px 16px}
.tbCalendarDayList{display:flex;flex-direction:column;gap:4px;min-width:0}
.tbCalendarDayItem{display:flex;align-items:flex-start;gap:7px;width:100%;min-width:0;padding:9px 7px;border:1px solid transparent;border-radius:6px;background:none;color:var(--tb-ink);font-size:11px!important;line-height:18px;text-align:left}
.tbCalendarDayItem:hover{background:var(--tb-hover)}
.tbCalendarDayItem[aria-pressed="true"]{border-color:var(--tb-line);background:var(--tb-canvas)}
.tbCalendarDayItem>.tbCalendarItemDot,.tbCalendarDayItem>.tbCalendarDiamond{margin-top:6px}
.tbCalendarDayItem>.tbCalendarTinyTag{margin-top:1px}
.tbCalendarDayItemText{display:flex;flex-direction:column;gap:3px;flex:1 1 auto;min-width:0}
.tbCalendarDayItemText>strong{font-size:11px;line-height:18px;font-weight:550;overflow-wrap:anywhere}
.tbCalendarDayItemText>span{font-size:9px;line-height:16px;color:var(--tb-muted);overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.tbCalendarItemDetail{margin-top:12px;padding:15px 5px 0;border-top:1px solid var(--tb-line);min-width:0}
.tbCalendarItemDetail:first-child{border-top:0;margin-top:0;padding-top:4px}
.tbCalendarDetailEyebrow{display:flex;align-items:center;gap:5px;font-size:9px;line-height:18px;color:var(--tb-muted)}
.tbCalendarDetailEyebrow>.tbCalendarIcon{width:11px;height:11px}
.tbCalendarItemDetail h4{font-size:14px;font-weight:600;line-height:23px;overflow-wrap:anywhere;margin:6px 0 8px}
.tbCalendarDetailStatus{display:inline-flex;align-items:center;gap:5px;color:var(--tb-secondary);font-size:10px;line-height:18px}
.tbCalendarDetailFields{display:grid;grid-template-columns:36px minmax(0,1fr);gap:6px 10px;margin:12px 0;font-size:11px;line-height:19px;font-variant-numeric:tabular-nums}
.tbCalendarDetailFields dt{color:var(--tb-muted);margin:0}
.tbCalendarDetailFields dd{color:var(--tb-secondary);margin:0;min-width:0;overflow-wrap:anywhere}
.tbCalendarDetailNote{font-size:10px;color:var(--tb-muted);line-height:19px;margin:8px 0;overflow-wrap:anywhere}
.tbCalendarDetailEmpty{font-size:11px;line-height:21px;color:var(--tb-muted);padding:13px 5px;margin:0;overflow-wrap:anywhere}
.tbCalendarDetailActions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:15px}
.tbCalendarOpenTask{background:var(--tb-accent-soft);border-color:color-mix(in srgb,var(--tb-accent) 20%,var(--tb-line));color:var(--tb-accent)!important}
/* Outrank the shared form-control font reset without changing the host style. */
.tbCalendar button.tbCalendarControl{line-height:18px}
.tbCalendar button.tbCalendarTextButton{line-height:18px}
.tbCalendar button.tbCalendarUnplanned{line-height:19px;color:var(--tb-secondary)}
.tbCalendar button.tbCalendarUnplanned:hover{color:var(--tb-accent)}
.tbCalendar button.tbCalendarDayButton{line-height:22px;color:var(--tb-secondary)}
.tbCalendarOtherMonth button.tbCalendarDayButton{color:var(--tb-muted)}
.tbCalendar button.tbCalendarBar{line-height:18px;color:var(--tb-ink)}
.tbCalendar button.tbCalendarBar[data-source="system"]{color:var(--tb-secondary)}
.tbCalendar button.tbCalendarBar[data-kind="deadline"]{color:var(--tb-calendar-color)}
.tbCalendar button.tbCalendarOverflow{line-height:16px;color:var(--tb-muted)}
.tbCalendar button.tbCalendarOverflow:hover{color:var(--tb-accent)}
.tbCalendar button.tbCalendarDayItem{line-height:18px;color:var(--tb-ink)}
.tbCalendar button.tbCalendarClose{color:var(--tb-muted)}
.tbCalendar button.tbCalendarClose:hover{color:var(--tb-ink)}
@container tb-calendar (max-width:1000px){.tbCalendarBody{grid-template-columns:186px minmax(0,1fr);gap:14px}.tbCalendarSidebar{padding-right:10px}.tbCalendarToolbarActions{gap:7px}.tbCalendarScope{flex-basis:160px}.tbCalendarLegend{gap:4px 8px}}
@container tb-calendar (max-width:760px){
  .tbCalendarToolbar{gap:8px}.tbCalendarScope{flex-basis:100%}.tbCalendarToolbarActions{width:100%;gap:7px}
  .tbCalendarBody{display:block}.tbCalendarMain{height:100%}.tbCalendarSourcesToggle{display:inline-flex}
  .tbCalendarSidebar{display:none}.tbCalendar[data-sidebar-open="true"] .tbCalendarSidebar{display:block;position:absolute;inset:0 auto 0 0;z-index:20;width:240px;max-width:calc(100% - 24px);padding:14px;border:1px solid var(--tb-line);border-radius:8px;background:var(--tb-surface);box-shadow:var(--tb-shadow)}
}
@container tb-calendar (max-width:460px){
  .tbCalendarToolbarActions{gap:5px}.tbCalendarControl{padding:4px 7px;font-size:10px!important;min-height:29px}
  .tbCalendarSummaryToggle{font-size:9px;gap:4px}.tbCalendarStatusFilter{font-size:9px!important;max-width:114px;height:29px;padding-left:6px}
  .tbCalendarMonthTitle h3{font-size:15px;line-height:26px}.tbCalendarMonthTitle>span{display:none}.tbCalendarMonthToolbar{gap:7px}
  .tbCalendarMonthNav{gap:3px}.tbCalendarMonthNav .tbCalendarControl{padding:4px 6px}.tbCalendarMonthNav .tbCalendarIcon{width:11px;height:11px}
  .tbCalendarObservation{font-size:9px;gap:3px 7px}.tbCalendarFooter{font-size:9px;gap:5px}.tbCalendarLegend{gap:3px 8px}
  .tbCalendarDetail{right:10px;max-width:calc(100% - 20px);width:320px}
}
@container tb-body (max-width:760px){.tbCalendar{padding:12px 14px 10px}.tbCalendarDetail{right:14px}}
@container tb-body (max-width:460px){.tbCalendar{padding:10px 10px 8px}.tbCalendarDetail{right:10px}}
@media(prefers-reduced-motion:reduce){.tbCalendarViewport{scroll-behavior:auto}}
`
