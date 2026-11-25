import { readFile, rename, writeFile } from 'node:fs/promises';
import { PDFDocument, PDFHexString, PDFName, PDFNumber } from 'pdf-lib';

export async function setPrintedPageLabels(path) {
  const document = await PDFDocument.load(await readFile(path), { updateMetadata: false });
  if (document.getPageCount() < 3) throw new Error('PDF须包含封面、目录和正文');
  const labels = document.context.obj({
    Nums: [
      0, { P: PDFHexString.fromText('封面') },
      1, { P: PDFHexString.fromText('目录') },
      2, { S: PDFName.of('D'), St: PDFNumber.of(1) },
    ],
  });
  document.catalog.set(PDFName.of('PageLabels'), labels);
  const temporary = `${path}.labels.tmp`;
  await writeFile(temporary, await document.save({ useObjectStreams: false }));
  await rename(temporary, path);
}
