# 好吃清单

记录想亲手做的美食和想去吃的饭店。

## 功能

- “自己做”和“出去吃”两个独立模块
- 新增、编辑、删除美食与饭店记录
- 按状态、分类筛选和关键词搜索
- 标记已经做过的美食或去过的饭店
- “今天做什么 / 今天吃哪家”随机选择
- JSON 备份导出与导入
- 记录保存在当前浏览器

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

生成 GitHub Pages 静态文件：

```bash
npm run build:pages
```

生成结果位于 `docs/`，可在仓库 Pages 设置中选择从 `main` 分支的 `/docs` 目录发布。
