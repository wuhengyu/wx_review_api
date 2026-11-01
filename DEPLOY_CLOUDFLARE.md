# 部署到 Cloudflare（Workers + Static Assets）

本项目原本是 Vercel Serverless 结构（`api/` 目录 + `vercel.json`）。现在**同一份代码可以同时部署到 Vercel 和 Cloudflare**：

- Vercel：走 `api/` + `vercel.json`，不受影响；
- Cloudflare：走 `worker/index.js`（适配层）+ `wrangler.jsonc`，业务逻辑 `lib/`、`api/` 完全复用，零改动。

`worker/index.js` 只做两件事：把 Cloudflare 的 Web 标准 `Request/Response` 适配成 Vercel 风格的 `(req, res)`；把 Workers 的环境变量注入 `process.env`。

## 接口与 Vercel 版完全一致

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET / POST | `/api/review`、`/` | 获取审核模式开关（`/` 等价于 rewrite 到 review） |
| GET | `/api/health` | 健康检查 |
| GET / POST | `/api/config` | 配置读写（需 `Authorization: Bearer <ADMIN_PASSWORD>`） |
| GET | `/admin` | 可视化开关控制台（静态页） |

## 环境变量（Workers → Settings → Variables and Secrets）

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `ADMIN_PASSWORD` | 是 | 控制台登录密码，建议用 Secret 类型 |
| `REVIEW_MODE` | 否 | 未连接存储时的兜底值，默认 `true` |

## 存储后端（二选一）

配置开关需要持久化存储，支持两种后端，代码自动检测。「变量和机密」与「Workers KV」的区别和分工，见 README 的[「变量和机密 vs Workers KV」](./README.md#变量和机密-vs-workers-kv为什么两个都要)一节。

### 方式 A：Cloudflare Workers KV（全 Cloudflare 原生，推荐）

1. Cloudflare 控制台 → **存储和数据库** → **KV** → **创建命名空间**（名称随意，如 `wx-review-config`）；
2. 复制命名空间的 **ID**；
3. 在 `wrangler.jsonc` 中加入：

```jsonc
"kv_namespaces": [
  { "binding": "KV", "id": "<你的命名空间ID>" }
]
```

4. 推送后自动构建部署即生效。控制台的 `storeReady` 会显示为已连接。

> KV 是最终一致存储，开关变更全球同步通常只需几秒，对审核模式场景完全够用。
> 免费额度：每天 10 万次读、1000 次写，本项目用量远低于此。

### 方式 B：Upstash Redis（与 Vercel 共用同一存储）

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | 二选一 | Upstash Redis REST 地址 |
| `UPSTASH_REDIS_REST_TOKEN` | 二选一 | Upstash Redis 访问令牌，建议用 Secret 类型 |

使用 Upstash 时，Vercel 与 Cloudflare 共用同一组凭证，两边开关状态天然同步。

## 方式一：Git 集成（Workers Builds，推荐）

1. 把本分支推送到 GitHub；
2. Cloudflare 控制台 → **Workers & Pages** → **Create** → 选 **Workers** → **Import a repository**，授权并选择本仓库；
3. 构建配置：Build Command 留空（或 `echo ok`），**Deploy Command 使用 `npx wrangler deploy`**（Workers Builds 会读取 `wrangler.jsonc`）；
4. 部署完成后在 Workers 的 **Settings → Variables and Secrets** 添加上表变量；
5. 得到 `https://wx-review-api.<你的子域>.workers.dev` 域名。

## 方式二：本地 CLI

```bash
npm i -g wrangler      # 或直接使用 npx wrangler
npx wrangler login     # 浏览器授权一次
npx wrangler deploy
```

设置变量：

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put UPSTASH_REDIS_REST_TOKEN
npx wrangler vars put UPSTASH_REDIS_REST_URL   # 普通 var
# 或在 Dashboard 的 Settings → Variables and Secrets 中添加
```

## 本地调试

```bash
ADMIN_PASSWORD=dev123 npx wrangler dev
# 另开终端验证：
curl http://localhost:8787/api/review
curl http://localhost:8787/api/health
curl -H "Authorization: Bearer dev123" http://localhost:8787/api/config
```

## 小程序接入注意

- `workers.dev` 默认域名在中国大陆的可达性不稳定，正式接入小程序时建议在 Workers 的 **Settings → Domains & Routes** 绑定自有域名（Cloudflare Custom Domain）；
- 微信公众平台「服务器域名 → request 合法域名」里填绑定的域名（仅域名，不带路径）；
- 该域名需 ICP 备案后方可配置到小程序后台。

## 新增可控开关 / 新增接口

与 Vercel 版完全相同——只改 `lib/store.js` 的 `FIELD_SCHEMA` / `DEFAULT_CONFIG`，或在 `api/` 下新增文件并在 `worker/index.js` 的路由表中加一行。
