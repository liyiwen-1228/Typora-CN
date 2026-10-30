/**
 * 首次启动引导（XT-04）：创建示例笔记，覆盖一期全部功能点
 */

export const SAMPLE_NOTE_TITLE = '欢迎使用 Typora-CN';

export const SAMPLE_NOTE_CONTENT = `---
title: 欢迎使用 Typora-CN
tags: [入门, 指南]
date: 2026-10-30
---

# 欢迎使用 Typora-CN

这是一篇示例笔记，首次启动时自动创建。它演示了一期全部功能点。

[TOC]

## 基础排版

支持 **加粗**、*斜体*、~~删除线~~、==高亮==、\`行内代码\`、[链接](https://example.com)。

> 引用块：这是一段引用文字。

- 无序列表
- 嵌套子列表（选中后按 Tab / Shift+Tab 调整层级）
  - 子列表项

1. 有序列表
2. 第二项

- [x] 任务列表（已完成）
- [ ] 任务列表（待办）

## 数学公式

行内公式：质能方程 $E = mc^2$，欧拉公式 $e^{i\\pi} + 1 = 0$。

块级公式：

$$
\\frac{\\partial u}{\\partial t} = \\alpha \\nabla^2 u + f(x, t)
$$

矩阵：

$$
\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}
\\begin{pmatrix} x \\\\ y \\end{pmatrix}
=
\\begin{pmatrix} ax + by \\\\ cx + dy \\end{pmatrix}
$$

## Mermaid 图表

\`\`\`mermaid
flowchart TD
    A[打开笔记] --> B{编辑或预览?}
    B -->|编辑| C[Markdown 语法]
    B -->|预览| D[实时渲染]
    C --> E[自动保存]
    D --> E
\`\`\`

\`\`\`mermaid
sequenceDiagram
    participant U as 用户
    participant A as App
    participant S as 沙盒存储
    U->>A: 编辑笔记
    A->>S: 自动保存（800ms 防抖）
    S-->>A: 保存成功
    A-->>U: 状态更新
\`\`\`

\`\`\`mermaid
pie title 笔记构成
    "文字" : 60
    "公式" : 15
    "图表" : 15
    "图片" : 10
\`\`\`

## 表格

| 功能 | 状态 | 说明 |
| --- | :---: | ---: |
| 数学公式 | ✅ | KaTeX 渲染 |
| Mermaid | ✅ | 流程图/时序图/饼图 |
| 全文搜索 | ✅ | 标题与正文命中 |

工具栏可一键美化表格（列宽对齐）。

## 脚注与图片

这里有一个脚注引用[^1]，点击可跳转。

[^1]: GFM 脚注：自动跳转到底部注释，再点返回。

图片从相册插入后，会保存到笔记同目录 assets/ 下并以相对路径引用。

## 快捷键

外接键盘快捷键与 Typora 对齐：⌘B 加粗、⌘I 斜体、⌘1–⌘6 标题、⌘F 文内查找、⌘⇧F 全库搜索、⌘⇧P 命令面板、⌘/ 切换预览。Windows 键盘的 Win 键即等价 ⌘。全部快捷键均可在设置中自定义。

## 更多

- 大纲面板：点击标题树跳转（⌘⇧1）
- 历史快照：每次自动保存前自动留存，侧栏可恢复
- 导出：分享 .md / 自包含 HTML / PDF
- 工作区：可将「文件」App 中任意文件夹设为工作目录
- 主题：设置中切换 6 套主题，支持自定义 CSS
- 双链：输入 [[欢迎使用 Typora-CN]] 可链接本篇笔记，在大纲面板「反链」页可查看引用来源
`;
