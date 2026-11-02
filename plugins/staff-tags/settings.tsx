import Page from '@valenced/components/Page'
import { Design } from '@valenced/discord/design'
import { ScrollView, View } from 'react-native'
import { DefaultSettings, setOverride } from './shared'
import { TAGS } from './tags'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps, ReactNode } from 'react'
import type { Settings, TagOverride } from './shared'

const { Stack, TableRow, TableRowGroup, TableSwitchRow, TextInput } = Design

type SettingsComponentProps = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: Settings }>
>

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: SettingsComponentProps) {
	const { useRoleColor, tags } = { ...DefaultSettings, ...storage.use() }

	return (
		<Page>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ paddingBottom: 24 }}
			>
				<Stack spacing={24}>
					<TableRowGroup title="Everywhere">
						<TableSwitchRow
							label="Use role color"
							value={!!useRoleColor}
							onValueChange={useRoleColor => storage.set({ useRoleColor })}
						/>
					</TableRowGroup>
					{TAGS.map(tag => (
						<TagRows
							key={tag.id}
							id={tag.id}
							text={tag.text}
							defaultColor={tag.defaultColor}
							custom={tags?.[tag.id] ?? {}}
						/>
					))}
				</Stack>
			</ScrollView>
		</Page>
	)
}

function TagRows({
	id,
	text,
	defaultColor,
	custom,
}: {
	id: string
	text: string
	defaultColor: string
	custom: TagOverride
}) {
	const enabled = custom.enabled !== false
	const color = custom.color ?? ''
	const valid = !color || parseHex(color) !== undefined

	return (
		<TableRowGroup title={text} hasIcons>
			<TableSwitchRow
				icon={
					<Swatch
						color={(custom.useCustomColor && custom.color) || defaultColor}
						dim={!enabled}
					/>
				}
				label="Show tag"
				value={enabled}
				onValueChange={enabled => setOverride(id, { enabled })}
			/>
			<FieldRow label="Text">
				<TextInput
					placeholder={text}
					value={custom.text ?? ''}
					returnKeyType="done"
					isClearable
					onChange={text => setOverride(id, { text })}
				/>
			</FieldRow>
			<FieldRow label="Color">
				<TextInput
					placeholder={defaultColor}
					value={color}
					returnKeyType="done"
					isClearable
					status={valid ? 'default' : 'error'}
					errorMessage={valid ? undefined : 'Six hex digits'}
					onChange={input => {
						const hex = parseHex(input)
						setOverride(id, { color: hex ?? input, useCustomColor: !!hex })
					}}
				/>
			</FieldRow>
		</TableRowGroup>
	)
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<TableRow
			label={label}
			subLabel={<View style={{ marginTop: 8 }}>{children}</View>}
		/>
	)
}

function Swatch({ color, dim }: { color: string; dim?: boolean }) {
	return (
		<View
			style={{
				width: 28,
				height: 28,
				borderRadius: 6,
				backgroundColor: color,
				opacity: dim ? 0.4 : 1,
			}}
		/>
	)
}

function parseHex(input: string) {
	const hex = input.trim().replace(/^#/, '')
	if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toUpperCase()}`
}
