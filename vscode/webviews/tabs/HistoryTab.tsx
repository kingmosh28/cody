import type { CodyIDE } from '@sourcegraph/cody-shared'
import { useExtensionAPI, useObservable } from '@sourcegraph/prompt-editor'
import { HistoryIcon, MessageSquarePlusIcon, TrashIcon } from 'lucide-react'
import type React from 'react'
import { useCallback, useMemo, useState } from 'react'

import type { WebviewType } from '../../src/chat/protocol'
import { getRelativeChatPeriod } from '../../src/common/time-date'
import { LoadingDots } from '../chat/components/LoadingDots'
import { Button } from '../components/shadcn/ui/button'
import { Input } from '../components/shadcn/ui/input'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import { View } from './types'
import { getCreateNewChatCommand } from './utils'

import type {
    LightweightChatHistory,
    LightweightChatTranscript,
} from '@sourcegraph/cody-shared/src/chat/transcript'
import styles from './HistoryTab.module.css'

interface HistoryTabProps {
    IDE: CodyIDE
    setView: (view: View) => void
    webviewType?: WebviewType | undefined | null
    multipleWebviewsEnabled?: boolean | undefined | null
}

export const HistoryTab: React.FC<HistoryTabProps> = props => {
    const userHistory = useUserHistory()

    const chats = useMemo(() => (userHistory ? Object.values(userHistory) : userHistory), [userHistory])

    return (
        <div className="tw-px-8 tw-pt-6 tw-pb-12 tw-overflow-y-scroll">
            {chats === undefined ? (
                <LoadingDots />
            ) : chats === null ? (
                <p>History is not available.</p>
            ) : (
                <HistoryTabWithData {...props} chats={chats} />
            )}
        </div>
    )
}

export const HistoryTabWithData: React.FC<HistoryTabProps & { chats: LightweightChatTranscript[] }> = ({
    IDE,
    webviewType,
    multipleWebviewsEnabled,
    setView,
    chats,
}) => {
    const nonEmptyChats = useMemo(() => chats.filter(c => c?.firstHumanMessageText?.length), [chats])

    const onDeleteButtonClick = useCallback(
        (id: string) => {
            if (chats.find(chat => chat.id === id)) {
                getVSCodeAPI().postMessage({
                    command: 'command',
                    id: 'cody.chat.history.clear',
                    arg: id,
                })
            }
        },
        [chats]
    )

    const handleStartNewChat = () => {
        getVSCodeAPI().postMessage({
            command: 'command',
            id: getCreateNewChatCommand({ IDE, webviewType, multipleWebviewsEnabled }),
        })
        setView(View.Chat)
    }

    //add history search
    const [searchText, setSearchText] = useState('')

    const filteredChats = useMemo(() => {
        const searchTerm = searchText.trim().toLowerCase()
        if (!searchTerm) {
            return nonEmptyChats
        }
        // Search in chat titles or first message text
        return nonEmptyChats.filter(chat => {
            // Search in chat title if available
            if (chat.chatTitle?.toLowerCase().includes(searchTerm)) {
                return true
            }
            // Search in first message text if available
            return chat.firstHumanMessageText?.toLowerCase().includes(searchTerm) || false
        })
    }, [nonEmptyChats, searchText])

    const sortedChatsByPeriod = useMemo(
        () =>
            Array.from(
                filteredChats.reverse().reduce((acc, chat) => {
                    const period = getRelativeChatPeriod(new Date(chat.lastInteractionTimestamp))
                    acc.set(period, [...(acc.get(period) || []), chat])
                    return acc
                }, new Map<string, LightweightChatTranscript[]>())
            ) as [string, LightweightChatTranscript[]][],
        [filteredChats]
    )

    return (
        <div className="tw-flex tw-flex-col">
            <div className="tw-flex tw-py-2">
                <Input
                    className="tw-flex-1 tw-text-sm"
                    placeholder="Search chat history"
                    value={searchText}
                    onChange={event => setSearchText(event.target.value)}
                />
            </div>

            {sortedChatsByPeriod.map((periodData: [string, LightweightChatTranscript[]]) => {
                const [period, chats] = periodData
                return (
                    <div key={period} className="tw-flex tw-flex-col">
                        <h4 className="tw-font-semibold tw-text-muted-foreground tw-py-2 tw-my-4">
                            {period}
                        </h4>
                        {chats.map((chat: LightweightChatTranscript) => {
                            const id = chat.id
                            const chatTitle = chat.chatTitle
                            const lastMessage = chat.firstHumanMessageText
                            return (
                                <div
                                    key={id}
                                    className={`tw-flex tw-flex-row tw-p-1 ${styles.historyRow}`}
                                >
                                    <Button
                                        variant="ghost"
                                        className={`tw-text-left tw-truncate tw-w-full ${styles.historyItem}`}
                                        onClick={() =>
                                            getVSCodeAPI().postMessage({
                                                command: 'restoreHistory',
                                                chatID: id,
                                            })
                                        }
                                    >
                                        <span className="tw-truncate tw-w-full">
                                            {chatTitle || lastMessage}
                                        </span>
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        title="Delete chat"
                                        aria-label="Delete chat"
                                        className={`${styles.historyDeleteBtn}`}
                                        onClick={() => onDeleteButtonClick(id)}
                                        onKeyDown={() => onDeleteButtonClick(id)}
                                    >
                                        <TrashIcon
                                            className="tw-w-8 tw-h-8 tw-opacity-80"
                                            size={16}
                                            strokeWidth="1.25"
                                        />
                                    </Button>
                                </div>
                            )
                        })}
                    </div>
                )
            })}

            {!nonEmptyChats?.length && (
                <div className="tw-flex tw-flex-col tw-items-center tw-mt-6">
                    <HistoryIcon
                        size={20}
                        strokeWidth={1.25}
                        className="tw-mb-5 tw-text-muted-foreground"
                    />

                    <span className="tw-text-lg tw-mb-4 tw-text-muted-foreground">
                        You have no chat history
                    </span>

                    <span className="tw-text-sm tw-text-muted-foreground tw-mb-8">
                        Explore all your previous chats here. Track and <br /> search through what you've
                        been working on.
                    </span>

                    <Button
                        size="sm"
                        variant="secondary"
                        aria-label="Start a new chat"
                        className="tw-px-4 tw-py-2"
                        onClick={handleStartNewChat}
                    >
                        <MessageSquarePlusIcon size={16} className="tw-w-8 tw-h-8" strokeWidth={1.25} />
                        Start a new chat
                    </Button>
                </div>
            )}
        </div>
    )
}

function useUserHistory(): LightweightChatHistory | null | undefined {
    const userHistory = useExtensionAPI().userHistory
    return useObservable(useMemo(() => userHistory(), [userHistory])).value
}
