import Page from '@valenced/components/Page'
import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { DefaultSettings, Formats } from '.'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from '.'

const { Stack, TableRowGroup, TableSwitchRow } = Design

type SettingComponentProps = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: Settings }>
>

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: SettingComponentProps) {
	const settings: Settings = { ...DefaultSettings, ...storage.use() }

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
				<Stack spacing={24}>
					<TableRowGroup hasIcons>
						<TableSwitchRow
							icon={<TableRowAssetIcon name="EyeIcon" />}
							label="Fade symbols"
							value={settings.dimMarkers}
							onValueChange={dimMarkers => storage.set({ dimMarkers })}
						/>
						<TableSwitchRow
							icon={<TableRowAssetIcon name="TextIcon" />}
							label="Bigger headings"
							value={settings.headings}
							onValueChange={headings => storage.set({ headings })}
						/>
						<TableSwitchRow
							icon={<TableRowAssetIcon name="SlashBoxIcon" />}
							label="Code font"
							value={settings.monoCode}
							onValueChange={monoCode => storage.set({ monoCode })}
						/>
					</TableRowGroup>
					<TableRowGroup
						title="Selection menu"
						description="Shown when you select text in the message box."
					>
						{Formats.map(format => (
							<TableSwitchRow
								key={format.id}
								label={format.label}
								subLabel={format.example}
								value={settings.menu.includes(format.id)}
								onValueChange={on => {
									const menu = Formats.map(f => f.id).filter(id =>
										id === format.id ? on : settings.menu.includes(id),
									)
									// Replace, since set() merges arrays by index
									storage.set({ ...settings, menu }, true)
								}}
							/>
						))}
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
