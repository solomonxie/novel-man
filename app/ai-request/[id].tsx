import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';
import Clipboard from '@react-native-clipboard/clipboard';

import { getRequest, type AiRequest } from '../../src/db/requests';
import { formatUsd } from '../../src/ai/cost';
import { vendorById } from '../../src/ai/vendors';
import { Row, Section } from '../../src/ui/primitives';
import { radius, space, usePalette } from '../../src/theme';

type Message = { role: string; content: string };

/**
 * The prompt verbatim, not a summary of it. Reading back what was actually
 * sent is the only way to tell a bad answer from a bad question.
 */
export default function AiRequestPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [request, setRequest] = useState<AiRequest | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    if (id) getRequest(id).then(setRequest);
  }, [id]);

  useFocusEffect(load);

  if (!request) {
    return (
      <View style={[styles.centre, { backgroundColor: palette.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const messages = parseMessages(request.prompt);

  async function copyAll() {
    await Clipboard.setString(
      messages.map((message) => `[${message.role}]\n${message.content}`).join('\n\n')
    );
    setCopied(true);
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
    >
      <Stack.Screen options={{ title: t('keyLog.requestTitle'), headerBackTitle: ' ' }} />

      <Section>
        <Row label={t('keyLog.when')} value={new Date(request.created_at).toLocaleString()} />
        <Row
          label={t('keyLog.vendor')}
          value={vendorById(request.vendor_id)?.name ?? request.vendor_id}
        />
        <Row label={t('keyLog.model')} value={request.model} />
        <Row
          label={t('keyLog.tokensPlain')}
          value={`${request.input_tokens.toLocaleString()} → ${request.output_tokens.toLocaleString()}`}
        />
        <Row label={t('keyLog.cost')} value={formatUsd(request.usd)} last />
      </Section>

      {request.error ? (
        <Section title={t('keyLog.error')}>
          <Text style={[styles.body, { color: palette.danger }]}>{request.error}</Text>
        </Section>
      ) : null}

      <Section
        title={t('keyLog.prompt')}
        action={{ label: copied ? t('keyLog.copied') : t('keyLog.copy'), onPress: copyAll }}
      >
        {messages.map((message, index) => (
          <View key={index} style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
            <Text style={{ color: palette.dim, fontSize: 12, marginBottom: 4 }}>
              {message.role.toUpperCase()}
            </Text>
            <Text
              selectable
              style={[styles.body, { color: palette.text, backgroundColor: palette.bg }]}
            >
              {message.content}
            </Text>
          </View>
        ))}
      </Section>

      {request.response ? (
        <Section title={t('keyLog.response')}>
          <Text
            selectable
            style={[styles.body, { color: palette.text, marginHorizontal: space.lg }]}
          >
            {request.response}
          </Text>
        </Section>
      ) : null}
    </ScrollView>
  );
}

/** A log row is only worth what it can still be read as. */
function parseMessages(raw: string): Message[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [{ role: 'prompt', content: raw }];
  } catch {
    return [{ role: 'prompt', content: raw }];
  }
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: 'Menlo',
    padding: space.sm,
    borderRadius: radius.sm,
  },
});
