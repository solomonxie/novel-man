#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <UIKit/UIKit.h>

/**
 * Which character of the page is under a finger.
 *
 * A tap on read-only text changes no selection, so the text view never says
 * where it landed; the reader needs to know to open the highlight it hit.
 */
@interface NMTextOffset : NSObject <RCTBridgeModule>
@end

@implementation NMTextOffset

RCT_EXPORT_MODULE(TextOffset)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

RCT_EXPORT_METHOD(at
                  : (double)x y
                  : (double)y resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    UIWindow *window = RCTKeyWindow();
    CGPoint point = CGPointMake(x, y);
    UIView *hit = [window hitTest:point withEvent:nil];
    while (hit && ![hit isKindOfClass:[UITextView class]]) {
      hit = hit.superview;
    }
    if (!hit) {
      resolve([NSNull null]);
      return;
    }
    UITextView *text = (UITextView *)hit;
    UITextRange *character = [text characterRangeAtPoint:[window convertPoint:point toView:text]];
    if (!character) {
      resolve([NSNull null]);
      return;
    }
    resolve(@([text offsetFromPosition:text.beginningOfDocument toPosition:character.start]));
  });
}

@end
