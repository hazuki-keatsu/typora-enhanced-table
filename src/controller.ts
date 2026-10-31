import type { TableOperation } from "./table";

let controllerId = 0;

const operations: [TableOperation, string][] = [
	["insert-above", "上方插入行"],
	["insert-below", "下方插入行"],
	["insert-left", "左侧插入列"],
	["insert-right", "右侧插入列"],
	["delete-row", "删除所在行"],
	["delete-column", "删除所在列"],
	["set-header", "将首行设为表头"],
];

function menuIcon(): SVGSVGElement {
	// From Lucide Icons - layout-grid-circles
	const raw = `
		<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layout-grid-circles preview-icon">
			<circle cx="17.5" cy="17.5" r="3.5"/>
			<circle cx="17.5" cy="6.5" r="3.5"/>
			<circle cx="6.5" cy="17.5" r="3.5"/>
			<circle cx="6.5" cy="6.5" r="3.5"/>
		</svg>
	`;

	const tpl = document.createElement('template');
	tpl.innerHTML = raw.trim();
	const svg = tpl.content.firstElementChild;

	if (!(svg instanceof SVGSVGElement)) {
		throw new Error('menuIcon: invalid SVG');
	}
	return svg;
}

export function attachTableController(
	table: HTMLTableElement,
	actions: {
		hasSelection(): boolean;
		run(operation: TableOperation): void;
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
	const buttons = operations.map(([operation, text]) => {
		const button = doc.createElement("button");
		button.type = "button";
		button.textContent = text;
		button.dataset.operation = operation;
		button.setAttribute("role", "menuitem");
		button.onclick = () => {
			if (!actions.hasSelection()) return;
			actions.run(operation);
			close();
		};
		popup.append(button);
		return button;
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
		const selected = actions.hasSelection();
		buttons.forEach((button) => {
			button.disabled = !selected;
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
