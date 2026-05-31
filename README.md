# AI 代码开发平台

这是 AI 代码开发平台的 MVP 工程骨架。当前目标是先跑通最小闭环：

```text
创建项目 -> 上传项目 -> 展示文件树 -> 上传需求 -> AI 生成澄清问题 -> 业务反馈 -> 方案/详细设计 -> AI 编码 -> 自测 -> CR
```

## 目录

```text
apps/web            前端工作台
apps/api            后端 API
packages/shared     共享类型和常量
services/runner     沙箱 Runner 服务
infra               本地基础设施
docs                项目文档
storage             本地项目、日志、Patch、产物
```

## 本地启动

```bash
npm install
npm run dev
```

前端默认地址：

```text
http://localhost:5173
```

后端默认地址：

```text
http://localhost:3001/health
```

## 基础设施

```bash
docker compose -f infra/docker-compose.yml up -d
```

MVP 初期 API 使用内存数据，数据库接入在下一步开发中完成。
