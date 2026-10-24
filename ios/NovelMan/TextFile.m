#import <React/RCTBridgeModule.h>

/**
 * A text file read in whatever encoding it was saved in.
 *
 * Hermes has no TextDecoder, and a CSV saved by Excel in China is GB18030.
 * iOS carries that table; the bundle should not.
 */
@interface TextFile : NSObject <RCTBridgeModule>
@end

static NSString *decode(NSData *data) {
  const unsigned char *b = data.bytes;
  NSUInteger n = data.length;
  if (n >= 3 && b[0] == 0xef && b[1] == 0xbb && b[2] == 0xbf) {
    return [[NSString alloc] initWithData:[data subdataWithRange:NSMakeRange(3, n - 3)]
                                 encoding:NSUTF8StringEncoding];
  }
  if (n >= 2 && ((b[0] == 0xff && b[1] == 0xfe) || (b[0] == 0xfe && b[1] == 0xff))) {
    return [[NSString alloc] initWithData:data encoding:NSUTF16StringEncoding];
  }
  NSString *text = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  if (text) return text;
  NSStringEncoding gb = CFStringConvertEncodingToNSStringEncoding(kCFStringEncodingGB_18030_2000);
  text = [[NSString alloc] initWithData:data encoding:gb];
  if (text) return text;
  NSStringEncoding big5 = CFStringConvertEncodingToNSStringEncoding(kCFStringEncodingBig5_HKSCS_1999);
  text = [[NSString alloc] initWithData:data encoding:big5];
  return text ?: [[NSString alloc] initWithData:data encoding:NSWindowsCP1252StringEncoding];
}

@implementation TextFile

RCT_EXPORT_MODULE(TextFile)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

RCT_EXPORT_METHOD(read
                  : (NSString *)path resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSData *data = [NSData dataWithContentsOfFile:path];
    NSString *text = data ? decode(data) : nil;
    if (text) resolve([text stringByReplacingOccurrencesOfString:@"\r\n" withString:@"\n"]);
    else reject(@"text", data ? @"unknown encoding" : @"cannot read the file", nil);
  });
}

@end
