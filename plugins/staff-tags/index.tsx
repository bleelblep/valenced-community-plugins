import { getModules } from '@valenced/modules/finders'
import {
	createFilterGenerator,
	withName,
	withProps,
} from '@valenced/modules/finders/filters'
import { after, instead } from '@valenced/patcher'
import { findInReactFiber } from '@valenced/utils/react'
import { cloneElement, createElement, isValidElement } from 'react'
import { processColor } from 'react-native'
import SettingsComponent from './settings'
import { DefaultSettings, init, report, settings } from './shared'
import {
	getTag,
	isBuiltInTag,
	setPermissionUtils,
	setTagModule,
	store,
	tagModule,
	tagProps,
} from './tags'
import type { ReactElement, ReactNode } from 'react'
import type { Settings } from './shared'
import type {
	PermissionUtils,
	ResolvedTag,
	TagModule,
	TagProps,
	User,
} from './tags'

type Element = ReactElement<{ children?: ReactNode; [prop: string]: unknown }>

interface TagProperties {
	tagText?: string
	tagType?: number
	tagTextColor?: unknown
	tagBackgroundColor?: unknown
	tagVerified?: boolean
}

interface Message {
	channel_id?: string
	author?: User
}

interface UserProps {
	guildId?: string
	user?: User
}

type DisplayName = (props: UserProps) => ReactNode

interface ProfileModule {
	default: (...args: unknown[]) => ReactNode
	DisplayName: DisplayName
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

		init(jsonStorage, plugin)
		cleanup(() => {
			init()
			setTagModule(undefined)
			setPermissionUtils(undefined)
		})

		const patchedRows = new WeakSet<object>()
		const patchRow = (row: { type?: unknown } | undefined) => {
			if (typeof row?.type !== 'function' || patchedRows.has(row)) return
			patchedRows.add(row)
			cleanup(
				instead(
					row as { type: (props: UserProps) => ReactNode },
					'type',
					function (args, original) {
						const rendered = Reflect.apply(original, this, args)
						try {
							return addRowTag(rendered, args[0])
						} catch (error) {
							report('Member list tag failed', error)
							return rendered
						}
					},
				),
			)
		}

		cleanup(
			getModules(withProps<TagModule>('getBotLabel'), module => {
				if (typeof module?.default !== 'function') return
				setTagModule(module)
				cleanup(
					instead(module, 'default', function (args, original) {
						const rendered = Reflect.apply(original, this, args)
						try {
							return paintTag(rendered, args[0])
						} catch (error) {
							report('Tag paint failed', error)
							return rendered
						}
					}),
				)
			}),

			// PermissionStore also has computePermissions, but answers for the current user only
			getModules(
				withProps<PermissionUtils>('computePermissions', 'canEveryoneRole'),
				setPermissionUtils,
			),

			getModules(
				withName<(input: { message?: Message }) => TagProperties | undefined>(
					'getTagProperties',
				),
				exports => {
					const module = exports as unknown as {
						default(input: { message?: Message }): TagProperties | undefined
					}
					cleanup(
						instead(module, 'default', function (args, original) {
							const ret = Reflect.apply(original, this, args)
							try {
								return addMessageTag(ret, args[0]?.message)
							} catch (error) {
								report('Chat tag failed', error)
								return ret
							}
						}),
					)
				},
				{ returnNamespace: true },
			),

			getModules(withName('UserRow'), patchRow, { max: 10 }),
			getModules(withMemoName('UserRow'), patchRow, { max: 10 }),

			// The profile's default export renders DisplayName from module scope, so the element is swapped
			getModules(withProps<ProfileModule>('DisplayName'), module => {
				const { DisplayName } = module
				if (
					typeof module.default !== 'function' ||
					typeof DisplayName !== 'function'
				)
					return

				const Wrapped: DisplayName = props => {
					const rendered = DisplayName(props)
					try {
						return addProfileTag(rendered, props)
					} catch (error) {
						report('Profile tag failed', error)
						return rendered
					}
				}

				cleanup(
					after(module, 'default', rendered => {
						try {
							return replaceInTree(
								rendered,
								node => node.type === DisplayName,
								node =>
									createElement(Wrapped, {
										...(node.props as UserProps),
										key: node.key,
									}),
							)
						} catch (error) {
							report('Profile failed', error)
							return rendered
						}
					}),
				)
			}),
		)
	},
	// Unpatching can't undo what Discord already rendered
	stop({ plugin }) {
		plugin.requireReload()
	},
	SettingsComponent,
})

// Message rows are drawn natively from text and colours
function addMessageTag(ret: TagProperties | undefined, message?: Message) {
	if (ret?.tagText || !message?.author) return ret

	const channel = store('ChannelStore')?.getChannel(message.channel_id)
	const guild = store('GuildStore')?.getGuild(channel?.guild_id)
	const tag = getTag(guild, channel, message.author, settings().useRoleColor)
	if (!tag) return ret

	return {
		...ret,
		tagText: tag.text,
		tagTextColor: processColor(tag.textColor),
		tagBackgroundColor: processColor(tag.backgroundColor),
		tagVerified: false,
		tagType: undefined,
	}
}

const isTagElement = (node: Element) =>
	!!(node.type as { Types?: unknown } | undefined)?.Types

function addRowTag(rendered: ReactNode, props?: UserProps) {
	if (!isElement(rendered)) return rendered
	const label = rendered.props.label as ReactNode
	const nameContainer = find(
		label,
		node =>
			Array.isArray(node.props.children) &&
			(node.props.children as ReactNode[]).some(
				child =>
					typeof child === 'string' ||
					(isElement(child) && typeof child.props.children === 'string'),
			),
	)
	if (!nameContainer) return rendered

	const tag = () =>
		getTag(
			props?.guildId ? store('GuildStore')?.getGuild(props.guildId) : undefined,
			undefined,
			props?.user,
			settings().useRoleColor,
		)
	const nextLabel = withTag(label, nameContainer, tag, (node, element) =>
		cloneElement(node, {
			children: [...childList(node.props.children), element],
		}),
	)
	return nextLabel === label
		? rendered
		: cloneElement(rendered, { label: nextLabel })
}

function addProfileTag(rendered: ReactNode, { guildId, user }: UserProps) {
	if (!user || !guildId) return rendered

	const tag = () => {
		const channel = store('ChannelStore')?.getChannel(
			store('SelectedChannelStore')?.getChannelId(),
		)
		return getTag(
			store('GuildStore')?.getGuild(guildId),
			channel?.guild_id === guildId ? channel : undefined,
			user,
			settings().useRoleColor,
		)
	}
	const isRow = (node: Element) =>
		Array.isArray(node.props.children) && node.props.children.length >= 2

	// Children are [name, botTag | null, chevron?]; the tag goes in the bot tag slot
	return withTag(
		rendered,
		isRow,
		tag,
		(row, element) => {
			const children = [...(row.props.children as ReactNode[])]
			if (!children[1]) children[1] = element
			else children.splice(1, 0, element)
			return cloneElement(row, { children })
		},
		{ style: { marginLeft: 0 } },
	)
}

// Built-in tags (BOT, SYSTEM...) are left alone
function withTag(
	tree: ReactNode,
	target: Element | ((node: Element) => boolean),
	getResolved: () => ResolvedTag | undefined,
	insert: (node: Element, element: ReactNode) => ReactNode,
	extraProps: TagProps = {},
) {
	const scope = typeof target === 'function' ? tree : target
	const existing = find(scope, isTagElement)
	if (existing && isBuiltInTag(existing.props.type)) return tree
	const tag = getResolved()
	if (!tag) return tree

	if (existing)
		return replaceInTree(
			tree,
			node => node === existing,
			node => cloneElement(node, { ...tagProps(tag) }),
		)

	const Tag = tagModule?.default
	if (typeof Tag !== 'function') return tree
	const element = <Tag key="staff-tag" {...extraProps} {...tagProps(tag)} />
	const match =
		typeof target === 'function' ? target : (node: Element) => node === target
	return replaceInTree(tree, match, node => insert(node, element))
}

function paintTag(rendered: ReactNode, props?: TagProps) {
	const { text, textColor, backgroundColor } = props ?? {}
	if (!isElement(rendered)) return rendered
	const label = find(rendered, node => typeof node.props.children === 'string')
	if (!label) return rendered

	let out = rendered
	if (text || textColor) {
		const next = replaceInTree(
			out,
			node => node === label,
			node =>
				cloneElement(node, {
					...(text ? { children: text } : {}),
					...(textColor
						? { style: [node.props.style, { color: textColor }] }
						: {}),
				}),
		)
		if (isElement(next)) out = next
	}
	if (backgroundColor)
		out = cloneElement(out, { style: [out.props.style, { backgroundColor }] })

	return out
}

function isElement(node: unknown): node is Element {
	return isValidElement(node)
}

function childList(children: ReactNode): ReactNode[] {
	if (children == null) return []
	return Array.isArray(children) ? [...children] : [children]
}

function find(tree: ReactNode, match: (node: Element) => boolean) {
	return isElement(tree)
		? findInReactFiber(
				tree,
				(node): node is Element => isElement(node) && match(node),
			)
		: undefined
}

// Copies only the path to the match: Discord reuses rendered elements across renders
function replaceInTree(
	root: ReactNode,
	match: (node: Element) => boolean,
	replace: (node: Element) => ReactNode,
	depth = 0,
): ReactNode {
	if (depth > 30 || !isElement(root)) return root
	if (match(root)) return replace(root)
	const { children } = root.props
	if (Array.isArray(children)) {
		for (let i = 0; i < children.length; i++) {
			const next = replaceInTree(children[i], match, replace, depth + 1)
			if (next !== children[i]) {
				const copy = [...children]
				copy[i] = next
				return cloneElement(root, { children: copy })
			}
		}
		return root
	}
	const next = replaceInTree(children, match, replace, depth + 1)
	return next === children ? root : cloneElement(root, { children: next })
}

// withName can't see through React.memo, but the wrapped function keeps its name
const withMemoName = createFilterGenerator<[name: string]>(
	([name], _id, exports) =>
		(exports as { type?: { name?: string } } | undefined)?.type?.name === name,
	([name]) => `bleelblep.staff-tags.memoName(${name})`,
)
