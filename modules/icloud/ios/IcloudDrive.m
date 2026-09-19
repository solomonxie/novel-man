#import <React/RCTBridgeModule.h>

// The Swift class above, named for React Native's module registry. Every call
// is a promise: reaching the ubiquity container blocks, so none of it belongs
// on the main thread.
@interface RCT_EXTERN_MODULE (IcloudDrive, NSObject)

RCT_EXTERN_METHOD(status
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(copyIn
                  : (NSString *)fromPath name
                  : (NSString *)name resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(copyOut
                  : (NSString *)name toPath
                  : (NSString *)toPath resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(latest
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(list
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(remove
                  : (NSString *)name resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)

@end
