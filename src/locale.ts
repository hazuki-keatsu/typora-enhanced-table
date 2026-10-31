import { I18n } from "@typora-community-plugin/core";
import en from "./locales/lang.en.json";
import zh from "./locales/lang.zh-CN.json";

export type MessageKey = keyof typeof en;
let messages: Record<MessageKey, string> = zh;

export function setLocale(locale: string) {
	const language = /^zh(?:[-_]|$)/i.test(locale) ? "zh-CN" : "en";
	messages = new I18n({
		resources: { en, "zh-CN": zh },
		defaultLang: "en",
		userLang: language,
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
