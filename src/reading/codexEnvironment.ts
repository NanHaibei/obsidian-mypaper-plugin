/** 只修改本次 Codex 子进程环境，不修改 Obsidian 或系统代理。 */
export function codexEnvironment(
  inherited: Record<string, string | undefined>, proxyUrl: string,
): Record<string, string | undefined> {
  const env = { ...inherited };
  if (!proxyUrl.trim()) return env;
  let url: URL;
  try { url = new URL(proxyUrl.trim()); }
  catch { throw new Error('Codex 网络代理地址无效，请填写 http://主机:端口'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Codex 网络代理需使用 HTTP/HTTPS 代理地址，例如 http://127.0.0.1:7890');
  }
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) {
    env[key] = url.href;
  }
  return env;
}

export function describeCodexFailure(message: string): string {
  if (/model.*at capacity|server.*overload/i.test(message)) return '所选模型服务当前繁忙，请稍后重试或更换模型。原文与裁图已保留。';
  if (/usage limit|quota|insufficient.*credit|out of credits/i.test(message)) return '账号额度暂不可用，任务和原文已保留，恢复额度后可重试。';
  if (/workspace routing discovery (?:failed|timed out)/i.test(message)) return '无法连接 Codex 账号服务，请检查本机网络代理与 Codex 登录状态。';
  if (/unauthorized|not logged in|authentication|401/i.test(message)) return 'Codex 登录已失效，请在终端重新运行 codex login 后重试。';
  return message;
}
