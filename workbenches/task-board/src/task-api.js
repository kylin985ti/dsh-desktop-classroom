/** Shared client transport, deliberately separate so mixed-version safety is directly tested. */
export async function loadTasks(fetcher = globalThis.fetch) {
  const response = await fetcher('/api/dsh-task-board/state', { credentials: 'same-origin' })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`${data?.error || '读取任务失败'}（HTTP ${response.status}）`)
  if (!Array.isArray(data?.tasks)) throw new Error('任务数据格式异常，禁止以空列表覆盖。请检查数据或重新加载。')
  if (data.scheduleProtocol !== 1) throw new Error('计划服务尚未载入新版。请 ⌘Q 完全退出并重开 DSH Desktop；为避免旧服务丢失日期与负责人，当前禁止保存。')
  return data.tasks.map(task => task.status === undefined ? { ...task, status: 'todo' } : task)
}

export async function saveTasks(tasks, fetcher = globalThis.fetch) {
  const response = await fetcher('/api/dsh-task-board/state/write', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${data?.error || '保存任务失败'}（HTTP ${response.status}）`)
  return data
}
