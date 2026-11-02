import { ToastActionCreators } from '@valenced/discord/actions'
import { JsonStorageUpdateMode } from '@valenced/json-storage'
import { getErrorStack } from '@valenced/utils/error'
import { useEffect, useReducer } from 'react'
import { processColor } from 'react-native'
import type { JsonStorage } from '@valenced/json-storage'

export interface Settings {
	showInChat: boolean
	discordFirst: boolean
	pronounDbEnabled: boolean
	validOnly: boolean
	allowAnyAll: boolean
	badgeColor: string
	overrides: Record<string, string | null>
}

export const DefaultSettings: Settings = {
	showInChat: true,
	discordFirst: true,
	pronounDbEnabled: true,
	validOnly: true,
	allowAnyAll: true,
	badgeColor: '',
	overrides: {},
}

type Stored = Partial<Settings>

// Kept in memory because jsonStorage.get() is async and merge writes can't delete map keys
let storage: JsonStorage<Settings> | undefined
let unsubscribe: (() => void) | undefined
let loaded = false
let mirror: Settings = { ...DefaultSettings }
const listeners = new Set<() => void>()

function notify() {
	for (const listener of listeners) listener()
}

function withoutNulls(map: Settings['overrides']) {
	const clean: Record<string, string> = {}
	for (const [id, value] of Object.entries(map))
		if (value != null) clean[id] = value
	return clean
}

function merge(base: Settings, value: Stored | undefined): Settings {
	const patch = value?.overrides
	const overrides =
		patch && typeof patch === 'object'
			? { ...base.overrides, ...patch }
			: base.overrides
	return { ...base, ...value, overrides: withoutNulls(overrides) }
}

export function setStorage(handle: JsonStorage<Settings> | undefined) {
	unsubscribe?.()
	unsubscribe = undefined
	storage = handle
	loaded = false
	mirror = { ...DefaultSettings }
	if (!handle) return

	const cache = handle.cache as Stored | undefined
	if (cache) {
		mirror = merge(DefaultSettings, cache)
		loaded = true
	}
	unsubscribe = handle.subscribe((patch, mode) => {
		const merging = mode === JsonStorageUpdateMode.Merge
		mirror = merge(merging ? mirror : DefaultSettings, patch as Stored)
		loaded = true
		notify()
	})
	handle
		.get()
		.then(value => {
			if (value) mirror = merge(DefaultSettings, value)
			loaded = true
			notify()
		})
		.catch(() => {})
}

export function settings(): Settings {
	return mirror
}

export function useSettings(): Settings {
	const [, rerender] = useReducer((n: number) => n + 1, 0)
	useEffect(() => onUpdate(rerender), [])
	return mirror
}

export function update(patch: Stored) {
	mirror = merge(mirror, patch)
	if (patch.overrides)
		mirror = { ...mirror, overrides: withoutNulls(patch.overrides) }
	notify()
	// Before the file loads, merge so nothing on disk is lost
	const write = loaded ? storage?.set(mirror, true) : storage?.set(patch)
	write?.catch(() => {})
}

export function onUpdate(fn: () => void): () => void {
	listeners.add(fn)
	return () => listeners.delete(fn)
}

let reporter: { reportError(e: unknown): void } | undefined

export function setReporter(plugin: typeof reporter) {
	reporter = plugin
}

export function reportError(context: string, error: unknown) {
	const message = `Pronouns: ${context}: ${getErrorStack(error)}`
	reporter?.reportError(message)
}

export function toast(text: string, key: string) {
	ToastActionCreators.open(key, { text })
}

export const PRESETS = [
	'#5865F2',
	'#EB459E',
	'#ED4245',
	'#F0B232',
	'#57F287',
	'#3BA55C',
	'#00A8FC',
	'#9B59B6',
	'#99AAB5',
	'#23272A',
]

const HEX = /^#[0-9a-f]{6}$/i

export function isDark(hex: string) {
	const [r = 0, g = 0, b = 0] = [1, 3, 5].map(i =>
		Number.parseInt(hex.slice(i, i + 2), 16),
	)
	return (r * 299 + g * 587 + b * 114) / 1000 < 140
}

export function badgeColor() {
	return HEX.test(mirror.badgeColor) ? mirror.badgeColor : undefined
}

export function tagColorProps() {
	const background = badgeColor()
	if (!background) return {}
	return {
		tagBackgroundColor: processColor(background),
		tagTextColor: processColor(isDark(background) ? '#FFFFFF' : '#000000'),
	}
}
