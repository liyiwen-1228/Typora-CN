/**
 * YAML Front Matter（FE-04）：文件头部 `---` 元数据块
 * 仅支持扁平字段（title/tags/date 等），读写不破坏原数据（内容原样保存）。
 */

export interface FrontMatter {
  raw: string;
  title?: string;
  tags: string[];
  date?: string;
  fields: Record<string, string>;
}

export interface ParsedNote {
  fm: FrontMatter | null;
  body: string;
}

/** 解析文件头部的 front matter 块 */
export function parseFrontMatter(content: string): ParsedNote {
  const lines = content.split('\n');
  if (lines[0] === undefined || lines[0].trim() !== '---') {
    return { fm: null, body: content };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.trim() === '---' || line.trim() === '...') {
      end = i;
      break;
    }
    // 空行后的内容视为正文结束（宽松处理）
    if (line.trim() === '' && i > 1) break;
  }
  if (end < 0) return { fm: null, body: content };

  const rawLines = lines.slice(0, end + 1);
  const raw = rawLines.join('\n');
  const fields: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    fields[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  const tagsRaw = fields.tags ?? fields.tag ?? '';
  const tags = tagsRaw
    .replace(/^\[|\]$/g, '')
    .split(/[,，\s]+/)
    .map((t) => t.replace(/^#/, '').trim())
    .filter((t) => t.length > 0);

  return {
    fm: {
      raw,
      title: fields.title,
      tags,
      date: fields.date,
      fields,
    },
    body: lines.slice(end + 1).join('\n').replace(/^\n/, ''),
  };
}

/** 笔记显示标题优先级：front matter title > 正文首个 h1 > 文件名 */
export function displayTitle(fmTitle: string | undefined, h1: string | undefined, fileName: string): string {
  if (fmTitle && fmTitle.trim()) return fmTitle.trim();
  if (h1 && h1.trim()) return h1.trim();
  return fileName.replace(/\.md$/i, '');
}
