# 实现检查

- [x] 调查 HTMLBlock 写回路径与社区扩展 API。
- [x] 比较原地 DOM 修改、独立模态窗、原位置可视层；选择原位置层，避免无模型持久化的 DOM 修改。
- [x] Blocking first steps：先确认写回接口，再开发交互。
- [x] Independent workstreams：src/测试与构建/文档分配不同文件所有权。
- [x] Shared mutable state：单个编辑会话，保存前校验原文。
- [x] Smallest safe decomposition：一名实现代理负责相互耦合的表格及编辑层，主代理审查并完成集成。
- [x] 验证表格操作、编辑交互、类型、构建、包内容。
- [ ] Typora 真实保存/撤销/重开；skip: 当前无可用界面驱动，Safari 未开启远程自动化。
