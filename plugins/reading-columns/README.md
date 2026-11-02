# 阅读顺序与分支定位

在 Zotero 10.0.x 的文献列表中显示两列，并根据当前分类切换内容：

| 列名 | 示例 | 来源 |
| --- | --- | --- |
| 阅读顺序 | `02` | 当前分支的阅读顺序标签 |
| 分支定位 | `奠基 · ABE构造主线` | 标签中的阶段与代码配置的子路线 |

例如：`阅读顺序-02访问控制-02-奠基-FuzzyIBE2005`。同一篇论文在不同分支可以有不同的序号和定位。

**本插件随附一套密码学阅读路线预设。分类键保存在 `reading-columns.js` 的 `branches` 中；其他文库需要按自己的分类键和标签前缀调整配置。** 当前预设支持 01—10、90 和 91 共 12 条路线。父分类、未配置分类、没有对应标签的条目以及子笔记、子附件的列值留空。

## 安装

1. [下载 reading-route-columns.xpi](https://raw.githubusercontent.com/Xioaruan912/ZE/plugin/plugins/reading-columns/reading-route-columns.xpi)。
2. 打开 Zotero 的 **工具 → 插件 → 齿轮菜单 → 从文件安装插件**，选择下载的文件。
3. 打开一个已配置的分支，查看“阅读顺序”和“分支定位”。若未显示，右键列表表头勾选这两列。

进入已配置分支时，插件显示两列，并尝试按阅读顺序升序排序。点击表头也可调整排序。编号是建议学习顺序，平行专题和参考教材按需阅读。

当前版本为 **0.1.1**。它补齐了旧包漏写的 `applications.zotero.update_url`，并通过安装器必填字段检查。手动脚本的实际显示已由使用者确认；扩展安装与重启加载仍需实际验证。

该本地扩展没有自动更新服务。为满足安装器要求，清单使用保留域名 `.invalid` 的 HTTPS 更新地址；它不会连接真实的更新服务器。后续版本请手动重新下载和安装。

## 从源码构建

需要 Python 3；在仓库根目录运行：

```powershell
python plugins/reading-columns/build.py
```

输出为 `plugins/reading-columns/reading-route-columns.xpi`。安装包仅包含 `manifest.json`、`bootstrap.js`、`reading-columns.js`，不包含文库数据、令牌或本机配置。构建固定文件顺序和时间戳，并统一换行，支持重复构建比对。

## 不安装扩展，手动加载

打开 Zotero **工具 → 开发者 → Run JavaScript**，勾选“作为异步函数执行”。将下面的示例路径改成实际源码文件位置，然后运行：

```javascript
if (Zotero.ReadingRouteColumns) {
  await Zotero.ReadingRouteColumns.stop();
}

const scope = {};
Services.scriptloader.loadSubScript(
  "file:///C:/path/to/ZE/plugins/reading-columns/reading-columns.js",
  scope
);

Zotero.ReadingRouteColumns = scope.ReadingColumns;
return await Zotero.ReadingRouteColumns.start(Zotero);
```

返回包含 `order` 和 `position` 的两个内部 ID 表示注册成功。此方式只对当前 Zotero 会话有效，重启后需重新运行；安装扩展才会在启动时加载。

## 配置阅读路线

- 标签格式：`阅读顺序-分支名-两位序号-阶段-简称`。同一条目在同一分支保留一个顺序标签；不同分支可以各有一个。
- `branches` 定义“分类键 → 标签中的分支名”。重命名分类不改变分类键；重建或另建分类需要更新映射。
- `role()` 按分支和序号范围定义子路线。大幅调整序号时，需要同步检查此处的定位规则。
- 修改标签后若显示未更新，切换分支后再返回。更改代码后重新构建、安装插件，或重新加载脚本。

插件仅读取标签并调整列表显示，不会创建标注、改写论文标题或修改阅读标签。

## 同步与停用

文献、分类、标签会随 Zotero 数据同步；脚本、扩展包和本机列布局不会自动在另一台电脑启用。另一台电脑需单独安装插件，并使用对应配置。网页端和移动端不会因此新增列。参见 [Zotero 同步说明](https://www.zotero.org/support/sync)。

可在插件管理中禁用扩展。若仅手动加载了脚本，在异步 JavaScript 窗口运行：

```javascript
if (Zotero.ReadingRouteColumns) {
  await Zotero.ReadingRouteColumns.stop();
  delete Zotero.ReadingRouteColumns;
}
```

这会撤销两列并停止分支检测，保留所有原有标签。

## 检查

```powershell
node --test plugins/reading-columns/reading-columns.test.cjs
python -m unittest discover -s tests -p test_reading_columns_package.py
```

仓库的 `npm test` 和 Python 测试发现也包含上述检查。安装器字段检查和自动化测试不等同于实际安装、重启验证。
