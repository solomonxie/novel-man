import { Alert } from 'react-native';
import type { TFunction } from 'i18next';

/** A topic, typed. `suggested` fills the field: the one being browsed, or the last used. */
export function askTopic(t: TFunction, onTopic: (topic: string) => void, suggested = '') {
  Alert.prompt(
    t('topic.ask'),
    t('topic.askWhy'),
    [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('topic.confirm'),
        onPress: (value?: string) => {
          const topic = value?.replace(/\s+/g, ' ').trim();
          if (topic) onTopic(topic);
        },
      },
    ],
    'plain-text',
    suggested
  );
}

export function askTag(t: TFunction, onTag: (tag: string) => void) {
  Alert.prompt(
    t('tag.ask'),
    t('tag.askWhy'),
    [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('topic.confirm'),
        onPress: (value?: string) => {
          const tag = value?.replace(/^#/, '').replace(/\s+/g, ' ').trim();
          if (tag) onTag(tag);
        },
      },
    ],
    'plain-text'
  );
}
