# wx-review-api

微信小程序「审核模式」状态接口，基于 Vercel Serverless Functions，**零依赖**部署。

## 接口列表

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET / POST | `/api/review` | 获取审核模式开关 |
| GET | `/api/health` | 健康检查 |
| GET / POST | `/` | 等价于 `/api/review`（由 `vercel.json` rewrite） |

### `GET /api/review`

响应：

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

响应：

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

### 错误响应

```json
{
  "code": 405,
  "message": "Method Not Allowed"
}
```

## 目录结构

```
.
├── api/
│   ├── review.js      # 审核模式接口 → /api/review
│   └── health.js      # 健康检查接口 → /api/health
├── lib/
│   └── response.js    # 统一响应结构 + CORS 头封装
├── vercel.json        # 路由配置
├── package.json
└── .gitignore
```

## 环境变量

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `REVIEW_MODE` | `true` | 设为 `false` 时接口返回 `reviewMode: false`，无需改代码 |

在 Vercel 控制台 **Project → Settings → Environment Variables** 中配置，修改后需重新部署生效。

## 本地开发

需要 Vercel CLI：

```bash
npm i -g vercel
npm run dev
```

启动后访问 <http://localhost:3000/api/review>。

也可以不装 CLI，直接用 Node 快速验证逻辑：

```bash
node -e "require('./api/review')({method:'GET'},{setHeader(){},status(){return this},json:console.log})"
```

## 部署到 Vercel

### 方式一：Git 集成（推荐）

1. 把本仓库推送到 GitHub；
2. 打开 <https://vercel.com/new>，导入该仓库；
3. Framework Preset 选择 **Other**，Build Command 与 Output Directory 留空；
4. 点击 **Deploy**。

之后每次 `git push` 到默认分支都会自动重新部署。

### 方式二：CLI

```bash
npm i -g vercel
vercel --prod
```

## 小程序调用示例

```js
wx.request({
  url: 'https://your-project.vercel.app/api/review',
  method: 'GET',
  success: (res) => {
    if (res.data.code === 0 && res.data.data.reviewMode) {
      // 审核模式逻辑
    }
  },
});
```

> 上线前需在微信公众平台「开发管理 → 开发设置 → 服务器域名」中，把 `https://your-project.vercel.app` 加入 **request 合法域名**（要求 HTTPS 且已备案的域名不受影响，Vercel 默认域名也可使用）。

## 新增接口

在 `api/` 下新建文件即可自动成为路由，例如 `api/user.js` → `/api/user`。统一使用 `lib/response.js` 保证响应格式一致：

```js
const { success, fail, handleOptions } = require('../lib/response');

module.exports = function handler(req, res) {
  if (req.method === 'OPTIONS') return handleOptions(res);
  if (req.method !== 'GET') return fail(res, 405, 'Method Not Allowed', 405);

  return success(res, { hello: 'world' });
};
```

## License

MIT
