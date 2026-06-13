import { useId } from 'react';
import { Input, Label, Switch } from '@librechat/client';
import type {
  TJapaneseLearningLevel,
  TJapaneseLearningProfile,
  TJapaneseLearningRegister,
} from 'librechat-data-provider';
import { cn, defaultTextProps, removeFocusOutlines } from '~/utils';
import { useLocalize } from '~/hooks';

const levelOptions: TJapaneseLearningLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1'];
const registerOptions: TJapaneseLearningRegister[] = ['auto', 'casual', 'polite', 'formal'];

export const defaultJapaneseLearningProfile: TJapaneseLearningProfile = {
  enabled: false,
  advisorEnabled: true,
  learnerLevel: 'N5',
  partnerRole: '',
  targetRegister: 'auto',
};

export function normalizeJapaneseLearningProfile(
  profile?: TJapaneseLearningProfile | null,
): TJapaneseLearningProfile {
  return {
    ...defaultJapaneseLearningProfile,
    ...(profile ?? {}),
  };
}

export default function JapaneseSettings({
  profile,
  onChange,
  compact = false,
  disabled = false,
  showAdvisorModel = false,
}: {
  profile?: TJapaneseLearningProfile | null;
  onChange: (profile: TJapaneseLearningProfile, persist: boolean) => void;
  compact?: boolean;
  disabled?: boolean;
  showAdvisorModel?: boolean;
}) {
  const id = useId();
  const localize = useLocalize();
  const resolvedProfile = normalizeJapaneseLearningProfile(profile);

  const updateProfile = (patch: Partial<TJapaneseLearningProfile>, persist = true) => {
    onChange(
      {
        ...resolvedProfile,
        ...patch,
      },
      persist,
    );
  };

  return (
    <section className={cn(!compact && 'mt-6 border-t border-border-light pt-5')}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Label htmlFor={`${id}-enabled`} className="text-left text-sm font-medium">
          {localize('com_ui_japanese_learning')}
        </Label>
        <Switch
          id={`${id}-enabled`}
          checked={resolvedProfile.enabled === true}
          disabled={disabled}
          onCheckedChange={(checked: boolean) => updateProfile({ enabled: checked })}
          aria-label={localize('com_ui_japanese_learning')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid w-full items-center gap-2 sm:col-span-2">
          <Label htmlFor={`${id}-partner-role`} className="text-left text-sm font-medium">
            {localize('com_ui_japanese_partner_role')}
          </Label>
          <Input
            id={`${id}-partner-role`}
            value={resolvedProfile.partnerRole ?? ''}
            disabled={disabled}
            onChange={(event) => updateProfile({ partnerRole: event.target.value }, false)}
            onBlur={(event) => updateProfile({ partnerRole: event.target.value })}
            placeholder={localize('com_ui_japanese_partner_role_placeholder')}
            className={cn(
              defaultTextProps,
              'flex h-10 max-h-10 w-full resize-none px-3 py-2',
              removeFocusOutlines,
            )}
          />
        </div>

        <div className="grid w-full items-center gap-2">
          <Label htmlFor={`${id}-learner-level`} className="text-left text-sm font-medium">
            {localize('com_ui_japanese_learner_level')}
          </Label>
          <select
            id={`${id}-learner-level`}
            value={resolvedProfile.learnerLevel ?? 'N5'}
            disabled={disabled}
            onChange={(event) =>
              updateProfile({ learnerLevel: event.target.value as TJapaneseLearningLevel })
            }
            className={cn(
              defaultTextProps,
              'h-10 rounded-md border border-border-light bg-transparent px-3 py-2 text-sm',
              removeFocusOutlines,
            )}
          >
            {levelOptions.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>

        <div className="grid w-full items-center gap-2">
          <Label htmlFor={`${id}-target-register`} className="text-left text-sm font-medium">
            {localize('com_ui_japanese_target_register')}
          </Label>
          <select
            id={`${id}-target-register`}
            value={resolvedProfile.targetRegister ?? 'auto'}
            disabled={disabled}
            onChange={(event) =>
              updateProfile({ targetRegister: event.target.value as TJapaneseLearningRegister })
            }
            className={cn(
              defaultTextProps,
              'h-10 rounded-md border border-border-light bg-transparent px-3 py-2 text-sm',
              removeFocusOutlines,
            )}
          >
            {registerOptions.map((register) => (
              <option key={register} value={register}>
                {localize(`com_ui_japanese_register_${register}`)}
              </option>
            ))}
          </select>
        </div>

        {showAdvisorModel === true && (
          <div className="grid w-full items-center gap-2 sm:col-span-2">
            <Label htmlFor={`${id}-advisor-model`} className="text-left text-sm font-medium">
              {localize('com_ui_japanese_advisor_model')}
            </Label>
            <Input
              id={`${id}-advisor-model`}
              value={resolvedProfile.advisorModel ?? ''}
              disabled={disabled}
              onChange={(event) => updateProfile({ advisorModel: event.target.value }, false)}
              onBlur={(event) => updateProfile({ advisorModel: event.target.value })}
              placeholder={localize('com_ui_japanese_advisor_model_placeholder')}
              className={cn(
                defaultTextProps,
                'flex h-10 max-h-10 w-full resize-none px-3 py-2',
                removeFocusOutlines,
              )}
            />
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <Label htmlFor={`${id}-advisor-enabled`} className="text-left text-sm font-medium">
          {localize('com_ui_japanese_advisor')}
        </Label>
        <Switch
          id={`${id}-advisor-enabled`}
          checked={resolvedProfile.advisorEnabled !== false}
          disabled={disabled}
          onCheckedChange={(checked: boolean) => updateProfile({ advisorEnabled: checked })}
          aria-label={localize('com_ui_japanese_advisor')}
        />
      </div>
    </section>
  );
}
