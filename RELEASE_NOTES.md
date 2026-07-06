# 晶核防线三版本交付说明

生成时间：2026-07-06

## 目录用途

- `cloudflare-web/`：Cloudflare Pages/Workers 静态网页 Demo 上传目录。上传这个目录里的内容即可，不需要上传源工程。
- `source-cocos/`：可用 Cocos Creator 3.8.8 打开的精简源工程。已删除 `library`、`temp`、`build`、`node_modules`、旧备份和无关文档。
- `wechat-build/`：微信小游戏构建输出目录，可用微信开发者工具打开。

## 体积结果

- Cloudflare Web：28.53 MiB，1651 个文件，最大单文件 2.05 MiB。
- Cocos 源工程：100.62 MiB。
- 微信小游戏：主包 3.98 MiB，总包 28.18 MiB。

## 已做压缩

- PNG/JPG 做了无损或有损压缩，首屏和战斗背景做了更强 JPEG 压缩。
- 大 BGM 已从 MP3 转为 AAC `.m4a`。
- 微信版关闭了不需要的 `profiler`、`webview`、`gfx-webgl2` 模块，并把 `configs`、`entry`、`prefabs`、`res`、`resources` 放入分包。

详细机器可读报告见 `release-report.json`。
