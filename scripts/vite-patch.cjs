/**
 * 仅用于构建期：Vite 在 Windows 上会 exec("net use") 探测网络盘映射。
 * 沙箱环境禁止带管道的子进程（EPERM），这里把这一条命令短路掉。
 * 不影响其他 exec 调用，也不改变 Vite 的构建行为。
 */
const cp = require('node:child_process')
const realExec = cp.exec

cp.exec = function patchedExec(command, options, callback) {
  let args = Array.from(arguments)
  const cmd = String(command ?? '')
  if (cmd.trim().toLowerCase() === 'net use') {
    const cb = typeof options === 'function' ? options : callback
    if (typeof cb === 'function') cb(null, '', '')
    return { pid: 0, kill() {} }
  }
  return realExec.apply(this, args)
}
