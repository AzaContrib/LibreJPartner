import { Constants } from 'librechat-data-provider';
import type { TSetOption, TConversation, TJapaneseLearningProfile } from 'librechat-data-provider';
import JapaneseSettings, { normalizeJapaneseLearningProfile } from '~/components/Japanese/Settings';
import { useUpdateJapaneseLearningMutation } from '~/data-provider';

function isPersistableConversation(conversationId?: string | null): conversationId is string {
  return (
    !!conversationId &&
    conversationId !== Constants.NEW_CONVO &&
    conversationId !== Constants.PENDING_CONVO &&
    !conversationId.startsWith('_')
  );
}

function getProfile(conversation?: TConversation | null): TJapaneseLearningProfile {
  return normalizeJapaneseLearningProfile(conversation?.japaneseLearning);
}

export default function JapaneseLearningSettings({
  conversation,
  setOption,
  compact = false,
}: {
  conversation?: TConversation | null;
  setOption: TSetOption;
  compact?: boolean;
}) {
  const profile = getProfile(conversation);
  const mutation = useUpdateJapaneseLearningMutation(conversation?.conversationId ?? '');

  const saveProfile = (nextProfile: TJapaneseLearningProfile) => {
    if (!isPersistableConversation(conversation?.conversationId)) {
      return;
    }
    mutation.mutate({
      conversationId: conversation.conversationId,
      japaneseLearning: nextProfile,
    });
  };

  const updateProfile = (nextProfile: TJapaneseLearningProfile, persist: boolean) => {
    setOption('japaneseLearning')(nextProfile);
    if (persist) {
      saveProfile(nextProfile);
    }
  };

  return (
    <JapaneseSettings
      compact={compact}
      profile={profile}
      onChange={updateProfile}
      showAdvisorModel
    />
  );
}
