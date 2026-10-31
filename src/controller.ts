import type { TableOperation } from "./table";
import { menuIcon, renderHotkey } from "./icons";

type MenuOperation =
	| TableOperation
	| "merge"
	| "split"
	| "copy-table"
	| "delete-table";

let controllerId = 0;

const operations: [MenuOperation, string][][] = [
	[
		["insert-above", "上方插入行"],
		["insert-below", "下方插入行"],
	],
	[
		["insert-left", "左侧插入列"],
		["insert-right", "右侧插入列"],
	],
	[
		["delete-row", "删除所在行"],
		["delete-column", "删除所在列"],
	],
	[
		["merge", "合并单元格"],
		["split", "拆分单元格"],
		["set-header", "将首行设为表头"],
	],
	[
		["copy-table", "复制表格"],
		["delete-table", "删除表格"],
	],
];

export function attachTableController(
	table: HTMLTableElement,
	actions: {
		hasSelection(operation: MenuOperation): boolean;
		run(operation: MenuOperation): void;
		hotkey(operation: MenuOperation): string | undefined;
	},
): () => void {
	const doc = table.ownerDocument;
	const controls = doc.createElement("div");
	controls.className = "enhanced-table-controls";
	controls.setAttribute("data-enhanced-table-controls", "");
	controls.setAttribute("contenteditable", "false");
	const trigger = doc.createElement("button");
	trigger.type = "button";
	trigger.append(menuIcon());
	trigger.title = "表格操作";
	trigger.setAttribute("aria-label", "表格操作");
	trigger.setAttribute("aria-expanded", "false");
	const popup = doc.createElement("div");
	popup.id = `enhanced-table-controller-${++controllerId}`;
	popup.className = "enhanced-table-controller-popup";
	popup.setAttribute("role", "menu");
	popup.hidden = true;
	trigger.setAttribute("aria-controls", popup.id);
	const buttons = operations.flatMap((items) => {
		const group = doc.createElement("div");
		group.className = "enhanced-table-controller-group";
		group.setAttribute("role", "group");
		popup.append(group);
		return items.map(([operation, text]) => {
			const button = doc.createElement("button");
			button.type = "button";
			button.textContent = text;
			const hint = doc.createElement("span");
			hint.className = "enhanced-table-hotkey";
			button.append(hint);
			button.dataset.operation = operation;
			button.setAttribute("role", "menuitem");
			button.onclick = () => {
				if (!actions.hasSelection(operation)) return;
				actions.run(operation);
				close();
			};
			group.append(button);
			return button;
		});
	});
	const close = () => {
		popup.hidden = true;
		trigger.setAttribute("aria-expanded", "false");
	};
	trigger.onclick = () => {
		if (!popup.hidden) {
			close();
			return;
		}
		buttons.forEach((button) => {
			const operation = button.dataset.operation as MenuOperation;
			button.disabled = !actions.hasSelection(operation);
			const hint = button.querySelector(".enhanced-table-hotkey");
			if (hint) renderHotkey(hint, actions.hotkey(operation) ?? "");
		});
		popup.hidden = false;
		trigger.setAttribute("aria-expanded", "true");
	};
	controls.addEventListener("mousedown", (event) => {
		event.stopPropagation();
		event.preventDefault();
	});
	for (const name of ["click", "mouseup", "dblclick", "keypress", "keyup"])
		controls.addEventListener(name, (event) => {
			event.stopPropagation();
		});
	controls.addEventListener("keydown", (event) => {
		event.stopPropagation();
		if (event.key !== "Escape") return;
		event.preventDefault();
		close();
		trigger.focus();
	});
	const dismiss = (event: Event) => {
		if (event.target instanceof Node && !controls.contains(event.target))
			close();
	};
	doc.addEventListener("mousedown", dismiss, true);
	doc.addEventListener("focusin", dismiss, true);
	controls.append(trigger, popup);
	table.before(controls);
	return () => {
		doc.removeEventListener("mousedown", dismiss, true);
		doc.removeEventListener("focusin", dismiss, true);
		controls.remove();
	};
}
