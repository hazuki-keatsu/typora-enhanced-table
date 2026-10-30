# 开发记录

| 操作 | 原因与结果 |
| --- | --- |
| 检查插件模板、VLOOK、typora-pele 和本机 Typora 源码 | VLOOK 是 Markdown 标记渲染转换；HTML 持久化必须进入 Typora 文档模型。 |
| 核实 HTMLBlock 编辑接口及社区菜单、命令接口 | 选择原位置可视编辑层；保存经过 HTMLBlock 和原生撤销系统。 |
| 先写表格合并/拆分行为断言 | 覆盖矩形、内容保留、既有跨度、跨分组拒绝、rowspan=0。初始实现与测试由同一实现代理交付，未满足先观察测试失败；下方自动测试负责验证实际行为。 |
| 分配独立文件所有权 | 实现代理负责 src 与表格测试；主代理负责构建、文档、包配置和最终审查，避免并发修改同一文件。 |
| 安装模板已有依赖，更新陈旧锁文件 | 离线缓存不全，沙箱 DNS 失败，经授权联网完成。 |
| 参考 pele 修复 macOS 启动 | 使用 execFile/open 启动独立开发 vault；从已安装 loader 读取核心路径，npm 核心包只提供类型。 |
| 审查编辑事件和保存路径 | 在 mousedown 阶段阻止 Typora 源码编辑；拒绝净化后与源码不一致的表格，防止无声丢失内容。 |
| 尝试 Safari WebDriver | Safari 未开启远程自动化，真实浏览器测试受阻；增加测试专用 DOM 环境。 |

约束：crapper、dryer、mutator 工具在本会话中不可用，未声称执行这些检查。未清理其他工作树或用户现有文件。后续验证结果记录于本文末尾。

| 最终验证 | 结果 |
| --- | --- |
| `node test/run.mjs` | 13 个表格行为断言通过；happy-dom 的 rowspan=0 getter 返回 1，增加读取显式 `rowspan="0"` 属性以保留该语义。 |
| `node test/editor.mjs` | 编辑层拦截、矩形选择、合并、提交顺序、取消、预览不一致、并发文档变化、卸载清理通过。仅模拟宿主边界。 |
| `tsc --noEmit` | 通过。 |
| macOS `node build.js` | 开发插件安装与独立 vault 启动命令成功；未自动检查 Typora 屏幕或保存结果。 |
| 生产打包 | 模板 Rollup 输出后不退出，停止两次遗留构建进程；生产改用已有 esbuild，与开发统一。`node build.js --prod` 正常退出，`node pack.js` 生成 ZIP。 |
| ZIP 内容 | main.js、style.css、manifest.json 各一个；无测试文件。 |
| `git diff --check` | 通过。恢复启动生成的机器专用核心路径及设置，忽略运行时 hotkeys。 |

后续实机复验：编辑、合并、保存文件、原生撤销/重做、关闭重开、切换文件时冲突保护。没有将 DOM 边界模拟测试视作 Typora 实机验证。

## 原地编辑改版

- 检查用户当前提交 c504e4c，工作区干净；保留现有构建改动。
- 确认社区 HtmlPostProcessor 是渲染后入口，避免替换 Typora HTML 解析器。
- 比较 CodeMirror 写回和节点快照写回：原地输入选择节点更新 + 原生 replace undo，避免每次输入重新渲染导致光标丢失。
- 实现代理在独立工作树负责 src 与集成测试，主代理负责 Safari 驱动、文档和审查。
- Safari 远程自动化连接成功；测试夹具只模拟 Typora 宿主边界，浏览器负责真实键盘输入与 DOM。
- TDD：旧实现先在「不能打开浮层」断言失败；新实现通过后，再补「无核心 edit 通知的重绘应自动绑定」断言，先观察 `inherit !== true`，再添加只观察新增节点的 MutationObserver。
- 独立审查发现 Typora 的 copy/cut、keypress、compositionstart/end 会进入 Markdown 删除、重绘及 IME 逻辑；补事件传播回归，分别先观察 native handler 被调用的失败，再在文档捕获阶段隔离，保留浏览器默认行为。
- Tab 边界回归先失败，再改为仅在有相邻格子时拦截，允许键盘离开表格。
- 表格原有 13 项断言、原地编辑 DOM 集成测试、TypeScript 均通过。集成测试覆盖即时写回、快照、合并/拆分、IME、剪贴板/按键隔离、导出、冲突、只读、回滚、撤销重绘和卸载。
- Safari WebDriver 通过：真实中文文字输入、光标/表格身份稳定、真实剪切、合并/拆分快捷键、无 UI 属性源码、无 edit 通知重绘后的再次编辑和卸载。截图：`.test-dist/safari-inline.png`。宿主接口使用夹具，不等同 Typora 实机验证。
- `node build.js --prod`、`node pack.js`、`git diff --check` 通过；`node build.js` 成功安装开发插件并打开 Typora 测试 vault。恢复启动自动生成的 core/env 配置，保留可移植设置。
- crapper、dryer、mutator 仍无可用工具，未执行；未清理用户已有工作树或文件。用户在基线中删除的 README 未恢复，新增使用说明放在 docs/usage.md。
