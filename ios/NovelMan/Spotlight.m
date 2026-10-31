#import <React/RCTBridgeModule.h>
#import <CoreSpotlight/CoreSpotlight.h>
#import <UIKit/UIKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

/**
 * The library in the phone's own search. Every item's identifier is the app
 * route it opens ("/book/…"); `SceneDelegate` turns a tapped one back into a
 * novelman://open link. Everything lives in one domain, replaced whole.
 */
@interface NMSpotlight : NSObject <RCTBridgeModule>
@end

static NSString *const DOMAIN_ID = @"novelman.library";
static const CGFloat THUMB = 180;

static NSData *thumbnail(NSString *path)
{
  if (![path isKindOfClass:NSString.class] || !path.length) return nil;
  UIImage *image = [UIImage imageWithContentsOfFile:path];
  if (!image) return nil;
  CGFloat scale = MIN(1, THUMB / MAX(image.size.width, image.size.height));
  CGSize size = CGSizeMake(round(image.size.width * scale), round(image.size.height * scale));
  UIGraphicsImageRenderer *renderer = [[UIGraphicsImageRenderer alloc] initWithSize:size];
  UIImage *small = [renderer imageWithActions:^(UIGraphicsImageRendererContext *context) {
    [image drawInRect:CGRectMake(0, 0, size.width, size.height)];
  }];
  return UIImageJPEGRepresentation(small, 0.8);
}

static NSString *text(id value)
{
  return [value isKindOfClass:NSString.class] && [value length] ? value : nil;
}

@implementation NMSpotlight

RCT_EXPORT_MODULE(Spotlight)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

RCT_EXPORT_METHOD(replaceAll
                  : (NSArray<NSDictionary *> *)entries resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  if (!CSSearchableIndex.isIndexingAvailable) {
    resolve(@NO);
    return;
  }
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    NSMutableArray<CSSearchableItem *> *items = [NSMutableArray arrayWithCapacity:entries.count];
    for (NSDictionary *entry in entries) {
      NSString *identifier = text(entry[@"id"]);
      NSString *title = text(entry[@"title"]);
      if (!identifier || !title) continue;
      CSSearchableItemAttributeSet *attributes =
          [[CSSearchableItemAttributeSet alloc] initWithContentType:UTTypeText];
      attributes.title = title;
      attributes.contentDescription = text(entry[@"subtitle"]);
      NSArray *keywords = entry[@"keywords"];
      if ([keywords isKindOfClass:NSArray.class]) attributes.keywords = keywords;
      attributes.thumbnailData = thumbnail(entry[@"image"]);
      CSSearchableItem *item = [[CSSearchableItem alloc] initWithUniqueIdentifier:identifier
                                                                  domainIdentifier:DOMAIN_ID
                                                                      attributeSet:attributes];
      item.expirationDate = [NSDate distantFuture];
      [items addObject:item];
    }
    CSSearchableIndex *index = CSSearchableIndex.defaultSearchableIndex;
    [index deleteSearchableItemsWithDomainIdentifiers:@[ DOMAIN_ID ]
                                    completionHandler:^(NSError *cleared) {
      if (cleared) {
        reject(@"spotlight", cleared.localizedDescription, cleared);
        return;
      }
      if (!items.count) {
        resolve(@YES);
        return;
      }
      [index indexSearchableItems:items
                completionHandler:^(NSError *failed) {
        if (failed) reject(@"spotlight", failed.localizedDescription, failed);
        else resolve(@YES);
      }];
    }];
  });
}

@end
