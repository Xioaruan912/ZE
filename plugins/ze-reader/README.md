# ZE Reader 0.3.0

面向 Zotero 10.0.x 的统一阅读插件，将“阅读顺序与分支定位”和 Translate Bridge 合并到一个安装包，并提供文献整理工作台。

## 安装与升级

1. 下载或使用本目录的 [ze-reader.xpi](ze-reader.xpi)。
2. Zotero → 工具 → 插件 → 齿轮 → Install Plugin From File，选择 XPI。
3. 本插件沿用 `reading-route-columns@local.example`，会升级旧阅读路线插件；已读标签与路线预设继续使用。
4. 若装有旧 ZE Translate Bridge / Paper Reader Translate Bridge，请停用它，然后重新启用 ZE Reader，避免占用同一个翻译端点。
5. 从 **工具 → ZE Reader 工作台** 打开工作台；从 **编辑 → 设置 → ZE Reader** 配置翻译。

本地保留的原阅读列和独立 Bridge 源码用于兼容；日常只需安装统一版。首版通过保留域名 .invalid 的 HTTPS 清单字段满足安装器要求，**不提供自动更新服务**；后续请手动安装新 XPI。

## 阅读列

“已读”勾选只增删 `阅读状态-已读` 标签，状态随 Zotero 数据同步。保存失败时恢复原状态；不根据打开 PDF 或停留时长自动判断已读。“阅读顺序”和“分支定位”默认隐藏，可从表头菜单重新显示；现有密码学路线预设和分类键映射仍有效。

## 翻译桥接

安装并配置 Translate for Zotero 后，在 ZE Reader 设置中导入现有 ZE 安装目录内的 `bridge.token`，或粘贴其内容并保存。不要分享自己的令牌。

统一 XPI 不含令牌。配置存于 Zotero 本机偏好，**不是加密密码库**，不会随文库同步；其他电脑需要单独配置。修改令牌后即时生效，不必重新打包。网页服务继续使用原 `POST /paper-reader/translate` 协议与自己的同名令牌文件。

设置会显示未配置、翻译插件未就绪或旧端点冲突。只有点击“测试翻译”才发送固定测试句 `Hello world.`。外部翻译服务的可用性、验证和额度仍取决于提供方。

## 工作台

- **标签页**：搜索已打开 PDF，点击回到对应标签页；将当前 PDF 保存成命名组，恢复时补开缺失附件并保留其他标签页。分组只保存在本机。
- **笔记与标注**：选择“所选文献”或“当前列表”，点击刷新。按文字、类型、标注颜色和精确标签筛选，每页最多 50 条。点击“打开来源”回到原生笔记或 PDF 标注；图片和墨迹仅显示现有文字、批注与来源。
- **文献矩阵**：添加列名，选择颜色（如 `#ffd400`）或精确标签，再保存规则。每行一篇文献；单元格来自已有标注，保留正文、批注和原文链接。可复制为 Markdown。
- 配置损坏时显示提示并保留原始偏好；“重建本机配置”会明确替换相应分组或规则配置，请确认确实要重新开始后再点击。

工作台不自动生成论文结论，不向外部服务发送汇总内容。首版不包含阅读统计、影响因子/被引数、附件预览、笔记反向链接、嵌套标签或 AI 分析，也不会自动迁移 Style 私有数据或停用 Style。完成自己的工作流核对后，可自行停用旧插件。

## 构建与检查

在 ZE 仓库根目录运行：

```powershell
npm.cmd run build:plugin
npm.cmd test
python -m unittest discover -s tests
```

构建只读取明确白名单中的源文件，复用 `plugins/reading-columns/reading-columns.js`，不读取文库或机器凭据。输出为 `plugins/ze-reader/ze-reader.xpi`；固定顺序、时间戳、权限和换行，可重复构建比对。

实际验证范围见 [VALIDATION.md](VALIDATION.md)。
