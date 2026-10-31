import {
	ArrowBigUp,
	ChevronUp,
	Command,
	CornerDownLeft,
	Delete,
	LayoutGridCircles,
	LetterA,
	LetterB,
	LetterC,
	LetterD,
	LetterE,
	LetterF,
	LetterG,
	LetterH,
	LetterI,
	LetterJ,
	LetterK,
	LetterL,
	LetterM,
	LetterN,
	LetterO,
	LetterP,
	LetterQ,
	LetterR,
	LetterS,
	LetterT,
	LetterU,
	LetterV,
	LetterW,
	LetterX,
	LetterY,
	LetterZ,
	Option,
	TextAlignCenter,
	TextAlignEnd,
	TextAlignStart,
	createElement,
} from "lucide";

export function menuIcon(): SVGElement {
	return createElement(LayoutGridCircles);
}

export function textAlignLeftIcon(): SVGElement {
	return createElement(TextAlignStart);
}

export function textAlignCenterIcon(): SVGElement {
	return createElement(TextAlignCenter);
}

export function textAlignRightIcon(): SVGElement {
	return createElement(TextAlignEnd);
}

export function renderHotkey(element: Element, value: string): void {
	if (!/Mac/.test(navigator.platform)) {
		element.removeAttribute("aria-label");
		element.textContent = value
			.split("+")
			.map((part) =>
				part.length === 1
					? part.toUpperCase()
					: part.charAt(0).toUpperCase() + part.slice(1),
			)
			.join("+");
		return;
	}
	const letters = [
		LetterA,
		LetterB,
		LetterC,
		LetterD,
		LetterE,
		LetterF,
		LetterG,
		LetterH,
		LetterI,
		LetterJ,
		LetterK,
		LetterL,
		LetterM,
		LetterN,
		LetterO,
		LetterP,
		LetterQ,
		LetterR,
		LetterS,
		LetterT,
		LetterU,
		LetterV,
		LetterW,
		LetterX,
		LetterY,
		LetterZ,
	];
	const icons: Record<string, typeof Command> = {
		meta: Command,
		command: Command,
		cmd: Command,
		ctrl: ChevronUp,
		control: ChevronUp,
		alt: Option,
		option: Option,
		shift: ArrowBigUp,
		enter: CornerDownLeft,
		backspace: Delete,
	};
	element.replaceChildren();
	element.setAttribute("aria-label", value);
	const accessible = document.createElement("span");
	accessible.className = "enhanced-table-hotkey-label";
	accessible.textContent = value;
	element.append(accessible);
	for (const part of value.split("+")) {
		const key = part.toLowerCase();
		const icon =
			icons[key] ??
			(/^[a-z]$/.test(key) ? letters[key.charCodeAt(0) - 97] : undefined);
		if (icon) {
			const svg = createElement(icon);
			svg.setAttribute("aria-hidden", "true");
			element.append(svg);
		} else element.append(document.createTextNode(part));
	}
}
