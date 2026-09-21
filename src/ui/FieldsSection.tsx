import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { CustomField } from '../db/repo';
import { isLink } from '../cast/lookup';
import { Row, Section } from './primitives';
import { space, usePalette } from '../theme';

/**
 * The part of a profile no schema can predict — cultivation level, house,
 * ship, founding date. Shared by people and places because the reason it
 * exists is the same for both.
 */
export function FieldsSection({ title, fields, onChange }: {
  title: string;
  fields: CustomField[];
  onChange: (next: CustomField[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <Section
      title={title}
      action={{ label: '＋', onPress: () => onChange([...fields, { label: '', value: '' }]) }}
    >
      {fields.length === 0 ? (
        <Row
          label={t('entity.addField')}
          onPress={() => onChange([{ label: '', value: '' }])}
          last
        />
      ) : (
        fields.map((field, index) => (
          <FieldRow
            key={index}
            field={field}
            last={index === fields.length - 1}
            onChange={(next) => onChange(fields.map((f, i) => (i === index ? next : f)))}
            onRemove={() => onChange(fields.filter((_, i) => i !== index))}
          />
        ))
      )}
    </Section>
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
  useEffect(() => {
    setLabel(field.label);
    setValue(field.value);
  }, [field.label, field.value]);

  return (
    <View
      style={[
        styles.row,
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
      {/* A pass can write a link in here — an encyclopedia article for a real
          person — and then the row has somewhere to go instead of something to
          throw away: one glyph at the end, not two. Clearing the address makes
          it an ordinary row again, cross and all. */}
      {isLink(value) ? (
        <Pressable onPress={() => Linking.openURL(value.trim())} hitSlop={8}>
          <Text style={{ fontSize: 17 }}>🔗</Text>
        </Pressable>
      ) : (
        <Pressable onPress={onRemove} hitSlop={8}>
          <Text style={{ color: palette.faint, fontSize: 16 }}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
});
