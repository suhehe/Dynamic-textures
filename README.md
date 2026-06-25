# Dynamic Textures

独立的动态纹理工具项目，从原 WPS 内容管理器中抽离。

## 运行

```bash
npm install
npm run dev
```

默认开发地址：`http://localhost:3001`

## 构建

```bash
npm run build
```

## 数据

纹理预设保存在：

```text
data/texture-presets.json
```

项目保留了动态纹理的表现能力：纹理预设、动画参数、斑纹参数、点阵样式、边缘与边界、鼠标交互、激活状态、渐变背景。已移除原项目中的资源管理、预览内容管理、位置预设绑定等与宿主项目捆绑的能力。
