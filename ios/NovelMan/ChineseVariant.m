#import <React/RCTBridgeModule.h>

/**
 * 简体 ⇄ 繁體, done by the phone.
 *
 * The two are one language written two ways, so a model asked to "translate"
 * between them is being paid to look up a character table iOS already carries:
 * ICU ships the mapping, `CFStringTransform` is the door to it, and the answer
 * comes back offline, instantly, and for nothing.
 *
 * The transform is an ICU identifier — `Hans-Hant` or `Hant-Hans`. If ICU has
 * no such transform the call rejects rather than returning the text unchanged,
 * so the caller can fall back to the model instead of writing a "translation"
 * that is a copy of the source.
 */
@interface ChineseVariant : NSObject <RCTBridgeModule>
@end

@implementation ChineseVariant

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

RCT_EXPORT_METHOD(convert
                  : (NSString *)text to
                  : (NSString *)transform resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  NSMutableString *out = [text mutableCopy];
  if (!CFStringTransform((__bridge CFMutableStringRef)out, NULL, (__bridge CFStringRef)transform, false)) {
    reject(@"unavailable", [NSString stringWithFormat:@"No ICU transform %@", transform], nil);
    return;
  }
  resolve(out);
}

@end
