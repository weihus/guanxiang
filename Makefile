.DEFAULT_GOAL := pdf
.PHONY: pdf pdf-draft pdf-release pdf-prepare

pdf-prepare:
	npm run validate
	npm run pdf:setup
	npm run generate

pdf: pdf-prepare
	npm run pdf -- --mode all

pdf-draft: pdf-prepare
	npm run pdf -- --mode draft

pdf-release: pdf-prepare
	npm run pdf -- --mode release

.PHONY: pdf-reading
pdf-reading: pdf-prepare
	PDF_EDITION=reading npm run pdf -- --mode draft
	cp pdf/dist/zhouyi-reading-draft.pdf web/public/zhouyi-reading.pdf
