import { setSettings } from './native'
import SettingsComponent from './settings'

export interface Settings {
	headings: boolean
	dimMarkers: boolean
	monoCode: boolean
	menu: string[]
}

// Ids match Format.kt
export const Formats = [
	{ id: 'bold', label: 'Bold' },
	{ id: 'italic', label: 'Italic' },
	{ id: 'underline', label: 'Underline' },
	{ id: 'strike', label: 'Strikethrough' },
	{ id: 'spoiler', label: 'Spoiler' },
	{ id: 'code', label: 'Code' },
	{ id: 'codeBlock', label: 'Code block' },
	{ id: 'link', label: 'Link' },
	{ id: 'h1', label: 'Big heading' },
	{ id: 'h2', label: 'Medium heading' },
	{ id: 'h3', label: 'Small heading' },
	{ id: 'subtext', label: 'Subtext' },
	{ id: 'quote', label: 'Quote' },
	{ id: 'ansi', label: 'ANSI color' },
]

export const DefaultSettings: Settings = {
	headings: true,
	dimMarkers: true,
	monoCode: true,
	menu: Formats.map(f => f.id),
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DefaultSettings },
	start({ jsonStorage, cleanup, plugin }) {
		// Tracked from subscribe: the settings page writes through another handle, which this cache doesn't see
		let current: Settings = { ...DefaultSettings, ...jsonStorage.cache }
		const push = (patch?: Partial<Settings>) => {
			if (patch) current = { ...current, ...patch }
			setSettings(current).catch(error => plugin.reportError(error))
		}

		push()
		cleanup(jsonStorage.subscribe(patch => push(patch as Partial<Settings>)))
	},
	SettingsComponent,
})
