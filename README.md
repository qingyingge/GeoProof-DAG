# 灵动科技站 - 静态网站模板

这是一个多页面静态网站模板，包含主页、操作页面、帮助页面和支持页面。所有页面共用导航栏与样式，并预留了图片与文档文件夹，便于快速部署和扩展。

## 项目结构

my-static-site/
├── index.html # 主页
├── operation.html # 操作页面（带JS交互）
├── help.html # 帮助页面（文档下载链接）
├── support.html # 支持页面（联系表单）
├── css/
│ └── style.css # 全局样式（含响应式）
├── js/
│ ├── main.js # 通用脚本（移动端菜单）
│ └── operation.js # 操作页面专用脚本
├── images/ # 图片资源文件夹（需自行添加图片）
│ ├── logo.svg
│ ├── banner.svg
│ ├── icon1.svg
│ ├── icon2.svg
│ ├── icon3.svg
│ ├── about.svg
│ └── support-illustration.svg
├── docs/ # 文档文件夹（需自行添加PDF等文件）
│ ├── user-guide.pdf
│ └── api-reference.pdf
└── README.md

text

## 使用说明

1. 将整个文件夹上传至Web服务器（或本地打开）。
2. 确保 `images/` 文件夹中存在所有引用的图片（或替换为您的图片）。
3. 将实际文档放入 `docs/` 文件夹，并更新 `help.html` 中的链接。
4. 如需修改联系方式或表单提交逻辑，请编辑 `support.html` 中的JavaScript代码。
5. 所有样式和交互均已在现代浏览器测试，移动端适配良好。

## 定制建议

- 替换 `images/` 中的SVG图片为您的品牌素材。
- 修改 `css/style.css` 中的主题色（如 `#3498db`）以匹配品牌色。
- 操作页面功能可根据需求扩展，现有计数器仅为演示。

## 许可证

MIT
