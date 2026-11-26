# Cloudflare Pages + KV 部署（永久免费、无需信用卡）

## 一、准备 GitHub 仓库
把 `E:\项目文件管理\项目管理部署文件` 里的全部内容上传到 GitHub 仓库（已有 `pm-site` 可直接覆盖更新）。

## 二、创建 Pages 项目
1. 打开 https://dash.cloudflare.com → 注册/登录。
2. 左侧 **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
3. 选择 GitHub 仓库 `pm-site` → Begin setup。
4. 填写：
   - Framework preset：**None**
   - Build command：留空
   - Build output directory：`/`
5. 点 **Save and Deploy**，等待第一次部署完成。

## 三、创建 KV 并绑定
1. 进入刚创建的 Pages 项目 → **Settings** → **Functions**。
2. 找到 **KV namespace bindings** → **Add binding**。
3. Variable name 填：`PM_KV`。
4. 若还没有 KV：先到 **Workers & Pages → KV** 创建一个命名空间（名称随意），再回来选择它。
5. 保存。

## 四、设置编辑口令
1. 同一页面的 **Settings** → **Environment variables**。
2. **Add variable**：
   - Name：`EDIT_TOKEN`
   - Value：你的编辑密码（如 `pm2026`）
3. 保存后回到 **Deployments** → 点最新部署右侧 **Retry deployment**，让绑定和变量生效。

## 五、使用
- 你编辑：`https://你的项目.pages.dev/?edit=你的口令`
- 发给别人：`https://你的项目.pages.dev/`
- 你保存后，其他人页面会在约 5 秒内自动刷新。

## 免费额度
- Pages：静态访问免费且不限量。
- Functions：每天 10 万次请求免费。
- KV：每天 10 万次读取、1000 次写入免费；本项目每天写入远低于该额度。

## 注意
- 若没有设置 `EDIT_TOKEN`，任何拿到网址的人都能编辑；正式使用请务必设置。
- 数据保存在 Cloudflare KV，不会因重新部署丢失。