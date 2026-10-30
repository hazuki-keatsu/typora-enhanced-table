# Enhanced Table 开发样例

点击下方 HTML 表格，在原位置编辑。点击一个格子，再 Shift 点击另一个格子选择矩形，合并或拆分后点保存。

<table>
<thead><tr><th>项目</th><th>第一季度</th><th>第二季度</th></tr></thead>
<tbody>
<tr><td>设计</td><td>草稿</td><td>定稿</td></tr>
<tr><td>开发</td><td>原型</td><td>发布</td></tr>
</tbody>
</table>

已有合并单元格：

<table>
<tbody>
<tr><td rowspan="2">阶段</td><td>设计</td><td>检查</td></tr>
<tr><td colspan="2">开发与验证</td></tr>
</tbody>
</table>

普通 Markdown 表格仍由 Typora 编辑：

| 项目 | 状态 |
| --- | --- |
| 普通表格 | 原生编辑 |
