/**
 * 简繁转换（XT-03）：全文简体⇄繁体一键转换
 * - 纯前端词典（opencc-js），离线可用
 * - 代码块/行内代码/front matter/URL/数学公式区段跳过，不参与转换
 */
import * as OpenCC from 'opencc-js';

export type ChineseVariant = 'simplified' | 'traditional';

type Converter = (text: string) => string;

const converters = new Map<ChineseVariant, Converter>();

function getConverter(variant: ChineseVariant): Converter {
  let conv = converters.get(variant);
  if (!conv) {
    conv = OpenCC.Converter({
      from: variant === 'simplified' ? 't' : 'cn',
      to: variant === 'simplified' ? 'cn' : 't',
    });
    converters.set(variant, conv);
  }
  return conv;
}

/** 受保护区段：front matter、围栏代码、行内代码、数学公式、URL */
const PROTECTED_RE =
  /^(---\n[\s\S]*?\n---\n)|(```[\s\S]*?```|~~~[\s\S]*?~~~)|(`+[^\n`]*`+)|(\$\$[\s\S]*?\$\$|\$[^$\n]+\s*?\$)|(https?:\/\/[^\s)]+)/gm;

/** 转换整篇笔记内容（保护代码/元数据/链接不被转换） */
export function convertChinese(content: string, to: ChineseVariant): string {
  const conv = getConverter(to);
  const out: string[] = [];
  let last = 0;
  PROTECTED_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PROTECTED_RE.exec(content)) !== null) {
    if (m.index > last) {
      out.push(conv(content.slice(last, m.index)));
    }
    out.push(m[0]); // 受保护区段原样保留
    last = m.index + m[0].length;
    // 零长匹配保护
    if (m[0].length === 0) PROTECTED_RE.lastIndex += 1;
  }
  if (last < content.length) {
    out.push(conv(content.slice(last)));
  }
  return out.join('');
}
