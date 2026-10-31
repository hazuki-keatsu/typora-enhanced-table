import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import typoraPlugin from "esbuild-plugin-typora";

class I18n {
	constructor({ localePath, userLang, defaultLang = "en" }) {
		const locale = userLang.toLowerCase();
		this.locale = [locale, locale.split("-")[0], defaultLang].find(
			(language) => {
				try {
					readFileSync(`${localePath}/lang.${language}.json`);
					return true;
				} catch {
					return false;
				}
			},
		);
		this.t = JSON.parse(
			readFileSync(`${localePath}/lang.${this.locale}.json`, "utf8"),
		);
	}
}

globalThis.window = { [Symbol.for("typora-plugin-core@v2")]: { I18n } };

for (const mode of ["development", "production"]) {
	const result = await build({
		entryPoints: ["src/locale.ts"],
		bundle: true,
		write: false,
		format: "esm",
		minify: mode === "production",
		plugins: [typoraPlugin({ mode })],
	});
	const { setLocale, t, translateError } = await import(
		`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
	);
	for (const [locale, text] of [
		["zh-CN", "合并单元格"],
		["zh-cn", "合并单元格"],
		["en", "Merge cells"],
		["fr", "Merge cells"],
	]) {
		setLocale({ localePath: "src/locales", userLang: locale });
		assert.equal(t("mergeCells"), text, `${mode}: ${locale}`);
		assert.equal(translateError("cellOutsideTable"), t("cellOutsideTable"));
		assert.equal(translateError("Unknown host error"), "Unknown host error");
	}
}

console.log(
	"PASS locale: Typora build loads, Chinese/English selection, errors",
);
