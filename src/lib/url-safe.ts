// Validação de URL para uso em href.
// Bloqueia javascript:, data:, file:, vbscript: etc. — aceita só http/https.

export function urlSeguraParaHref(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  return url;
}
