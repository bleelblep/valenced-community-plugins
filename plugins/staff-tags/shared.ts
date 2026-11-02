import { getErrorStack } from '@valenced/utils/error'
import type { JsonStorage } from '@valenced/json-storage'

export interface TagOverride {
	enabled?: boolean
	text?: string
	useCustomColor?: boolean
	color?: string
}

export interface Settings {
	useRoleColor: boolean
	tags: Record<string, TagOverride>
}

export const DefaultSettings: Settings = { useRoleColor: false, tags: {} }

let storage: JsonStorage<Settings> | undefined
let reporter: { reportError(error: unknown): void } | undefined

export function init(
	jsonStorage?: JsonStorage<Settings>,
	plugin?: { reportError(error: unknown): void },
) {
	storage = jsonStorage
	reporter = plugin
}

export function settings(): Settings {
	return { ...DefaultSettings, ...storage?.cache }
}

export function overrideFor(id: string): TagOverride {
	return settings().tags?.[id] ?? {}
}

export function setOverride(id: string, patch: TagOverride) {
	storage?.set({ tags: { [id]: patch } } as Partial<Settings>)
}

export function report(context: string, error?: unknown) {
	const message =
		error === undefined ? context : `${context}: ${getErrorStack(error)}`
	reporter?.reportError(message)
}
