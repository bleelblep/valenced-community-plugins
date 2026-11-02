import { getAssetIdByName } from '@valenced/assets'
import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'
import { after, before, instead } from '@valenced/patcher'
import { cloneElement, isValidElement } from 'react'
import SettingsComponent, { promptOverride } from './settings'
import {
	badgeColor,
	DefaultSettings,
	onUpdate,
	reportError,
	setReporter,
	setStorage,
	settings,
	tagColorProps,
} from './shared'
import {
	onProfileChange,
	onResolved,
	prime,
	resolve,
	stopPronounDb,
	watchDiscord,
} from './sources'
import type { DiscordModules } from '@valenced/discord/types'
import type { ReactElement, ReactNode } from 'react'
import type { Settings } from './shared'

interface Message {
	id: string
	channel_id: string
	content?: string
	author?: { id: string; globalName?: string | null; username?: string }
}

interface TagProperties {
	tagText?: string
	tagType?: number
}

interface TagModule {
	default(input: { message: Message }): TagProperties
}

interface MessageCollection {
	has(id: string): boolean
	update(id: string, fn: (message: Message) => Message): MessageCollection
}

interface ChannelMessages {
	getOrCreate(channelId: string): MessageCollection
	commit(collection: MessageCollection): void
}

interface SheetModule {
	default: (props: { message?: Message }) => ReactNode
}

type Element = ReactElement<{ children?: ReactNode; message?: Message }>

interface Row {
	authorId: string
	guildId?: string
	shown?: string
}

const ZWSP = '​'
// A space first, so a message that ends in a link keeps it as a link
const REDRAW_MARK = ` ${ZWSP}`
const MAX_RECENT_ROWS = 200

const recent = new Map<string, Row>()
let refreshTimer: ReturnType<typeof setTimeout> | undefined
let channelMessages: ChannelMessages | undefined
let emitQueued = false

function track(key: string, row: Row) {
	recent.delete(key)
	recent.set(key, row)
	if (recent.size > MAX_RECENT_ROWS)
		recent.delete(recent.keys().next().value as string)
}

function badgeFor(authorId: string, guildId?: string) {
	if (!settings().showInChat) return undefined
	const text = resolve(authorId, guildId)
	return text && `${text}\0${badgeColor() ?? ''}`
}

function refresh() {
	if (refreshTimer !== undefined) return
	refreshTimer = setTimeout(() => {
		refreshTimer = undefined
		for (const [key, row] of [...recent]) {
			try {
				if (badgeFor(row.authorId, row.guildId) === row.shown) continue
				const [channelId, messageId] = key.split(':') as [string, string]
				redrawMessage(channelId, messageId)
			} catch (error) {
				reportError('refresh failed', error)
			}
		}
	}, 50)
}

// A copy that toggles a trailing zero-width space, since the row diff compares records by value
function redrawMessage(channelId: string, messageId: string) {
	try {
		if (!channelMessages) return
		const collection = channelMessages.getOrCreate(channelId)
		if (!collection.has(messageId)) return
		const updated = collection.update(messageId, message => {
			// Records rebuilt with merge() or the constructor lose array fields and crash the row
			const copy: Message = Object.create(Object.getPrototypeOf(message))
			Object.defineProperties(copy, Object.getOwnPropertyDescriptors(message))
			if (typeof copy.content === 'string')
				copy.content = copy.content.endsWith(REDRAW_MARK)
					? copy.content.slice(0, -REDRAW_MARK.length)
					: copy.content + REDRAW_MARK
			return copy
		})
		channelMessages.commit(updated)
		// Emitting inside the current dispatch re-enters React mid-render
		if (!emitQueued) {
			emitQueued = true
			queueMicrotask(() => {
				emitQueued = false
				try {
					;(
						Stores.MessageStore as DiscordModules.Flux.Store<{
							emitChange(): void
						}>
					).emitChange()
				} catch (error) {
					reportError('redraw emit failed', error)
				}
			})
		}
	} catch (error) {
		reportError('redraw failed', error)
	}
}

function tagFor(ret: TagProperties, message: Message | undefined) {
	if (ret?.tagText || !message?.author?.id) return ret
	const key = `${message.channel_id}:${message.id}`
	const authorId = String(message.author.id)
	if (!settings().showInChat) {
		track(key, { authorId })
		return ret
	}

	const ChannelStore = Stores.ChannelStore as DiscordModules.Flux.Store<{
		getChannel(id: string): { guild_id?: string | null } | undefined
	}>
	const guildId =
		ChannelStore.getChannel(message.channel_id)?.guild_id ?? undefined
	prime(authorId, guildId)
	const text = resolve(authorId, guildId)
	track(key, { authorId, guildId, shown: badgeFor(authorId, guildId) })
	if (!text) return ret
	return {
		...ret,
		tagText: text,
		tagType: undefined,
		...tagColorProps(),
	}
}

function SheetRow({ message }: { message: Message }) {
	const { ActionSheetRow } = Design
	const authorId = String(message.author?.id ?? '')
	const override = settings().overrides[authorId]
	return (
		<ActionSheetRow.Group>
			<ActionSheetRow
				label="Set pronouns"
				subLabel={typeof override === 'string' ? override : undefined}
				icon={
					<ActionSheetRow.Icon source={getAssetIdByName('UserCircleIcon')} />
				}
				onPress={() => {
					ActionSheetActionCreators.hideActionSheet()
					const { globalName, username } = message.author ?? {}
					promptOverride(authorId, globalName ?? username ?? 'this person')
				}}
			/>
		</ActionSheetRow.Group>
	)
}

function findMessage(node: ReactNode, depth = 0): Message | undefined {
	if (!node || depth > 30) return undefined
	if (Array.isArray(node)) {
		for (const child of node) {
			const found = findMessage(child, depth + 1)
			if (found) return found
		}
		return undefined
	}
	if (!isValidElement(node)) return undefined
	const { props } = node as Element
	return props.message?.author
		? props.message
		: findMessage(props.children, depth + 1)
}

// Copies the path down to the sheet's row groups rather than editing Discord's tree
function withSheetRow(
	node: ReactNode,
	row: ReactElement,
	inSheet = false,
	depth = 0,
): ReactNode {
	if (!node || depth > 40) return node
	if (Array.isArray(node)) {
		for (let i = 0; i < node.length; i++) {
			const next = withSheetRow(node[i], row, inSheet, depth + 1)
			if (next !== node[i]) {
				const copy = [...node]
				copy[i] = next
				return copy
			}
		}
		return node
	}
	if (!isValidElement(node)) return node
	const element = node as Element
	const inside = inSheet || element.type === Design.ActionSheet
	const { children } = element.props
	const groups = Array.isArray(children) ? children : [children]
	if (
		inside &&
		groups.some(
			child =>
				isValidElement(child) && child.type === Design.ActionSheetRow.Group,
		)
	)
		return cloneElement(element, { children: [row, ...groups] })
	const next = withSheetRow(children, row, inside, depth + 1)
	return next === children ? element : cloneElement(element, { children: next })
}

function addSheetRows(rendered: ReactNode, message: Message | undefined) {
	if (!message?.author?.id) return rendered
	return withSheetRow(rendered, <SheetRow message={message} />)
}

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

		setReporter(plugin)
		setStorage(jsonStorage)
		cleanup(
			() => setReporter(undefined),
			() => setStorage(undefined),
		)

		cleanup(
			watchDiscord(),
			// lib/ChannelMessages.tsx; 350.4 moved it behind `_channelMessages`
			getModules(
				withProps<ChannelMessages>('getOrCreate', 'commit'),
				exports => {
					channelMessages ??= exports
				},
			),
			getModules(
				withProps<{ _channelMessages: ChannelMessages }>('_channelMessages'),
				({ _channelMessages: cache }) => {
					if (
						typeof cache?.getOrCreate === 'function' &&
						typeof cache.commit === 'function'
					)
						channelMessages ??= cache
				},
			),
			() => {
				channelMessages = undefined
			},
		)

		cleanup(
			// modules/messages/native/renderer/getTagProperties.tsx
			getModules(
				withName<TagModule>('getTagProperties'),
				found => {
					const mod = found as TagModule
					if (typeof mod?.default !== 'function') return
					cleanup(
						instead(mod, 'default', function (args, original) {
							const ret = Reflect.apply(original, this, args)
							try {
								return tagFor(ret, args[0]?.message)
							} catch (error) {
								reportError('chat tag failed', error)
								return ret
							}
						}),
					)
				},
				{ returnNamespace: true },
			),
			onResolved(refresh),
			onProfileChange(refresh),
			onUpdate(refresh),
			() => {
				clearTimeout(refreshTimer)
				refreshTimer = undefined
				recent.clear()
			},
		)

		const patched = new WeakSet<SheetModule>()
		const patchSheet = (mod: SheetModule) => {
			if (typeof mod?.default !== 'function' || patched.has(mod)) return mod
			patched.add(mod)
			let message: Message | undefined
			cleanup(
				before(mod, 'default', args => {
					message = args[0]?.message
					return args
				}),
				after(mod, 'default', rendered => {
					const sheetMessage = message
					message = undefined
					try {
						if (rendered != null)
							return addSheetRows(
								rendered,
								sheetMessage?.author ? sheetMessage : findMessage(rendered),
							)
					} catch (error) {
						reportError('sheet injection failed', error)
					}
					return rendered
				}),
			)
			return mod
		}

		cleanup(
			// The message sheet's module has no stable name, so match openLazy's key
			before(ActionSheetActionCreators, 'openLazy', args => {
				const [sheet, key] = args
				if (
					typeof key === 'string' &&
					/message/i.test(key) &&
					!/channel|forum|guild|thread/i.test(key) &&
					typeof sheet?.then === 'function'
				)
					args[0] = sheet.then(mod => patchSheet(mod as SheetModule))
				return args
			}),
		)
	},
	stop({ plugin }) {
		stopPronounDb()
		plugin.requireReload()
	},
	SettingsComponent,
})
