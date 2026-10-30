# 原地编辑检查

- [x] Ground：核实 HTML 渲染、后处理和原生撤销记录路径。
- [x] Sketch：比较重绘写回和节点快照写回，见 inline-design.md。
- [x] Agree：采用安全渲染后的表格 DOM + 节点快照，不复制浮层。
- [x] Implement：先观察新交互测试失败，再改实现。
- [x] Scrap：节点快照通过自动验证，无需重设；宿主实机兼容性仍需复验。
- [x] Blocking first steps：先验证私有接口及 Safari 自动化。
- [x] Independent workstreams：代理独立工作树负责代码/集成测试，主线程负责浏览器驱动/文档。
- [x] Shared mutable state：单个表格会话关联 DOM 与模型，写回前检查版本。
- [x] Smallest safe decomposition：耦合实现由一名代理完成，主线程独立验收。
- [x] DOM 回归、类型检查、真实 Safari 输入和构建。
- [x] 完成代码与验证记录；提交、推送结果见交付回复。

## 原生菜单与合并布局

- [x] Blocking first steps：确认 core keyup 分发及合并函数全部调用者。
- [x] Independent workstreams：代理只提供布局补丁，主线程负责菜单/快捷键和集成。
- [x] Shared mutable state：无共享写入，保持现有单编辑会话。
- [x] Smallest safe decomposition：移除菜单及直接快捷键处理，复用现有注册与 CellRect。
- [x] 新测试先失败，最小补丁后行为、集成和类型检查通过。
- [x] Safari 与打包验收；提交结果见交付回复。
