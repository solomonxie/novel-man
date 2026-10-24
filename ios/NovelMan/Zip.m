#import <React/RCTBridgeModule.h>
#import <zlib.h>

/**
 * One file into a one-entry .zip, off the JS thread.
 *
 * The daily database copy is 60 MB; deflating it in Hermes would take most of
 * a minute and move every byte through base64. zlib streams it in a second.
 */
@interface Zip : NSObject <RCTBridgeModule>
@end

static void put16(FILE *f, uint16_t v) { fputc(v & 0xff, f); fputc(v >> 8, f); }
static void put32(FILE *f, uint32_t v) { put16(f, v & 0xffff); put16(f, v >> 16); }

static void dosTime(uint16_t *time, uint16_t *date) {
  NSDateComponents *c = [[NSCalendar currentCalendar]
      components:NSCalendarUnitYear | NSCalendarUnitMonth | NSCalendarUnitDay |
                 NSCalendarUnitHour | NSCalendarUnitMinute | NSCalendarUnitSecond
        fromDate:[NSDate date]];
  *time = (uint16_t)((c.hour << 11) | (c.minute << 5) | (c.second / 2));
  *date = (uint16_t)(((c.year - 1980) << 9) | (c.month << 5) | c.day);
}

static void localHeader(FILE *f, const char *name, uint16_t nameLength, uint16_t time,
                        uint16_t date, uint32_t crc, uint32_t packed, uint32_t size) {
  put32(f, 0x04034b50);
  put16(f, 20); put16(f, 0); put16(f, 8); put16(f, time); put16(f, date);
  put32(f, crc); put32(f, packed); put32(f, size);
  put16(f, nameLength); put16(f, 0);
  fwrite(name, 1, nameLength, f);
}

static NSString *zipFile(NSString *source, NSString *target, NSString *entry) {
  FILE *in = fopen(source.fileSystemRepresentation, "rb");
  if (!in) return @"cannot read the file";
  FILE *out = fopen(target.fileSystemRepresentation, "wb");
  if (!out) { fclose(in); return @"cannot write the zip"; }

  const char *name = entry.UTF8String;
  uint16_t nameLength = (uint16_t)strlen(name);
  uint16_t time, date;
  dosTime(&time, &date);
  localHeader(out, name, nameLength, time, date, 0, 0, 0);

  z_stream z = {0};
  if (deflateInit2(&z, 6, Z_DEFLATED, -MAX_WBITS, 8, Z_DEFAULT_STRATEGY) != Z_OK) {
    fclose(in); fclose(out); return @"cannot start deflate";
  }
  enum { CHUNK = 1 << 18 };
  unsigned char *buffer = malloc(CHUNK), *packedBuffer = malloc(CHUNK);
  uLong crc = crc32(0L, Z_NULL, 0);
  uint64_t size = 0, packed = 0;
  int flush;
  do {
    size_t read = fread(buffer, 1, CHUNK, in);
    crc = crc32(crc, buffer, (uInt)read);
    size += read;
    flush = feof(in) ? Z_FINISH : Z_NO_FLUSH;
    z.next_in = buffer;
    z.avail_in = (uInt)read;
    do {
      z.next_out = packedBuffer;
      z.avail_out = CHUNK;
      deflate(&z, flush);
      size_t have = CHUNK - z.avail_out;
      fwrite(packedBuffer, 1, have, out);
      packed += have;
    } while (z.avail_out == 0);
  } while (flush != Z_FINISH);
  deflateEnd(&z);
  free(buffer);
  free(packedBuffer);
  BOOL failed = ferror(in) || ferror(out);
  fclose(in);
  if (failed || size > UINT32_MAX || packed > UINT32_MAX) {
    fclose(out);
    return @"too large or unreadable";
  }

  uint32_t central = (uint32_t)ftell(out);
  put32(out, 0x02014b50);
  put16(out, 20); put16(out, 20); put16(out, 0); put16(out, 8); put16(out, time); put16(out, date);
  put32(out, (uint32_t)crc); put32(out, (uint32_t)packed); put32(out, (uint32_t)size);
  put16(out, nameLength); put16(out, 0); put16(out, 0); put16(out, 0); put16(out, 0);
  put32(out, 0); put32(out, 0);
  fwrite(name, 1, nameLength, out);
  uint32_t centralSize = (uint32_t)ftell(out) - central;
  put32(out, 0x06054b50);
  put16(out, 0); put16(out, 0); put16(out, 1); put16(out, 1);
  put32(out, centralSize); put32(out, central); put16(out, 0);

  // The sizes are only known now; the local header goes back in with them.
  fseek(out, 0, SEEK_SET);
  localHeader(out, name, nameLength, time, date, (uint32_t)crc, (uint32_t)packed, (uint32_t)size);
  failed = ferror(out);
  if (fclose(out) != 0 || failed) return @"cannot finish the zip";
  return nil;
}

@implementation Zip

RCT_EXPORT_MODULE(Zip)

RCT_EXPORT_METHOD(file
                  : (NSString *)source to
                  : (NSString *)target entry
                  : (NSString *)entry resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    NSString *problem = zipFile(source, target, entry);
    if (problem) {
      [[NSFileManager defaultManager] removeItemAtPath:target error:nil];
      reject(@"zip", problem, nil);
    } else {
      resolve(nil);
    }
  });
}

@end
