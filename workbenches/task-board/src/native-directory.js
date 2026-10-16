/** Use the same Desktop chooser seam as DSH's official directory-flow UI. */
export async function pickWorkspaceDirectory(service, desktop = globalThis.__DSH_DIRECTORY_PICKER__) {
  let selected
  if (typeof desktop?.pick === 'function') selected = await desktop.pick()
  else {
    const workspace = service?.ctx?.uiWorkspace
    if (typeof workspace?.pickDirectory !== 'function') throw new Error('当前宿主未提供目录选择器，无法选择工作域。')
    selected = await workspace.pickDirectory()
  }
  // A failed or canceled native pick must never open a second, fallback dialog.
  if (selected === null || selected === undefined || selected === '') return null
  if (typeof selected !== 'string' || selected.includes('\0')) throw new Error('目录选择器返回了无效路径，原工作域未改变。')
  return selected
}
