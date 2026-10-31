import { I18n } from "@typora-community-plugin/core";
import type * as en from "./locales/lang.en.json";

export type MessageKey = keyof typeof en;
let messages: I18n<typeof en>["t"];

export function setLocale(options: { localePath: string; userLang: string }) {
	messages = new I18n<typeof en>({
		localePath: options.localePath,
		defaultLang: "en",
		userLang: options.userLang,
	}).t;
}

export function t(key: MessageKey): string {
	return messages[key];
}

export function translateError(message: string): string {
	return Object.hasOwn(messages, message)
		? messages[message as MessageKey]
		: message;
}
