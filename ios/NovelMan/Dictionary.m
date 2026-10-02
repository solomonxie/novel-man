#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <UIKit/UIKit.h>

/**
 * The dictionary already on the phone.
 *
 * iOS carries the Oxford and the New Oxford American, every dictionary the
 * reader has downloaded in Settings, and the thesaurus — with definitions,
 * parts of speech and example sentences. `UIReferenceLibraryViewController` is
 * the door to all of it: no key, no network, no vendor, and nothing added to
 * the bundle.
 *
 * `hasDefinition` is asked before the row is offered, because a term the
 * installed dictionaries do not carry opens a sheet that says nothing — and a
 * word in a Chinese novel or a Hebrew name is exactly that. The caller falls
 * back to the web for those rather than showing an empty panel.
 */
@interface NMDictionary : NSObject <RCTBridgeModule>
@end

@implementation NMDictionary

RCT_EXPORT_MODULE(Dictionary)

+ (BOOL)requiresMainQueueSetup
{
  // It presents a view controller, so it is a main-thread object from the start.
  return YES;
}

RCT_EXPORT_METHOD(hasDefinition
                  : (NSString *)term resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  NSString *wanted = [term stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
  if (wanted.length == 0) {
    resolve(@NO);
    return;
  }
  resolve(@([UIReferenceLibraryViewController dictionaryHasDefinitionForTerm:wanted]));
}

RCT_EXPORT_METHOD(show
                  : (NSString *)term resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  NSString *wanted = [term stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
  if (wanted.length == 0) {
    reject(@"empty", @"Nothing to look up", nil);
    return;
  }

  dispatch_async(dispatch_get_main_queue(), ^{
    UIViewController *presenter = RCTPresentedViewController();
    if (presenter == nil) {
      reject(@"unavailable", @"No view controller to present from", nil);
      return;
    }
    UIReferenceLibraryViewController *panel =
        [[UIReferenceLibraryViewController alloc] initWithTerm:wanted];
    // A sheet, so the page behind it stays where the reader left it.
    panel.modalPresentationStyle = UIModalPresentationPageSheet;
    [presenter presentViewController:panel animated:YES completion:^{
      resolve(@YES);
    }];
  });
}

@end
