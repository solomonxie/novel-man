import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  deleteEntity,
  getEntity,
  parseFields,
  updateEntity,
  type CustomField,
  type Entity,
} from '../../src/db/repo';
import { Row, Section } from '../../src/ui/primitives';
import { EditableRow, hueFrom, pickImage, Portrait } from '../../src/ui/fields';
import { space, usePalette } from '../../src/theme';

/**
 * A character's attributes vary wildly by genre — cultivation level, house,
 * ship, species. A fixed schema would be wrong for most books, so beyond a
 * small core everything is user-defined label/value pairs.
 */
export default function EntityPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [entity, setEntity] = useState<Entity | null>(null);

  const load = useCallback(() => {
    if (id) getEntity(id).then(setEntity);
  }, [id]);

  useFocusEffect(load);

  if (!entity) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.bg }}>
        <ActivityIndicator />
      </View>
    );
  }

  const fields = parseFields(entity.fields);

  async function save(changes: Parameters<typeof updateEntity>[1]) {
    await updateEntity(entity!.id, changes);
    load();
  }

  async function saveFields(next: CustomField[]) {
    await save({ fields: JSON.stringify(next.filter((field) => field.label || field.value)) });
  }

  function confirmDelete() {
    Alert.alert(t('entity.deleteConfirm'), undefined, [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteEntity(entity!.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
    >
      <Stack.Screen options={{ title: entity.name, headerBackTitle: ' ' }} />

      <View style={{ alignItems: 'center', marginTop: space.md }}>
        <Portrait
          name={entity.name}
          path={entity.portrait_path}
          hue={hueFrom(entity.name)}
          size={96}
          onPick={(uri) => save({ portrait_path: uri })}
        />
        <NameField
          value={entity.name}
          onCommit={(next) => next && next !== entity.name && save({ name: next })}
        />
      </View>

      <Section>
        <EditableRow
          label={t('entity.alias')}
          value={entity.alias}
          onCommit={(value) => save({ alias: value.trim() || null })}
        />
        <EditableRow
          label={t('entity.summary')}
          value={entity.summary}
          placeholder={t('entity.summaryPlaceholder')}
          onCommit={(value) => save({ summary: value.trim() || null })}
          multiline
          last
        />
      </Section>

      <Section
        title={t('entity.fields')}
        action={{ label: '＋', onPress: () => saveFields([...fields, { label: '', value: '' }]) }}
      >
        {fields.length === 0 ? (
          <Row label={t('entity.addField')} onPress={() => saveFields([{ label: '', value: '' }])} last />
        ) : (
          fields.map((field, index) => (
            <FieldRow
              key={index}
              field={field}
              last={index === fields.length - 1}
              onChange={(next) => saveFields(fields.map((f, i) => (i === index ? next : f)))}
              onRemove={() => saveFields(fields.filter((_, i) => i !== index))}
            />
          ))
        )}
      </Section>

      <Section>
        <Row label={t('settings.delete')} onPress={confirmDelete} danger last />
      </Section>
    </ScrollView>
  );
}

function NameField({ value, onCommit }: { value: string; onCommit: (next: string) => void }) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <TextInput
      value={draft}
      onChangeText={setDraft}
      onBlur={() => onCommit(draft.trim())}
      placeholder={t('entity.namePlaceholder')}
      placeholderTextColor={palette.faint}
      style={[styles.name, { color: palette.text }]}
      textAlign="center"
    />
  );
}

function FieldRow({ field, last, onChange, onRemove }: {
  field: CustomField;
  last?: boolean;
  onChange: (next: CustomField) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [label, setLabel] = useState(field.label);
  const [value, setValue] = useState(field.value);
  useEffect(() => { setLabel(field.label); setValue(field.value); }, [field.label, field.value]);
  return (
    <View
      style={[
        styles.fieldRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
      ]}
    >
      <TextInput
        value={label}
        onChangeText={setLabel}
        onBlur={() => label !== field.label && onChange({ ...field, label })}
        placeholder={t('entity.fieldLabel')}
        placeholderTextColor={palette.faint}
        style={{ color: palette.dim, fontSize: 15, width: 96 }}
      />
      <TextInput
        value={value}
        onChangeText={setValue}
        onBlur={() => value !== field.value && onChange({ ...field, value })}
        placeholder={t('entity.fieldValue')}
        placeholderTextColor={palette.faint}
        style={{ color: palette.text, fontSize: 16, flex: 1 }}
      />
      <Pressable onPress={onRemove} hitSlop={8}>
        <Text style={{ color: palette.faint, fontSize: 16 }}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 24, fontWeight: '700', marginTop: space.md, minWidth: 160 },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
});
