import { useState } from 'react';
import { Languages } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import { Content, Portal, Root, Trigger } from '@radix-ui/react-popover';
import type { TConversation } from 'librechat-data-provider';
import { useSetIndexOptions, useLocalize } from '~/hooks';
import JapaneseLearningSettings from './JapaneseLearningSettings';

export default function JapaneseLearningButton({
  conversation,
  disabled,
}: {
  conversation?: TConversation | null;
  disabled?: boolean;
}) {
  const localize = useLocalize();
  const { setOption } = useSetIndexOptions();
  const [open, setOpen] = useState(false);
  const label = localize('com_ui_japanese_learning');

  return (
    <Root open={open} onOpenChange={setOpen}>
      <Trigger asChild>
        <TooltipAnchor
          id="japanese-learning-button"
          aria-label={label}
          description={label}
          tabIndex={0}
          role="button"
          data-testid="japanese-learning-button"
          disabled={disabled}
          className="inline-flex size-9 items-center justify-center rounded-lg text-text-secondary transition-all ease-in-out hover:bg-surface-tertiary hover:text-text-primary disabled:pointer-events-none disabled:opacity-50 radix-state-open:bg-surface-tertiary radix-state-open:text-text-primary"
        >
          <Languages className="h-5 w-5" aria-hidden="true" />
        </TooltipAnchor>
      </Trigger>
      <Portal>
        <Content
          side="top"
          align="start"
          sideOffset={10}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          className="z-[70] max-h-[75vh] w-[min(92vw,520px)] overflow-y-auto rounded-md border border-border-light bg-surface-primary p-4 text-text-primary shadow-xl"
        >
          <JapaneseLearningSettings conversation={conversation} setOption={setOption} compact />
        </Content>
      </Portal>
    </Root>
  );
}
