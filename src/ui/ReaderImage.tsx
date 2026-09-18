import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';

/**
 * A figure on the page, at the width of the text and its own proportions.
 * Nothing about a picture is known until it loads, and guessing a height makes
 * the page jump under a reader's eyes — so it starts at a modest box and
 * settles into its real shape once the size comes back.
 */
export function ReaderImage({ uri, alt, width, tint, cap, ink, formula }: {
  uri: string;
  alt: string;
  width: number;
  tint: string;
  /**
   * A formula is drawn black on nothing at import, so the page it is read on
   * decides its colour — one file that reads on paper and at night both.
   */
  ink?: string;
  formula?: boolean;
  /** Never taller than this: a full-page plate is a wall, not an illustration. */
  cap: number;
}) {
  const [ratio, setRatio] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    Image.getSize(
      uri,
      (imageWidth, imageHeight) => live && imageHeight > 0 && setRatio(imageWidth / imageHeight),
      () => live && setFailed(true)
    );
    return () => {
      live = false;
    };
  }, [uri]);

  // The alt text is the fallback, not a decoration: a figure that will not load
  // still says what it was.
  if (failed) {
    return alt ? <Text style={{ color: tint, fontSize: 13, fontStyle: 'italic' }}>{alt}</Text> : null;
  }

  const height = Math.min(cap, ratio ? width / ratio : width * 0.6);
  return (
    <View>
      <Image
        source={{ uri }}
        style={[
          { width, height, borderRadius: formula ? 0 : 4 },
          formula && ink ? { tintColor: ink } : null,
        ]}
        resizeMode="contain"
        onError={() => setFailed(true)}
      />
      {/* A picture of a formula is the formula; printing its TeX underneath
          every one is a caption nobody reads twice. It stays the fallback. */}
      {alt && !formula ? (
        <Text style={{ color: tint, fontSize: 12, marginTop: 4, textAlign: 'center' }}>{alt}</Text>
      ) : null}
    </View>
  );
}
