import { useMemo } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { kindOf } from '../../src/books/kinds';
import { sourcesFor } from '../../src/sources/registry';
import { searchIndex, type IndexedBook } from '../../src/sources/catalog';
import { readCatalog } from '../../src/sources/ebible';
import { bookFromIndex } from '../../src/sources/gutenberg';
import { choose } from '../../src/sources/chosen';
import { FindPage } from '../../src/ui/FindPage';

/**
 * Every list this app has kept, searched at once and on the device. It is a
 * page of its own because a field at the foot of a form is a field under the
 * keyboard the moment it is used — here the field is at the top, the results
 * fill what is left, and nothing moves when the keyboard comes up.
 */
export default function FindABook() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const { t } = useTranslation();

  const sources = useMemo(
    () => sourcesFor(kindOf(kind).sources).filter((source) => source.indexed),
    [kind]
  );

  return (
    <FindPage<IndexedBook>
      title={t('add.findTitle')}
      placeholder={t('add.findPlaceholder')}
      hint={t('find.localPrompt', {
        sources: sources.map((source) => t(`source.${source.id}`)).join(' · '),
      })}
      live
      search={(query) => searchIndex(query, sources.map((source) => source.id))}
      keyOf={(hit) => `${hit.source}-${hit.extId}`}
      row={(hit) => ({
        label: hit.title,
        detail: [hit.author, hit.language].filter(Boolean).join(' · ') || undefined,
        value: t(`source.${hit.source}`),
      })}
      onPick={(hit) => {
        if (hit.source === 'gutenberg') choose({ source: 'gutenberg', book: bookFromIndex(hit) });
        else {
          const translation = readCatalog()?.translations.find((entry) => entry.id === hit.extId);
          if (!translation) return;
          choose({ source: 'ebible', translation });
        }
        router.back();
      }}
    />
  );
}
