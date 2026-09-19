import { useCallback, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from '../../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import {
  listChapters,
  listEntities,
  listRelations,
  type Chapter,
  type Entity,
  type Relation,
} from '../../../src/db/repo';
import { edgeGeometry, layoutGraph, withinRange } from '../../../src/cast/graph';
import { hueFrom } from '../../../src/ui/fields';
import { space, usePalette } from '../../../src/theme';
import { useWorkRefresh } from '../../../src/work/refresh';

const NODE = 56;

export default function Graph() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const { width } = useWindowDimensions();

  const [entities, setEntities] = useState<Entity[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const origin = useRef({ x: 0, y: 0 });

  const load = useCallback(() => {
    if (!id) return;
    listEntities(id, 'character').then(setEntities);
    listRelations(id).then(setRelations);
    listChapters(id).then((rows) => {
      setChapters(rows);
      setRange((was) => was ?? { from: 0, to: Math.max(0, rows.length - 1) });
    });
  }, [id]);

  useFocusEffect(load);
  // A pass that lands while this page is open has to show up on it.
  useWorkRefresh(load);

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.hypot(gesture.dx, gesture.dy) > 6,
      onPanResponderGrant: () => {
        origin.current = { ...panRef.current };
      },
      onPanResponderMove: (_, gesture) => {
        setPan({ x: origin.current.x + gesture.dx, y: origin.current.y + gesture.dy });
      },
    })
  ).current;

  const panRef = useRef(pan);
  panRef.current = pan;

  const size = width - space.lg * 2;
  const visible = useMemo(
    () => (range ? relations.filter((relation) => withinRange(relation, range.from, range.to)) : relations),
    [relations, range]
  );
  const { nodes, edges } = useMemo(
    () => layoutGraph(entities, visible, size),
    [entities, visible, size]
  );

  const related = selected
    ? new Set(
        edges
          .filter((edge) => edge.from.id === selected || edge.to.id === selected)
          .flatMap((edge) => [edge.from.id, edge.to.id])
      )
    : null;

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
      scrollEnabled={false}
    >
      <Stack.Screen options={{ title: t('cast.graph'), headerBackTitle: ' ' }} />

      <View
        style={[styles.canvas, { height: size, backgroundColor: palette.surface, borderColor: palette.border }]}
        {...responder.panHandlers}
      >
        <View
          style={{
            width: size,
            height: size,
            transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: zoom }],
          }}
        >
          {edges.map((edge, index) => {
            const geometry = edgeGeometry(edge);
            const dimmed = related && !(related.has(edge.from.id) && related.has(edge.to.id));
            return (
              <View
                key={index}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: geometry.left,
                  top: geometry.top,
                  width: geometry.width,
                  height: StyleSheet.hairlineWidth * 2,
                  backgroundColor: dimmed ? palette.border : palette.accent,
                  opacity: dimmed ? 0.4 : 0.8,
                  transform: [{ rotate: geometry.angle }],
                  transformOrigin: 'left center',
                }}
              />
            );
          })}

          {nodes.map((node) => {
            const dimmed = related && !related.has(node.id);
            return (
              <Pressable
                key={node.id}
                onPress={() => setSelected(selected === node.id ? null : node.id)}
                onLongPress={() => router.push(`/entity/${node.id}`)}
                style={{
                  position: 'absolute',
                  left: node.x - NODE / 2,
                  top: node.y - NODE / 2,
                  width: NODE,
                  alignItems: 'center',
                  opacity: dimmed ? 0.35 : 1,
                }}
              >
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: `hsl(${hueFrom(node.name)}, 45%, 55%)`,
                      borderColor: selected === node.id ? palette.accent : 'transparent',
                    },
                  ]}
                >
                  <Text style={styles.degree}>{node.degree}</Text>
                </View>
                <Text numberOfLines={1} style={{ color: palette.text, fontSize: 10, marginTop: 2 }}>
                  {node.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {nodes.length === 0 && (
          <Text style={[styles.empty, { color: palette.dim }]}>{t('cast.graphEmpty')}</Text>
        )}
      </View>

      <View style={styles.controls}>
        <Pressable onPress={() => setZoom((was) => Math.max(0.5, was - 0.2))} hitSlop={10}>
          <Text style={{ color: palette.accent, fontSize: 22 }}>－</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          hitSlop={10}
        >
          <Text style={{ color: palette.accent, fontSize: 14 }}>{t('cast.reset')}</Text>
        </Pressable>
        <Pressable onPress={() => setZoom((was) => Math.min(2.5, was + 0.2))} hitSlop={10}>
          <Text style={{ color: palette.accent, fontSize: 22 }}>＋</Text>
        </Pressable>
      </View>

      {selected ? (
        <View style={{ marginTop: space.md }}>
          {edges
            .filter((edge) => edge.from.id === selected || edge.to.id === selected)
            .map((edge, index) => (
              <Text key={index} style={{ color: palette.dim, fontSize: 13, marginTop: 2 }}>
                {edge.from.name} ↔ {edge.to.name} · {edge.label}
              </Text>
            ))}
        </View>
      ) : (
        <Text style={{ color: palette.faint, fontSize: 12, marginTop: space.md }}>
          {t('cast.graphHint')}
        </Text>
      )}

      {range && chapters.length > 1 && (
        <View style={{ marginTop: space.xl }}>
          <Text style={{ color: palette.dim, fontSize: 13 }}>
            {t('cast.chapterRange', { from: range.from + 1, to: range.to + 1 })}
          </Text>
          <RangeBar
            total={chapters.length}
            range={range}
            onChange={setRange}
            tint={palette.accent}
            track={palette.border}
          />
        </View>
      )}
    </ScrollView>
  );
}

/** Two handles on one track: the graph is always a window into the book. */
function RangeBar({ total, range, onChange, tint, track }: {
  total: number;
  range: { from: number; to: number };
  onChange: (next: { from: number; to: number }) => void;
  tint: string;
  track: string;
}) {
  const [width, setWidth] = useState(0);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => move(event.nativeEvent.locationX),
      onPanResponderMove: (event) => move(event.nativeEvent.locationX),
    })
  ).current;

  const state = useRef({ width: 0, range });
  state.current = { width, range };

  function move(x: number) {
    const { width: trackWidth, range: current } = state.current;
    if (!trackWidth) return;
    const chapter = Math.round((x / trackWidth) * (total - 1));
    const clamped = Math.min(total - 1, Math.max(0, chapter));
    // Whichever handle is nearer is the one you meant to grab.
    const toFrom = Math.abs(clamped - current.from) <= Math.abs(clamped - current.to);
    onChange(
      toFrom
        ? { from: Math.min(clamped, current.to), to: current.to }
        : { from: current.from, to: Math.max(clamped, current.from) }
    );
  }

  const left = (range.from / Math.max(1, total - 1)) * width;
  const right = (range.to / Math.max(1, total - 1)) * width;

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={styles.rangeTrack}
      {...responder.panHandlers}
    >
      <View style={[styles.rail, { backgroundColor: track }]} />
      <View style={[styles.rail, { backgroundColor: tint, left, width: Math.max(2, right - left) }]} />
      <View style={[styles.handle, { backgroundColor: tint, left: Math.max(0, left - 7) }]} />
      <View style={[styles.handle, { backgroundColor: tint, left: Math.max(0, right - 7) }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  dot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  degree: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  empty: { position: 'absolute', alignSelf: 'center', top: '48%' },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.xl,
    marginTop: space.md,
  },
  rangeTrack: { height: 32, justifyContent: 'center', marginTop: space.xs },
  rail: { position: 'absolute', height: 3, borderRadius: 2, left: 0, right: 0 },
  handle: { position: 'absolute', width: 14, height: 14, borderRadius: 7 },
});
