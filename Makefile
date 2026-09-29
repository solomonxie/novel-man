.PHONY: help check ios release screenshots manuscript

.DEFAULT_GOAL := help

help:
	@echo "make ios          Release build onto the paired iPhone"
	@echo "make release      check, then archive + upload to App Store Connect"
	@echo "make release BUILD=202609241830   same, with the build number pinned"
	@echo "make check        typecheck, parsers, catalogs, hooks"
	@echo "make screenshots  SHOTS=<dir>  resize to the App Store slots"
	@echo "make manuscript   URL=\"<url> [url...]\"  [OUT=book.md]  a web page as a book"

check:
	npm run check

install-ios:
	npm run ios

# Archive, sign for the App Store and upload, all of it — no Xcode Organizer.
# Needs ios/Local.xcconfig (Team ID) and the app record already created in
# App Store Connect. Uploads whatever is on disk, so say so when that is not
# a commit.
release: check
	@git diff --quiet HEAD -- || echo "warning: uncommitted changes are going into this build"
	scripts/release-ios.sh $(BUILD)

screenshots:
	scripts/store-screenshots.sh $(SHOTS)

# A page, or a series of them, as one Markdown file the app reads as chapters.
# Converted here so it can be read before it is imported: a blog page is an
# article wrapped in a masthead, a sidebar and a column of comments.
manuscript:
	@python3 tools/fetch-manuscript.py $(URL) $(if $(OUT),-o $(OUT))
