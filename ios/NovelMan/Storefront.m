#import <React/RCTBridgeModule.h>
#import <StoreKit/StoreKit.h>

/**
 * Which App Store sold this copy — the three-letter country code
 * (ISO 3166-1 alpha-3, "CHN" for mainland China) StoreKit already carries on
 * the signed-in account's storefront. Not the device's locale, language or
 * IP: those describe the phone, and a Canadian Apple ID sitting in Shanghai
 * or a zh-Hans reader in Vancouver would answer either of those wrong. The
 * storefront is the one property that actually says which store this is.
 *
 * `nil` when nothing has a storefront yet — no App Store session, offline on
 * first launch. The caller's default covers that; it is not asked twice.
 */
@interface NMStorefront : NSObject <RCTBridgeModule>
@end

@implementation NMStorefront

RCT_EXPORT_MODULE(Storefront)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

RCT_EXPORT_METHOD(countryCode
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  NSString *code = SKPaymentQueue.defaultQueue.storefront.countryCode;
  resolve(code ?: [NSNull null]);
}

@end
