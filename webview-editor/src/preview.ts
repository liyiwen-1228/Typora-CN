import { marked } from 'marked';

/** 渲染 Markdown 为 HTML（GFM），并做最小化安全清理 */
export function renderMarkdown(src: string): string {
  const html = marked.parse(src, { gfm: true, breaks: false }) as string;
  return sanitize(html);
}

/** 移除脚本类元素与内联事件属性，防止预览内容执行任意代码 */
function sanitize(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, iframe, object, embed, style, form').forEach((el) => {
    el.remove();
  });
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
      } else if (
        (name === 'href' || name === 'src' || name === 'xlink:href') &&
        value.startsWith('javascript:')
      ) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return doc.body.innerHTML;
}
