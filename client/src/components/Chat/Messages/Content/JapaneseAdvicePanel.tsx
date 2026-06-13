import { useEffect, useState } from 'react';
import { ChevronDown, Languages, RefreshCw } from 'lucide-react';
import type { TMessage, TJapaneseAdvice } from 'librechat-data-provider';
import { useJapaneseAdviceMutation } from '~/data-provider';
import { cn } from '~/utils';
import { useLocalize } from '~/hooks';

function shouldRenderAdvice(advice?: TJapaneseAdvice): advice is TJapaneseAdvice {
  return !!advice && advice.status !== 'skipped';
}

export default function JapaneseAdvicePanel({ message }: { message: TMessage }) {
  const localize = useLocalize();
  const advice = message.metadata?.japaneseAdvice;
  const [open, setOpen] = useState(advice?.status === 'needs_improvement');
  const conversationId = message.conversationId ?? '';
  const mutation = useJapaneseAdviceMutation(conversationId);

  useEffect(() => {
    if (advice?.status === 'needs_improvement') {
      setOpen(true);
    }
  }, [advice?.checkedAt, advice?.status]);

  if (!shouldRenderAdvice(advice)) {
    return null;
  }

  const issueCount = advice.issues?.length ?? 0;
  let title = localize('com_ui_japanese_advice_needs_work');
  if (advice.status === 'ok') {
    title = localize('com_ui_japanese_advice_ok');
  } else if (advice.status === 'error') {
    title = localize('com_ui_japanese_advice_error');
  }

  const recheck = () => {
    if (!conversationId || !message.messageId) {
      return;
    }
    mutation.mutate({ conversationId, messageId: message.messageId });
  };

  return (
    <div className="w-full max-w-full rounded-md border border-border-light bg-surface-secondary text-sm">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-text-primary"
          aria-expanded={open}
        >
          <Languages className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
          <span className="min-w-0 truncate font-medium">{title}</span>
          {issueCount > 0 && (
            <span className="shrink-0 rounded bg-surface-tertiary px-1.5 py-0.5 text-xs text-text-secondary">
              {issueCount}
            </span>
          )}
          <ChevronDown
            className={cn(
              'ml-auto h-4 w-4 shrink-0 text-text-secondary transition-transform',
              open && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          onClick={recheck}
          disabled={mutation.isLoading}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface-tertiary hover:text-text-primary disabled:opacity-50"
          aria-label={localize('com_ui_japanese_advice_recheck')}
        >
          <RefreshCw className={cn('h-4 w-4', mutation.isLoading && 'animate-spin')} />
        </button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-border-light px-3 py-3 text-text-primary">
          {advice.summaryEnglish && <p className="text-sm">{advice.summaryEnglish}</p>}

          {(advice.correctedJapanese || advice.naturalJapanese) && (
            <div className="space-y-1">
              {advice.correctedJapanese && (
                <p>
                  <span className="font-medium">{localize('com_ui_japanese_corrected')}:</span>{' '}
                  {advice.correctedJapanese}
                </p>
              )}
              {advice.naturalJapanese && (
                <p>
                  <span className="font-medium">{localize('com_ui_japanese_natural')}:</span>{' '}
                  {advice.naturalJapanese}
                </p>
              )}
            </div>
          )}

          {advice.issues && advice.issues.length > 0 && (
            <ul className="space-y-2">
              {advice.issues.map((issue, index) => (
                <li key={`${issue.original}-${index}`} className="space-y-1">
                  <p>
                    <span className="font-medium">{issue.original}</span>
                    {' -> '}
                    <span>{issue.suggestion}</span>
                  </p>
                  <p className="text-text-secondary">{issue.explanationEnglish}</p>
                </li>
              ))}
            </ul>
          )}

          {advice.error && <p className="text-text-secondary">{advice.error}</p>}
        </div>
      )}
    </div>
  );
}
