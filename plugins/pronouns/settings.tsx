import Page from '@valenced/components/Page'
import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Pressable, ScrollView, View } from 'react-native'
import {
	badgeColor,
	isDark,
	PRESETS,
	reportError,
	settings,
	toast,
	update,
	useSettings,
} from './shared'
import { nameOf, resolve } from './sources'
import type { ComponentProps, ComponentType, ReactNode } from 'react'
import type { TextInputProps } from 'react-native'

// Design.TextInput forwards these native props, but its type leaves them out
type InputProps = ComponentProps<typeof Design.TextInput> &
	Pick<TextInputProps, 'autoCapitalize' | 'autoCorrect' | 'onSubmitEditing'>

function Input(props: InputProps) {
	const TextInput = Design.TextInput as ComponentType<InputProps>
	return <TextInput {...props} />
}

function Field({ label, children }: { label: string; children: ReactNode }) {
	const { TableRowGroup, TableRow } = Design
	return (
		<TableRowGroup>
			<TableRow
				label={label}
				subLabel={<View style={{ marginTop: 8 }}>{children}</View>}
			/>
		</TableRowGroup>
	)
}

export function promptOverride(userId: string, name: string) {
	const { AlertModal, AlertActionButton } = Design
	const key = 'PronounsOverride'
	const existing = settings().overrides[userId]
	const current =
		typeof existing === 'string' ? existing : (resolve(userId) ?? '')
	let value = current
	const save = () => {
		AlertActionCreators.dismissAlert(key)
		try {
			const text = value.trim()
			update({ overrides: { ...settings().overrides, [userId]: text || null } })
			toast(
				text ? `Pronouns for ${name} set.` : `Pronouns for ${name} cleared.`,
				'PronounsOverrideToast',
			)
		} catch (error) {
			reportError('saving the override failed', error)
		}
	}

	AlertActionCreators.openAlert(
		key,
		<AlertModal
			title={`Pronouns for ${name}`}
			content="What the badge next to their name shows. Leave empty to clear yours."
			extraContent={
				<Input
					defaultValue={current}
					placeholder="e.g. they/them"
					autoFocus
					autoCapitalize="none"
					autoCorrect={false}
					onChange={(text: string) => {
						value = text
					}}
					onSubmitEditing={save}
				/>
			}
			actions={
				<>
					<AlertActionButton text="Save" variant="primary" onPress={save} />
					{typeof existing === 'string' && (
						<AlertActionButton
							text="Clear"
							variant="destructive"
							onPress={() => {
								value = ''
								save()
							}}
						/>
					)}
					<AlertActionButton
						text="Cancel"
						variant="secondary"
						onPress={() => AlertActionCreators.dismissAlert(key)}
					/>
				</>
			}
		/>,
	)
}

function Swatches() {
	const current = badgeColor()
	return (
		<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
			{PRESETS.map(color => (
				<Pressable
					key={color}
					accessibilityLabel={color}
					accessibilityRole="button"
					accessibilityState={{ selected: current === color }}
					onPress={() => update({ badgeColor: current === color ? '' : color })}
					style={{
						width: 32,
						height: 32,
						borderRadius: 16,
						backgroundColor: color,
						borderWidth: current === color ? 3 : 0,
						borderColor: isDark(color) ? '#FFFFFF' : '#000000',
					}}
				/>
			))}
		</View>
	)
}

export default function SettingsComponent() {
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } = Design
	const s = useSettings()
	const overrides = Object.entries(s.overrides).filter(
		(entry): entry is [string, string] => typeof entry[1] === 'string',
	)

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 24 }}
		>
			<Page>
				<Stack spacing={24}>
					<TableRowGroup>
						<TableSwitchRow
							label="Show in chat"
							icon={<TableRowAssetIcon name="UserCircleIcon" />}
							value={s.showInChat}
							onValueChange={showInChat => update({ showInChat })}
						/>
					</TableRowGroup>
					<TableRowGroup title="Sources">
						<TableSwitchRow
							label="Also check PronounDB"
							value={s.pronounDbEnabled}
							onValueChange={pronounDbEnabled => update({ pronounDbEnabled })}
						/>
						{s.pronounDbEnabled && (
							<TableSwitchRow
								label="Discord pronouns first"
								value={s.discordFirst}
								onValueChange={discordFirst => update({ discordFirst })}
							/>
						)}
					</TableRowGroup>
					<TableRowGroup title="Clean up">
						<TableSwitchRow
							label="Only real pronouns"
							value={s.validOnly}
							onValueChange={validOnly => update({ validOnly })}
						/>
						{s.validOnly && (
							<TableSwitchRow
								label="Count Any and All"
								value={s.allowAnyAll}
								onValueChange={allowAnyAll => update({ allowAnyAll })}
							/>
						)}
					</TableRowGroup>
					<Field label="Badge color">
						<Swatches />
					</Field>
					<TableRowGroup title="Pronouns you set">
						{overrides.length ? (
							overrides.map(([id, text]) => (
								<TableRow
									key={id}
									label={nameOf(id)}
									subLabel={text}
									arrow
									onPress={() => promptOverride(id, nameOf(id))}
								/>
							))
						) : (
							<TableRow
								label="No one yet"
								subLabel="Long-press someone's message and choose Set pronouns."
							/>
						)}
					</TableRowGroup>
				</Stack>
			</Page>
		</ScrollView>
	)
}
