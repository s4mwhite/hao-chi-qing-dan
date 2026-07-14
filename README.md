# 好吃清单

记录想亲手做的美食和想去吃的饭店。

## 功能

- “自己做”和“出去吃”两个独立模块
- 私人登录入口，姓名凭证只在 Cloudflare 服务端校验
- 两台设备通过 Cloudflare D1 共享清单
- 高德地图内嵌搜索、选点和导航
- 去过饭店后可上传、替换或删除打卡照片，图片保存到 Cloudflare R2
- 新增、编辑、删除美食与饭店记录
- 按状态、分类筛选和关键词搜索
- 标记已经做过的美食或去过的饭店
- “今天做什么 / 今天吃哪家”随机选择
- JSON 备份导出与导入
- 本地记录在首次登录后自动迁移到共享清单

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
