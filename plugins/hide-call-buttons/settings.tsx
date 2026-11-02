import Page from '@valenced/components/Page'
import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { DefaultSettings } from './shared'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from './shared'

const { Stack, TableRowGroup, TableSwitchRow } = Design

type SettingComponentProps = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: Settings }>
>

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: SettingComponentProps) {
	const settings = { ...DefaultSettings, ...storage.use() }

	return (
		<Page>
			<ScrollView>
				<Stack spacing={24}>
					<TableRowGroup title="User profiles">
						<TableSwitchRow
							icon={<TableRowAssetIcon name="PhoneCallIcon" />}
							label="Hide call button"
							value={settings.upHideVoiceButton}
							onValueChange={upHideVoiceButton =>
								storage.set({ upHideVoiceButton })
							}
						/>
					</TableRowGroup>
					<TableRowGroup title="DM header">
						<TableSwitchRow
							icon={<TableRowAssetIcon name="PhoneCallIcon" />}
							label="Hide call button"
							value={settings.dmHideCallButton}
							onValueChange={dmHideCallButton =>
								storage.set({ dmHideCallButton })
							}
						/>
						<TableSwitchRow
							icon={<TableRowAssetIcon name="VideoIcon" />}
							label="Hide video call button"
							value={settings.dmHideVideoButton}
							onValueChange={dmHideVideoButton =>
								storage.set({ dmHideVideoButton })
							}
						/>
					</TableRowGroup>
					<TableRowGroup title="Friends list">
						<TableSwitchRow
							icon={<TableRowAssetIcon name="PhoneCallIcon" />}
							label="Hide call button"
							value={settings.friendsHideCallButton}
							onValueChange={friendsHideCallButton =>
								storage.set({ friendsHideCallButton })
							}
						/>
					</TableRowGroup>
					<TableRowGroup title="Voice channels">
						<TableSwitchRow
							icon={<TableRowAssetIcon name="VideoIcon" />}
							label="Hide camera button"
							value={settings.hideVCVideoButton}
							onValueChange={hideVCVideoButton =>
								storage.set({ hideVCVideoButton })
							}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
