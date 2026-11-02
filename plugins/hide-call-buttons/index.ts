import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { getModules } from '@valenced/modules/finders'
import {
	createFilterGenerator,
	withName,
} from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { getErrorStack } from '@valenced/utils/error'
import { cloneElement } from 'react'
import SettingsComponent from './settings'
import { DefaultSettings } from './shared'
import type {
	Filter,
	FilterGenerator,
	FilterScopes,
} from '@valenced/modules/finders/filters'
import type { FC, MemoExoticComponent, ReactElement, ReactNode } from 'react'
import type { Settings } from './shared'

interface NodeProps {
	children?: ReactNode
	onPress?: unknown
	disabled?: unknown
	accessibilityActions?: { name?: unknown }[]
	trailing?: ReactNode
}

type Node = ReactElement<NodeProps>
type Render = (...args: unknown[]) => ReactNode
type Prune = (rendered: ReactNode, settings: Settings) => ReactNode

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: DefaultSettings,
	},
	start({ cleanup, jsonStorage, plugin }) {
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}

		const patch =
			(label: string, prune: Prune) =>
			(host: Record<string, Render>, key: string) =>
				cleanup(
					after(host, key, rendered => {
						try {
							return prune(rendered, {
								...DefaultSettings,
								...jsonStorage.cache,
							})
						} catch (e) {
							plugin.reportError(
								`Failed to hide ${label} buttons: ${getErrorStack(e)}`,
							)
							return rendered
						}
					}),
				)

		const profile = patch('profile', pruneProfile)
		const dm = patch('DM header', pruneDM)
		const friends = patch('friends list', pruneFriends)
		const voice = patch('voice channel', pruneVoice)

		cleanup(
			getModules(
				withName<Render>('UserProfileContactButtons'),
				module => profile(module as Record<string, Render>, 'default'),
				{ returnNamespace: true },
			),
			getModules(withMemoizedName('PrivateChannelButtons'), component =>
				dm(component as unknown as Record<string, Render>, 'type'),
			),
			// Several lists have a UserRow; the friends list is the one with a call action
			getModules(
				withMemoizedName('UserRow'),
				component =>
					friends(component as unknown as Record<string, Render>, 'type'),
				{ max: 10 },
			),
			// Exported as plain `VideoButton`, a name another module shares
			getModuleWithImportedPath<Record<string, Render>>(
				'modules/voice_panel/native/controls/buttons/VoicePanelVideoButton.tsx',
				module => voice(module, 'default'),
			),
		)
	},
	// Unpatching can't undo what Discord already rendered
	stop({ plugin }) {
		plugin.requireReload()
	},
	SettingsComponent,
})

// The call button is always last in the profile's action row
const pruneProfile: Prune = (root, settings) =>
	settings.upHideVoiceButton
		? replaceInTree(
				root,
				node => pressables(node).length >= 2,
				row => {
					const buttons = pressables(row)
					return without(row, [buttons[buttons.length - 1]])
				},
			)
		: root

// Only the call and video buttons have a disabled prop, in that order
const pruneDM: Prune = (root, settings) => {
	const { dmHideCallButton, dmHideVideoButton } = settings
	if (!isElement(root) || !Array.isArray(root.props.children)) return root
	const toggles = root.props.children.filter(
		child => hasPress(child) && 'disabled' in child.props,
	)
	return without(root, [
		dmHideCallButton ? toggles[0] : undefined,
		dmHideVideoButton ? toggles[1] : undefined,
	])
}

// accessibilityActions and the trailing buttons line up index for index
const pruneFriends: Prune = (root, settings) =>
	settings.friendsHideCallButton
		? replaceInTree(
				root,
				node => callActionIndex(node) >= 0,
				row => {
					const index = callActionIndex(row)
					const actions = row.props.accessibilityActions ?? []
					const trailing = row.props.trailing as Node
					const buttons = trailing.props.children as ReactNode[]
					return cloneElement(row, {
						accessibilityActions: actions.filter((_, i) => i !== index),
						trailing: without(trailing, [buttons[index]]),
					})
				},
			)
		: root

const pruneVoice: Prune = (root, settings) =>
	settings.hideVCVideoButton ? null : root

// Some of Discord's elements carry an older $$typeof, which isValidElement rejects
function isElement(node: unknown): node is Node {
	const candidate = node as { $$typeof?: unknown; props?: unknown } | null
	return (
		typeof candidate === 'object' &&
		candidate !== null &&
		candidate.$$typeof !== undefined &&
		typeof candidate.props === 'object'
	)
}

function hasPress(node: unknown): node is Node {
	return isElement(node) && typeof node.props.onPress === 'function'
}

function pressables(node: Node) {
	const { children } = node.props
	return Array.isArray(children) ? children.filter(hasPress) : []
}

function callActionIndex(node: Node) {
	const { accessibilityActions, trailing } = node.props
	const buttons = isElement(trailing) ? trailing.props.children : undefined
	if (
		!Array.isArray(accessibilityActions) ||
		!Array.isArray(buttons) ||
		buttons.length !== accessibilityActions.length
	)
		return -1
	return accessibilityActions.findIndex(
		action => String(action?.name).toLowerCase() === 'call',
	)
}

// A copy of the row with the given children taken out; untouched if that would empty it
function without(row: Node, remove: ReactNode[]) {
	const { children } = row.props
	if (!Array.isArray(children)) return row
	const kept = children.filter(
		child => child == null || !remove.includes(child),
	)
	return kept.length > 0 && kept.length !== children.length
		? cloneElement(row, undefined, ...kept)
		: row
}

// Discord's compiler reuses rendered elements, so the path to the change is copied
function replaceInTree(
	root: ReactNode,
	match: (node: Node) => boolean,
	replace: (node: Node) => ReactNode,
	depth = 0,
): ReactNode {
	if (depth > 10 || !isElement(root)) return root
	if (match(root)) return replace(root)
	const { children } = root.props
	if (Array.isArray(children)) {
		for (let i = 0; i < children.length; i++) {
			const next = replaceInTree(children[i], match, replace, depth + 1)
			if (next === children[i]) continue
			const copy = [...children]
			copy[i] = next
			return cloneElement(root, undefined, ...copy)
		}
		return root
	}
	const next = replaceInTree(children, match, replace, depth + 1)
	return next === children ? root : cloneElement(root, undefined, next)
}

// withName can't see through memo(), but the wrapped function keeps its name
const withMemoizedName = createFilterGenerator(
	([name], _, exports) =>
		typeof exports?.type === 'function' && exports.type.name === name,
	([name]) => `bleelblep.hide-call-buttons.memoizedName(${name})`,
) as FilterGenerator<
	<P = object>(
		name: string,
	) => Filter<{
		Result: MemoExoticComponent<FC<P>>
		Scopes: [typeof FilterScopes.Initialized]
	}>
>
