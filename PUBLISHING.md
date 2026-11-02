# 发布说明

这份文件记录 dsh-skill-peek 从本地仓库到插件市场（[dsh-market](https://github.com/dsh-market/dsh-market)，
数据源是 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)）的全过程，
以及每个卡点的处理方式。

## 一、收录门槛对照

| 市场要求 | 本仓库现状 |
| --- | --- |
| `package.json` 声明 `dsh.bundle` | ✅ `"bundle": { "patch": "./cordis.patch.yml" }` |
| 仓库根有 `cordis.patch.yml` | ✅ 一行 `insert` |
| 真实可用的代码 | ✅ 宿主路由 + 浏览器面板 + 冒烟测试 |
| 仓库创建满 1 天 | ⏳ 建库当天不可提交，次日再提 PR |
| 仓库带 `dsh-plugin` topic | ⏳ 推送后在仓库页添加 |
| 描述如实、无营销词 | ✅ 见下方条目 |
| 图标：GitHub 托管的位图 | ✅ `assets/icon-180.png`（180×180 PNG） |
| 截图：仓库根 `screenshots.json` | ✅ 2 张，相对路径 |
| npm 包的 `repository` 指回本仓库 | ✅ 已在 `package.json` 声明（不发 npm 也不影响收录） |

## 二、推送仓库

```bash
git add -A
git commit -m "dsh-skill-peek 0.1.1: lightweight sidebar search for installed skills"
git remote add origin https://github.com/<owner>/dsh-skill-peek.git
git push -u origin main
```

推完在仓库页 **About** 右侧齿轮里加 topic `dsh-plugin`（没有这个 topic 会被 CI 拒）。

`preview/data.js` 已被 `.gitignore` 排除：它是从本机导出的真实技能正文和绝对路径，
不要提交。别人 clone 后执行 `node tools/dump-preview-data.mjs` 可以生成自己的版本。

## 三、提交市场条目

在 `awesome-dsh-plugin` 仓库新增**一个文件** `data/plugins/<owner>__<repo>.yml`，
例如 `data/plugins/bona11122__dsh-skill-peek.yml`：

```yaml
url: https://github.com/bona11122/dsh-skill-peek
name: bona11122/dsh-skill-peek
category: skill
description:
  en: A lightweight sidebar plugin for quickly searching the skills on this machine — search and read SKILL.md, nothing else.
  zh: 轻量化的侧栏 skills 快速检索插件，仅检索及查看 SKILL.md 原文。
icon: https://raw.githubusercontent.com/bona11122/dsh-skill-peek/main/assets/icon-180.png
```

- 一个 PR 最多 3 条；只加自己这一条，不要动别人的条目或生成的 README。
- 描述里不要出现「最好用」「强大」之类的词；写了数字或 API 名称，代码里就要真的有。
- 分类取最接近的那个即可（这里选 `skill`），选偏了维护者会直接改，不会打回。

## 四、CI 会检查什么

1. 每个 PR 最多 3 条条目；
2. `package.json` 里有 `dsh.bundle`（只有 `dsh.client` 会失败）；
3. 仓库创建满 1 天；
4. `awesome-lint` 与站点构建（双语、格式、截图路径）。

被要求修改时，往同一个 PR 分支推送修复，再留一条评论说明改了什么即可。

## 五、资源

| 文件 | 说明 |
| --- | --- |
| `assets/icon-180.png` | 市场卡片图标，180×180 PNG，深色圆角底 + 白色眼睛 |
| `assets/screenshot-1.png` | 分组列表 + SKILL.md 详情 |
| `assets/screenshot-2.png` | 搜索过滤 + `provider` 与调用权限 |
| `icon.svg` | 面板内联图标（16×16 描边），不是市场图标 |

截图用一份纯虚构的演示数据渲染（技能名、路径、正文都是编的），
不包含任何本机信息；`screenshots.json` 里是相对路径，换图只需替换文件。

## 六、可选：发布到 npm

```bash
npm publish
```

`files` 只包含 `lib/`、`cordis.patch.yml`、`icon.svg` 和 `README.md`，
`package.json` 的 `repository` 已指回本仓库，市场会自动把 npm 下载量与条目关联，
不需要在 yml 里写任何 npm 字段。
