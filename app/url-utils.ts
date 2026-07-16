const EMBEDDED_HTTP_URL = /https?:\/\/[^\s<>"'`，。！？；、]+/iu;
const TRAILING_SHARE_PUNCTUATION = /[)\]}>）】》，。！？；、,:：]+$/u;

export function extractSharedHttpUrl(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(EMBEDDED_HTTP_URL);
  return (match?.[0] ?? trimmed).replace(TRAILING_SHARE_PUNCTUATION, "");
}

export function normalizeHttpUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return { value: "", error: "" };

  const hasEmbeddedHttpUrl = EMBEDDED_HTTP_URL.test(trimmed);
  const hasExplicitScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed);
  const looksLikeBareDomain = /^[^\s/]+\.[^\s/]+(?:[/?#].*)?$/u.test(trimmed);
  if (!hasEmbeddedHttpUrl && !hasExplicitScheme && !looksLikeBareDomain) {
    return { value: trimmed, error: "没有识别到有效网址，请粘贴网页链接或包含链接的分享文案" };
  }

  const extracted = extractSharedHttpUrl(trimmed);
  if (extracted.length > 2048) return { value: extracted, error: "链接过长，请换一个更短的网址" };
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(extracted) ? extracted : `https://${extracted}`;

  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) return { value: extracted, error: "只支持 http 或 https 链接" };
    if (!url.hostname || url.username || url.password) return { value: extracted, error: "请输入不含账号密码的公开网页链接" };
    return { value: url.toString(), error: "" };
  } catch {
    return { value: extracted, error: "没有识别到有效网址，请粘贴网页链接或包含链接的分享文案" };
  }
}
