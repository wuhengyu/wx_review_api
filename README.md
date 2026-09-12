# wx-review-api

微信小程序「审核模式」状态接口，基于 Vercel Serverless Functions，**零依赖**，附带一个可视化开关控制台。

- 小程序侧调用 `/api/review` 拿到 `reviewMode`
- 你打开 `/admin` 点一下开关，**即时生效，无需重新部署**

## 接口列表

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET / POST | `/api/review` | 否 | 获取审核模式开关 |
| GET | `/api/health` | 否 | 健康检查 |
| GET / POST | `/api/config` | 是 | 读取 / 修改配置，控制台调用 |
| GET | `/admin` | 是 | 可视化开关控制台 |
| GET / POST | `/` | 否 | 等价于 `/api/review`（由 `vercel.json` rewrite） |

### `GET /api/review`

```json
{
  "code": 0,
  "data": {
    "reviewMode": true
  }
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `code` | number | `0` 表示成功，非 `0` 表示失败 |
| `data.reviewMode` | boolean | 是否处于审核模式 |

### `GET /api/health`

```json
{
  "code": 0,
  "data": {
    "status": "ok",
    "uptime": 1.234,
    "timestamp": "2026-09-12T00:00:00.000Z"
  }
}
```

### `GET /api/config`（需鉴权）

请求头需带 `Authorization: Bearer <ADMIN_PASSWORD>`。

```json
{
  "code": 0,
  "data": {
    "config": { "reviewMode": true },
    "schema": {
      "reviewMode": {
        "type": "boolean",
        "label": "审核模式",
        "description": "开启后 /api/review 返回 reviewMode: true",
        "default": true
      }
    },
    "storeReady": true
  }
}
```

### `POST /api/config`（需鉴权）

```json
{ "reviewMode": false }
```

响应返回写入后的完整配置。仅允许修改 `schema` 中声明的字段，类型不符或字段不存在都会返回错误码 `40002` / `40003`。

### 错误响应

```json
{
  "code": 40002,
  "message": "不支持的字段: notExist"
}
```

| 错误码 | HTTP | 含义 |
| --- | --- | --- |
| `40101` | 401 | 密码错误 |
| `40001` ~ `40004` | 200 | 请求体格式 / 字段 / 取值非法 |
| `405` | 405 | 请求方法不允许 |
| `500` | 500 | 服务端未捕获异常 |
| `50301` | 503 | 未配置 `ADMIN_PASSWORD`，管理功能禁用 |
| `50302` | 503 | 未连接 Redis 存储，无法保存配置 |

## 管理控制台

部署完成后访问：

```
https://你的域名/admin
```

输入 `ADMIN_PASSWORD` 登录，即可看到所有可控开关。拨动开关会立刻写入存储，`/api/review` 下一次请求就会返回新值 —— **不需要重新部署**。

界面支持：

- 密码保存在浏览器本地，下次打开自动登录
- 顶部状态条提示存储是否已连接
- 每个开关下方实时显示当前字段值
- 右下角 toast 反馈保存结果

### 首次配置存储

Serverless 是无状态的，开关值必须存在外部。本项目使用 **Upstash Redis**（免费额度足够）：

1. 打开 Vercel 项目 → **Storage** → **Marketplace**（或 Create Database）；
2. 选择 **Upstash Redis**，套餐选 Free，Region 选离你最近的；
3. 点击 **Connect** 绑定到本项目，环境变量会自动注入；
4. 回到项目 **Deployments**，重新部署一次（Redeploy）让变量生效。

未连接存储时接口仍可用，只是 `/api/review` 会退回环境变量兜底值，控制台呈只读状态并给出提示。

## 目录结构

```
.
├── api/
│   ├── review.js      # 业务接口 → /api/review
│   ├── health.js      # 健康检查 → /api/health
│   └── config.js      # 配置读写（需鉴权）→ /api/config
├── lib/
│   ├── response.js    # 统一响应结构 + CORS 头封装
│   ├── handler.js     # 路由包装器：预检、方法校验、异常捕获
│   ├── store.js       # 配置存储层（Upstash REST API + 字段 schema）
│   └── auth.js        # 管理密码校验
├── public/
│   └── admin/
│       └── index.html # 开关控制台（单文件，无外部依赖）
├── vercel.json        # 路由配置
├── package.json
└── .gitignore
```

## 环境变量

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `ADMIN_PASSWORD` | 是 | 控制台登录密码。**未设置时整个管理功能禁用**，避免线上裸奔 |
| `UPSTASH_REDIS_REST_URL` | 是 | Upstash Redis REST 地址，由 Vercel 集成自动注入 |
| `UPSTASH_REDIS_REST_TOKEN` | 是 | Upstash Redis 访问令牌，同上 |
| `KV_REST_API_URL` | 否 | 兼容 Vercel KV 旧版变量名，与 `UPSTASH_*` 二选一 |
| `KV_REST_API_TOKEN` | 否 | 兼容 Vercel KV 旧版变量名 |
| `REVIEW_MODE` | 否 | 未连接存储时的兜底值，默认 `true` |

在 Vercel 控制台 **Project → Settings → Environment Variables** 中配置。除存储变量由集成自动注入外，`ADMIN_PASSWORD` 需要手动添加，添加后要重新部署才生效。

## 新增一个可控开关

只需要在 `lib/store.js` 的 `FIELD_SCHEMA` 里加一项，控制台会自动渲染出对应开关，`/api/config` 的校验也会自动生效：

```js
const FIELD_SCHEMA = {
  reviewMode: {
    type: 'boolean',
    label: '审核模式',
    description: '开启后 /api/review 返回 reviewMode: true',
    default: true,
  },
  // 新增示例
  maintenance: {
    type: 'boolean',
    label: '维护模式',
    description: '开启后小程序端展示维护提示',
    default: false,
  },
};
```

同时在 `DEFAULT_CONFIG` 里补上同名默认值，然后在业务接口里读取即可：

```js
const { readConfig } = require('../lib/store');

const { maintenance } = await readConfig();
```

支持的字段类型：`boolean`、`number`、`string`。

## 新增接口

`api/` 下的文件会被自动注册为路由，无需任何额外配置：

| 文件 | 路由 |
| --- | --- |
| `api/review.js` | `/api/review` |
| `api/user/info.js` | `/api/user/info` |
| `api/user/[id].js` | `/api/user/123`（`req.query.id === '123'`） |

统一使用 `lib/handler.js` 的 `createHandler`，它已处理好 CORS 预检、请求方法校验和异常捕获，业务代码只需要返回数据：

```js
const { createHandler, ApiError } = require('../lib/handler');

module.exports = createHandler({
  // 允许的请求方法，默认 ['GET']
  methods: ['GET', 'POST'],
  handler: async (req) => {
    const { id } = req.query;
    if (!id) {
      // 抛出 ApiError 会被自动转成 { code, message }
      throw new ApiError(40001, '缺少 id 参数');
    }

    // 直接 return 的对象会被包装成 { code: 0, data: {...} }
    return { id, name: 'demo' };
  },
});
```

行为约定：

- 返回值自动包装为 `{ code: 0, data }`；
- 抛 `ApiError(code, message)` → 返回 `{ code, message }`；
- 其他未捕获异常 → 记录日志并返回 `500 { code: 500, message: 'Internal Server Error' }`；
- 传入未允许的方法 → `405 { code: 405, message: 'Method Not Allowed' }`，并带上 `Allow` 响应头；
- `OPTIONS` 预检 → `204`。

### 请求参数

- Query 参数：`req.query`
- JSON Body：`req.body`（`Content-Type: application/json` 时由 Vercel 自动解析）
- 请求头：`req.headers`

### 需要自定义响应时

如果某个接口需要设置额外响应头或返回非 JSON 内容，可以在 handler 内部直接操作 `res`，包装器检测到已响应后不会再重复输出：

```js
module.exports = createHandler({
  handler: async (req, res) => {
    res.setHeader('X-Custom', 'value');
    res.status(200).send('plain text');
  },
});
```

## 本地开发

```bash
npm i -g vercel
npm run dev
```

启动后访问：

- 控制台 <http://localhost:3000/admin>
- 接口 <http://localhost:3000/api/review>

本地调试控制台需要先准备环境变量：

```bash
# PowerShell
$env:ADMIN_PASSWORD="dev123"
$env:UPSTASH_REDIS_REST_URL="https://xxx.upstash.io"
$env:UPSTASH_REDIS_REST_TOKEN="xxx"
vercel dev
```

只验证接口逻辑、不配置任何变量也可以跑（会走兜底值）：

```bash
node -e "require('./api/review')({method:'GET'},{setHeader(){},status(){return this},json:(o)=>console.log(o)})"
```

## 部署到 Vercel

### 方式一：Git 集成（推荐）

1. 把本仓库推送到 GitHub；
2. 打开 <https://vercel.com/new>，导入该仓库；
3. Framework Preset 选择 **Other**，Build Command 与 Output Directory 留空；
4. 点击 **Deploy**；
5. 按上文「首次配置存储」绑定 Upstash Redis，并添加 `ADMIN_PASSWORD`。

之后每次 `git push` 到默认分支都会自动重新部署。

### 方式二：CLI

```bash
npm i -g vercel
vercel --prod
```

## 小程序调用示例

```js
wx.request({
  url: 'https://your-domain.com/api/review',
  method: 'GET',
  success: (res) => {
    if (res.data.code === 0 && res.data.data.reviewMode) {
      // 审核模式逻辑
    }
  },
});
```

> 上线前需在微信公众平台「开发管理 → 开发设置 → 服务器域名」中，把接口域名加入 **request 合法域名**（只需填域名，不带路径，且必须是 HTTPS）。

## 安全建议

- `ADMIN_PASSWORD` 请使用足够长的随机字符串，不要用 `123456` 之类的弱密码；
- 控制台页面已设置 `robots: noindex`，但不要对外公开 `/admin` 地址；
- 接口鉴权走 `Authorization: Bearer` 请求头，不会出现在 URL 和访问日志里；
- 密码比较使用 `crypto.timingSafeEqual`，避免时序攻击。

## License

MIT
