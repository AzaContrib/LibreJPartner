import { useCallback } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { replaceSpecialVars } from 'librechat-data-provider';
import type {
  TConversation,
  TPromptGroup,
  TJapaneseLearningProfile,
} from 'librechat-data-provider';
import { useChatContext, useChatFormContext, useAddedChatContext } from '~/Providers';
import useSetIndexOptions from '~/hooks/Conversations/useSetIndexOptions';
import { useLatestMessage } from '~/hooks/Messages/useLatestMessage';
import { useAuthContext } from '~/hooks/AuthContext';
import { mainTextareaId } from '~/common';
import store from '~/store';

type SubmitMessageData = {
  text: string;
  conversationOverrides?: Partial<TConversation>;
};

function getPromptJapaneseLearningProfile(
  group?: TPromptGroup | null,
): TJapaneseLearningProfile | undefined {
  if (group?.japaneseLearning?.enabled !== true) {
    return undefined;
  }

  return {
    enabled: true,
    advisorEnabled: true,
    learnerLevel: 'N5',
    partnerRole: '',
    targetRegister: 'auto',
    ...group.japaneseLearning,
  };
}

export default function useSubmitMessage() {
  const { user } = useAuthContext();
  const methods = useChatFormContext();
  const { conversation: addedConvo } = useAddedChatContext();
  const { ask, index, getMessages, setMessages } = useChatContext();
  const { setOption } = useSetIndexOptions();
  const latestMessage = useLatestMessage(index);

  const autoSendPrompts = useRecoilValue(store.autoSendPrompts);
  const setActivePrompt = useSetRecoilState(store.activePromptByIndex(index));

  const submitMessage = useCallback(
    (data?: SubmitMessageData) => {
      if (!data) {
        return console.warn('No data provided to submitMessage');
      }
      const rootMessages = getMessages();
      const isLatestInRootMessages = rootMessages?.some(
        (message) => message.messageId === latestMessage?.messageId,
      );
      if (!isLatestInRootMessages && latestMessage) {
        setMessages([...(rootMessages || []), latestMessage]);
      }

      const submitted = ask(
        {
          text: data.text,
        },
        {
          addedConvo: addedConvo ?? undefined,
          conversationOverrides: data.conversationOverrides,
        },
      );
      if (submitted === false) {
        return false;
      }
      methods.reset();
    },
    [ask, methods, addedConvo, setMessages, getMessages, latestMessage],
  );

  const submitPrompt = useCallback(
    (text: string, group?: TPromptGroup | null) => {
      const parsedText = replaceSpecialVars({ text, user });
      const japaneseLearning = getPromptJapaneseLearningProfile(group);
      if (japaneseLearning) {
        setOption('japaneseLearning')(japaneseLearning);
      }
      if (autoSendPrompts) {
        submitMessage({
          text: parsedText,
          conversationOverrides: japaneseLearning ? { japaneseLearning } : undefined,
        });
        return;
      }

      const textarea = document.getElementById(mainTextareaId) as HTMLTextAreaElement | null;
      const currentText = textarea?.value ?? methods.getValues('text');
      const newText = currentText.trim().length > 1 ? `\n${parsedText}` : parsedText;
      setActivePrompt(newText);
    },
    [autoSendPrompts, submitMessage, setActivePrompt, methods, user, setOption],
  );

  return { submitMessage, submitPrompt };
}
