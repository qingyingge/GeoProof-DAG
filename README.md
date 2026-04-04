# GeoProof-DAG

基于 DAG（有向无环图）的几何证明可视化工具。

## 📖 项目简介

GeoProof-DAG 是一个交互式的几何证明可视化工具，允许用户通过构建有向无环图（DAG）来表示几何推理过程。每个节点代表一个几何概念或步骤，边代表逻辑推理关系。

## ✨ 功能特性

### 核心功能

- **交互式 DAG 编辑器**：全屏画布，支持缩放、平移和节点拖拽
- **多种节点形状**：
  - 🏟️ 过程 — 表示几何推理中的步骤
  - ⬜ 已知条件 — 表示题目给出的已知条件
  - 🔷 作图 — 表示作图操作
  - 📋 结论 — 表示推理的最终结论
- **节点编辑**：双击或右键节点打开编辑窗口，修改内容、形状和注释
- **边管理**：单击节点连线，单击边修改注释
- **数据持久化**：支持导出和导入 JSON 格式的项目文件

### 交互方式

| 操作 | 功能 |
|------|------|
| 单击节点 | 选择连线起点，再次单击目标节点完成连线 |
| 双击节点 | 打开编辑窗口 |
| 右键节点/边 | 打开编辑窗口 |
| 拖拽节点 | 移动节点位置 |
| 单击空白处 | 添加新节点 |
| 滚轮 | 缩放画布 |
| 中键拖动 / 空格+左键拖动 | 平移画布 |
| Esc | 取消连线模式 / 关闭弹窗 |

## 🚀 快速开始

### 方式一：直接访问

在浏览器中打开 `index.html` 即可使用。

### 方式二：本地服务器

```bash
# 使用 Python
python -m http.server 8080

# 或使用 Node.js
npx serve .
```

然后访问 `http://localhost:8080`。

## 📁 项目结构

```
GeoProof-DAG/
├── index.html          # 主页
├── operation.html      # 操作面板（DAG 编辑器）
├── help.html           # 帮助页面
├── support.html        # 支持页面
├── css/
│   ├── style.css       # 全局样式
│   └── operation.css   # 操作面板专用样式
└── js/
    ├── main.js             # 全局脚本（导航等）
    ├── operation_core.js   # 核心逻辑（数据、绘图、变换）
    └── operation_ui.js     # UI 交互（事件、弹窗、交互）
```

## 🛠️ 技术栈

- **前端**：HTML5 Canvas、CSS3、原生 JavaScript（无框架依赖）
- **图形**：Canvas 2D API
- **数据**：JSON 导入/导出

## 📋 开发指南

### 核心架构

项目采用两层架构：

1. **operation_core.js**：负责数据管理、Canvas 绘图、视图变换等核心逻辑
2. **operation_ui.js**：负责用户交互、事件处理、弹窗管理等 UI 逻辑

### 添加新功能

- **新形状**：在 `operation_core.js` 中添加绘制函数，并在 `SHAPE_TYPES` 中注册
- **新交互**：在 `operation_ui.js` 中添加事件监听器

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

- 报告问题：[GitHub Issues](https://github.com/qingyingge/GeoProof-DAG/issues)
- 项目仓库：[GitHub](https://github.com/qingyingge/GeoProof-DAG)

## 📄 许可证

本项目开源于 [MIT License](LICENSE.md)。

## 📝 更新日志

详见 [CHANGELOG.md](CHANGELOG.md)。
